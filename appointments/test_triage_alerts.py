import datetime as dt
from unittest import mock

from django.utils import timezone

from secure_messaging.models import AuditEvent, SecureMessage, Thread, ThreadMember
from users.models import Registration
from users.test_ed_board import EdBoardBase

from . import triage_service as service
from .models import ClinicalNote, FlowsheetTemplate, TriageSettings, VitalSignsFlowsheet


class SafetyAlertTests(EdBoardBase):
    """A signed triage note with a positive suicide screen or an unsafe-at-home answer tells the right people at once."""

    def setUp(self):
        super().setUp()
        self.patient.date_of_birth = timezone.localdate() - dt.timedelta(days=40 * 365)
        self.patient.legal_sex = "F"
        self.patient.save()
        self.vid = self.er_visit()
        self.visit = Registration.objects.get(pk=self.vid)
        self.appt = self.visit.appointment
        template, _ = FlowsheetTemplate.objects.get_or_create(code="vital_signs", defaults={"name": "Vital Signs"})
        VitalSignsFlowsheet.objects.create(organization=self.org, template=template, appointment=self.appt, patient=self.patient_user,
                                           columns=[{"id": "c1", "timestamp": timezone.now().isoformat()}], data={"heart_rate": {"c1": "88"}})

    def note(self, **answers):
        data = {"chief_complaint": "chest_pain", "esi_b_high_risk": True, "esi_level": 2}
        data.update(answers)
        return ClinicalNote.objects.create(organization=self.org, appointment=self.appt, patient=self.patient_user, author=self.nurse,
                                           note_type="nursing_assessment", documentation_type="triage_note", structured_data=data)

    def sign(self, note):
        return self.as_(self.nurse).post(f"/api/clinical-notes/{note.pk}/sign/")

    def choose(self, *users):
        TriageSettings.objects.update_or_create(organization=self.org, defaults={"alert_user_ids": [u.pk for u in users]})

    def thread(self):
        return Thread.objects.get(kind=Thread.PATIENT, patient=self.patient_user)

    # ---- when it fires ----
    def test_a_clean_note_sends_nothing(self):
        r = self.sign(self.note())
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn("safety_alert", r.json())
        self.assertEqual(SecureMessage.objects.count(), 0)

    def test_a_referral_level_screen_does_not_alert(self):
        r = self.sign(self.note(cssrs_1="yes", cssrs_2="yes", cssrs_3="yes"))
        self.assertNotIn("safety_alert", r.json())
        self.assertEqual(SecureMessage.objects.count(), 0)

    def test_intent_or_plan_alerts(self):
        for answers in ({"cssrs_2": "yes", "cssrs_4": "yes"}, {"cssrs_2": "yes", "cssrs_5": "yes"}, {"cssrs_6": "yes", "cssrs_6_recent": "yes"}):
            SecureMessage.objects.all().delete()
            r = self.sign(self.note(**answers))
            self.assertEqual(r.json()["safety_alert"]["reasons"], [service.SUICIDE_ALERT], answers)

    def test_unsafe_at_home_alerts(self):
        r = self.sign(self.note(screen_unsafe_home="yes"))
        self.assertEqual(r.json()["safety_alert"]["reasons"], [service.UNSAFE_HOME_ALERT])

    def test_both_reasons_make_one_message(self):
        r = self.sign(self.note(cssrs_4="yes", cssrs_2="yes", screen_unsafe_home="yes"))
        self.assertEqual(len(r.json()["safety_alert"]["reasons"]), 2)
        self.assertEqual(SecureMessage.objects.count(), 1)

    # ---- who is told ----
    def test_with_nobody_chosen_the_nurse_is_told_to_phone(self):
        r = self.sign(self.note(cssrs_2="yes", cssrs_4="yes"))
        alert = r.json()["safety_alert"]
        self.assertFalse(alert["sent"])
        self.assertEqual(alert["message"], service.NOBODY_TOLD)
        message = SecureMessage.objects.get()
        self.assertEqual(message.priority, "urgent")
        self.assertTrue(message.body.startswith("SAFETY ALERT from triage."))
        self.assertEqual(r.status_code, 200)

    def test_chosen_people_are_added_and_told(self):
        self.choose(self.doctor, self.admin)
        r = self.sign(self.note(cssrs_2="yes", cssrs_4="yes"))
        alert = r.json()["safety_alert"]
        self.assertTrue(alert["sent"])
        self.assertEqual(len(alert["told"]), 2)
        members = set(ThreadMember.objects.filter(thread=self.thread(), left_at__isnull=True).values_list("user_id", flat=True))
        self.assertEqual(members, {self.nurse.pk, self.doctor.pk, self.admin.pk})
        self.assertEqual(SecureMessage.objects.get().visit_id, self.vid)

    def test_the_visits_care_team_is_told_too(self):
        Registration.objects.filter(pk=self.vid).update(attending_provider=self.doctor, assigned_nurse=self.nurse2 if hasattr(self, "nurse2") else None)
        r = self.sign(self.note(cssrs_2="yes", cssrs_4="yes"))
        self.assertTrue(r.json()["safety_alert"]["sent"])
        self.assertIn(self.doctor.pk, ThreadMember.objects.filter(thread=self.thread()).values_list("user_id", flat=True))

    def test_the_alert_is_logged(self):
        self.sign(self.note(screen_unsafe_home="yes"))
        self.assertTrue(AuditEvent.objects.filter(action="send", detail__contains="safety alert").exists())

    def test_a_second_alert_reuses_the_thread(self):
        self.sign(self.note(screen_unsafe_home="yes"))
        self.sign(self.note(cssrs_2="yes", cssrs_4="yes"))
        self.assertEqual(Thread.objects.filter(kind=Thread.PATIENT).count(), 1)
        self.assertEqual(SecureMessage.objects.count(), 2)

    def test_chosen_people_who_cannot_be_messaged_are_skipped(self):
        TriageSettings.objects.update_or_create(organization=self.org, defaults={"alert_user_ids": [self.registrar.pk, self.doctor.pk, 999999]})
        r = self.sign(self.note(screen_unsafe_home="yes"))
        members = set(ThreadMember.objects.filter(thread=self.thread()).values_list("user_id", flat=True))
        self.assertIn(self.doctor.pk, members)
        self.assertNotIn(self.registrar.pk, members)
        self.assertTrue(r.json()["safety_alert"]["sent"])

    def test_a_failed_alert_never_stops_the_signing(self):
        note = self.note(cssrs_2="yes", cssrs_4="yes")
        with mock.patch.object(service, "_send_safety_alert", side_effect=RuntimeError("boom")):
            r = self.sign(note)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "signed")
        self.assertFalse(r.json()["safety_alert"]["sent"])
        self.assertEqual(r.json()["safety_alert"]["message"], service.NOT_SENT)
        note.refresh_from_db()
        self.assertEqual(note.status, "signed")

    # ---- the setting ----
    def test_settings_list_who_can_be_picked(self):
        body = self.as_(self.nurse).get("/api/triage/settings/").json()
        ids = {p["id"] for p in body["people"]}
        self.assertIn(self.doctor.pk, ids)
        self.assertIn(self.nurse.pk, ids)
        self.assertNotIn(self.registrar.pk, ids)
        self.assertNotIn(self.patient_user.pk, ids)
        self.assertEqual(body["alert_user_ids"], [])

    def test_only_an_admin_saves_the_alert_people(self):
        r = self.as_(self.nurse).put("/api/triage/settings/", {"alert_user_ids": [self.doctor.pk]}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.as_(self.admin).put("/api/triage/settings/", {"alert_user_ids": [self.doctor.pk, self.doctor.pk, self.nurse.pk]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["alert_user_ids"], [self.doctor.pk, self.nurse.pk])
        self.assertEqual(self.as_(self.admin).put("/api/triage/settings/", {"alert_user_ids": []}, format="json").json()["alert_user_ids"], [])

    def test_bad_alert_people_are_refused(self):
        from appointments.test_locations import make_user

        outsider = make_user("out2", "nurse", self.other_org)
        for bad in ([self.registrar.pk], [outsider.pk], [self.patient_user.pk], ["1"], [True], "x", [999999], list(range(1, 30))):
            r = self.as_(self.admin).put("/api/triage/settings/", {"alert_user_ids": bad}, format="json")
            self.assertEqual(r.status_code, 400, bad)
