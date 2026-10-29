"""
Custom reports (Reports module).

    python manage.py test staffing.test_custom_reports
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import custom_reports as engine
from .models import CustomReport, Staff, StaffShift, Unit

BASE = "/api/staffing/custom-reports"
MON = datetime.date(2026, 10, 26)
SUN = datetime.date(2026, 11, 1)


def make_patient(user, **fields):
    """The patient profile a new patient user gets automatically, with these fields set."""
    from users.models import Patient

    profile = Patient.objects.get(user=user)
    for k, v in fields.items():
        setattr(profile, k, v)
    profile.save()
    return profile


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def shift(org, staff, unit, day, start=7, end=19, kind="night"):
    return StaffShift.objects.create(
        organization=org, staff=staff, unit=unit, date=day, shift_type=kind,
        start_time=datetime.time(start), end_time=datetime.time(end),
    )


class EngineTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.icu = Unit.objects.create(organization=self.org, name="ICU")
        self.ed = Unit.objects.create(organization=self.org, name="ED")
        self.ann = Staff.objects.create(organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse", nursing_role="rn")
        self.bo = Staff.objects.create(organization=self.org, first_name="Bo", last_name="Kim", profession="Nurse", nursing_role="rn")
        # Ann works four 12-hour shifts in the ICU: 48 hours, 12 over the 36-hour cap.
        for d in range(4):
            shift(self.org, self.ann, self.icu, MON + datetime.timedelta(days=d), start=7, end=19)
        shift(self.org, self.bo, self.ed, MON, start=7, end=19)
        # Another organization's shift must never show up.
        stranger = Staff.objects.create(organization=self.other, first_name="X", last_name="Y", profession="Nurse")
        shift(self.other, stranger, None, MON)

    def run_cfg(self, source, config, **kw):
        return engine.run_report(source, self.org, config, MON, SUN, **kw)

    def test_group_by_unit_sums_hours_and_counts_people(self):
        res = self.run_cfg("shifts", {"group_by": "unit", "columns": ["unit", "shifts", "hours", "people"], "sort": {"field": "hours", "dir": "desc"}})
        rows = {r["unit"]: r for r in res["rows"]}
        self.assertEqual(set(rows), {"ICU", "ED"})
        self.assertEqual(rows["ICU"]["shifts"], 4)
        self.assertEqual(rows["ICU"]["people"], 1)
        self.assertEqual(res["rows"][0]["unit"], "ICU")  # most hours first
        self.assertEqual(res["totals"]["shifts"], 5)
        self.assertEqual(res["totals"]["people"], 2)

    def test_other_organizations_are_never_included(self):
        res = self.run_cfg("shifts", {"columns": ["staff", "shifts"]})
        self.assertEqual(len(res["rows"]), 5)
        self.assertNotIn("Y, X", {r["staff"] for r in res["rows"]})

    def test_overtime_is_hours_above_36_in_a_week(self):
        res = self.run_cfg(
            "hours_overtime",
            {"group_by": "unit", "columns": ["unit", "hours", "overtime_hours", "overtime_pct"],
             "highlight": {"field": "overtime_pct", "op": "gt", "value": 3}},
        )
        icu = next(r for r in res["rows"] if r["unit"] == "ICU")
        self.assertEqual(icu["hours"], 48)
        self.assertEqual(icu["overtime_hours"], 12)
        self.assertEqual(icu["overtime_pct"], 25.0)
        self.assertTrue(icu["_flag"])
        ed = next(r for r in res["rows"] if r["unit"] == "ED")
        self.assertEqual(ed["overtime_hours"], 0)
        self.assertFalse(ed["_flag"])

    def test_filters_and_viewer_narrowing(self):
        cfg = {"group_by": "unit", "columns": ["unit", "shifts"], "filters": [{"field": "role", "op": "is", "value": "RN"}]}
        self.assertEqual(len(self.run_cfg("shifts", cfg)["rows"]), 2)
        res = self.run_cfg("shifts", cfg, narrow=[{"field": "unit", "op": "any_of", "value": ["ED"]}])
        self.assertEqual([r["unit"] for r in res["rows"]], ["ED"])
        none = self.run_cfg("shifts", {**cfg, "filters": [{"field": "role", "op": "is", "value": "LPN"}]})
        self.assertEqual(none["rows"], [])

    def test_tiles(self):
        cfg = {"group_by": "unit", "columns": ["unit", "hours", "overtime_hours", "overtime_pct"],
               "highlight": {"field": "overtime_pct", "op": "gt", "value": 3},
               "tiles": [{"field": "overtime_hours", "agg": "sum", "label": "Overtime"}, {"field": "_flagged"}, {"field": "overtime_pct"}]}
        tiles = self.run_cfg("hours_overtime", cfg)["tiles"]
        self.assertEqual([t["value"] for t in tiles], [12, 1, 20.0])

    def test_unscheduled_staff(self):
        Staff.objects.create(organization=self.org, first_name="Cy", last_name="Zed", profession="CNA")
        res = self.run_cfg("unscheduled", {"columns": ["staff", "profession"]})
        self.assertEqual([r["staff"] for r in res["rows"]], ["Zed, Cy"])

    def test_clean_config_drops_bad_columns_and_rejects_bad_group(self):
        cfg = engine.clean_config("shifts", {"group_by": "unit", "columns": ["staff", "hours", "nope"]})
        self.assertEqual(cfg["columns"], ["unit", "hours"])  # grouped reports show the group field plus measures
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("shifts", {"group_by": "hours"})
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("shifts", {"filters": [{"field": "unit", "op": "regex", "value": "x"}]})
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("nope", {})

    def test_range_is_checked(self):
        with self.assertRaises(engine.ReportConfigError):
            engine.run_report("shifts", self.org, {}, SUN, MON)
        with self.assertRaises(engine.ReportConfigError):
            engine.run_report("shifts", self.org, {}, MON, MON + datetime.timedelta(days=500))


class CustomReportApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(username="n", password="x", role="nurse", organization=self.org)
        self.nurse2 = CustomUser.objects.create_user(username="n2", password="x", role="nurse", organization=self.org)
        self.patient = CustomUser.objects.create_user(username="p", password="x", role="patient", organization=self.org)
        self.outsider = CustomUser.objects.create_user(username="o", password="x", role="admin", organization=self.other)

    def make(self, user, **kw):
        body = {"name": "Weekly hours", "source": "shifts", "config": {"group_by": "unit", "columns": ["unit", "hours"]},
                "audience": "me"}
        body.update(kw)
        return client_for(user).post(f"{BASE}/", body, format="json")

    def test_create_cleans_config_and_sets_owner(self):
        r = self.make(self.nurse)
        self.assertEqual(r.status_code, 201, r.content)
        rep = CustomReport.objects.get()
        self.assertEqual(rep.created_by, self.nurse)
        self.assertEqual(rep.organization, self.org)
        self.assertEqual(rep.config["columns"], ["unit", "hours"])

    def test_bad_source_or_name_is_rejected(self):
        self.assertEqual(self.make(self.nurse, source="nope").status_code, 400)
        self.assertEqual(self.make(self.nurse, name=" ").status_code, 400)
        self.assertEqual(self.make(self.nurse, audience="roles", audience_roles=[]).status_code, 400)

    def test_patients_cannot_use_reports(self):
        self.assertEqual(client_for(self.patient).get(f"{BASE}/").status_code, 403)
        self.assertEqual(self.make(self.patient).status_code, 403)

    def test_visibility_follows_the_audience(self):
        self.make(self.nurse, name="Private")
        self.make(self.nurse, name="Roles", audience="roles", audience_roles=["admin"])
        self.make(self.nurse, name="Everyone", audience="org")
        names = lambda u: sorted(r["name"] for r in client_for(u).get(f"{BASE}/").json())  # noqa: E731
        self.assertEqual(names(self.nurse), ["Everyone", "Private", "Roles"])
        self.assertEqual(names(self.nurse2), ["Everyone"])
        self.assertEqual(names(self.admin), ["Everyone", "Private", "Roles"])
        self.assertEqual(names(self.outsider), [])

    def test_only_owner_or_admin_can_edit_and_delete(self):
        pk = self.make(self.nurse, audience="org").json()["id"]
        self.assertEqual(client_for(self.nurse2).patch(f"{BASE}/{pk}/", {"name": "Hijacked"}, format="json").status_code, 403)
        self.assertEqual(client_for(self.nurse2).delete(f"{BASE}/{pk}/").status_code, 403)
        self.assertEqual(client_for(self.admin).patch(f"{BASE}/{pk}/", {"name": "Renamed"}, format="json").status_code, 200)
        self.assertEqual(client_for(self.outsider).delete(f"{BASE}/{pk}/").status_code, 404)
        self.assertEqual(client_for(self.nurse).delete(f"{BASE}/{pk}/").status_code, 204)

    def test_run_returns_rows_and_stamps_last_run(self):
        unit = Unit.objects.create(organization=self.org, name="ICU")
        ann = Staff.objects.create(organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse")
        shift(self.org, ann, unit, MON)
        pk = self.make(self.nurse).json()["id"]
        r = client_for(self.nurse).post(f"{BASE}/{pk}/run/", {"start": MON.isoformat(), "end": SUN.isoformat()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["rows"][0]["unit"], "ICU")
        self.assertIsNotNone(CustomReport.objects.get(pk=pk).last_run_at)
        bad = client_for(self.nurse).post(f"{BASE}/{pk}/run/", {"start": "nope", "end": SUN.isoformat()}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(client_for(self.nurse2).post(f"{BASE}/{pk}/run/", {"start": MON.isoformat(), "end": SUN.isoformat()}, format="json").status_code, 404)

    def test_preview_and_sources(self):
        r = client_for(self.nurse).post(
            f"{BASE}/preview/",
            {"source": "roster", "config": {"columns": ["staff", "status"]}},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["rows"], [])
        src = client_for(self.nurse).get(f"{BASE}/sources/").json()
        self.assertIn("hours_overtime", {s["key"] for s in src})
        self.assertTrue(all("load" not in s for s in src))


class CommunicatorSourceTests(TestCase):
    def setUp(self):
        from communicator.models import Contact, MessageLog

        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(username="n", password="x", role="nurse", organization=self.org)
        self.stranger = CustomUser.objects.create_user(username="s", password="x", role="admin", organization=self.other)
        MessageLog.objects.create(user=self.admin, recipient="+15551230001", body="Hi", message_type="sms", status="sent")
        MessageLog.objects.create(organization=self.org, recipient="+15551230002", body="Hi", message_type="sms", status="failed")
        MessageLog.objects.create(organization=self.org, recipient="+15551230003", body="Hi", message_type="sms", status="blocked_opted_out")
        MessageLog.objects.create(user=self.admin, recipient="a@example.com", subject="Hello", body="Hi", message_type="email", status="sent")
        MessageLog.objects.create(organization=self.org, recipient="+15551230002", body="Webhook: STOP", message_type="webhook", status="received")
        MessageLog.objects.create(user=self.stranger, recipient="+15559990000", body="Hi", message_type="sms", status="sent")
        Contact.objects.create(name="Pat Doe", uploaded_by=self.admin, sms_opt_out=True)
        Contact.objects.create(name="Sam Roe", uploaded_by=self.admin)
        Contact.objects.create(name="Other Org", uploaded_by=self.stranger)
        from django.utils import timezone

        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, source, config):
        return engine.run_report(source, self.org, config, self.start, self.end)

    def test_messages_by_channel(self):
        res = self.run_cfg(
            "comm_messages",
            {"group_by": "channel", "columns": ["channel", "messages", "sent", "failed", "blocked", "failure_pct"],
             "sort": {"field": "messages", "dir": "desc"}},
        )
        rows = {r["channel"]: r for r in res["rows"]}
        self.assertEqual(rows["SMS"]["messages"], 3)  # the other organization's text is not counted
        self.assertEqual(rows["SMS"]["failed"], 1)
        self.assertEqual(rows["SMS"]["blocked"], 1)
        self.assertEqual(rows["SMS"]["failure_pct"], 33.3)
        self.assertEqual(rows["Email"]["messages"], 1)
        self.assertEqual(res["totals"]["messages"], 4)

    def test_message_text_is_never_a_field(self):
        keys = {f["key"] for f in engine.source_summary(engine.SOURCES["comm_messages"])["fields"]}
        self.assertNotIn("body", keys)

    def test_replies_by_keyword(self):
        res = self.run_cfg("comm_replies", {"group_by": "keyword", "columns": ["keyword", "replies", "people"]})
        self.assertEqual(res["rows"], [{"keyword": "STOP", "replies": 1, "people": 1, "_flag": False}])

    def test_contacts_by_sms_status(self):
        res = self.run_cfg("comm_contacts", {"group_by": "sms_status", "columns": ["sms_status", "contacts"]})
        rows = {r["sms_status"]: r["contacts"] for r in res["rows"]}
        self.assertEqual(rows, {"Opted out": 1, "Can receive SMS": 1})

    def test_access_follows_the_message_log_right(self):
        names = lambda u: {s["key"] for s in client_for(u).get(f"{BASE}/sources/").json()}  # noqa: E731
        self.assertIn("comm_messages", names(self.admin))
        self.assertNotIn("comm_messages", names(self.nurse))
        self.assertIn("shifts", names(self.nurse))

    def test_a_nurse_cannot_build_preview_or_see_a_communicator_report(self):
        body = {"name": "Failed texts", "source": "comm_messages", "config": {"group_by": "channel", "columns": ["channel", "failed"]}, "audience": "org"}
        self.assertEqual(client_for(self.nurse).post(f"{BASE}/", body, format="json").status_code, 400)
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module"], "communicator")
        self.assertEqual(made.json()["module_label"], "Communicator")
        self.assertEqual(client_for(self.nurse).get(f"{BASE}/").json(), [])
        pk = made.json()["id"]
        run = {"start": self.start.isoformat(), "end": self.end.isoformat()}
        self.assertEqual(client_for(self.nurse).post(f"{BASE}/{pk}/run/", run, format="json").status_code, 404)
        self.assertEqual(client_for(self.admin).post(f"{BASE}/{pk}/run/", run, format="json").status_code, 200)
        prev = {"source": "comm_messages", "config": {}, **run}
        self.assertEqual(client_for(self.nurse).post(f"{BASE}/preview/", prev, format="json").status_code, 403)


class SchedulingSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Appointment, Facility, Unit as ApptUnit

        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.patient = CustomUser.objects.create_user(username="p1", password="x", role="patient", organization=self.org)
        self.patient2 = CustomUser.objects.create_user(username="p2", password="x", role="patient", organization=self.org)
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dana", last_name="Lee"
        )
        self.east = Facility.objects.create(organization=self.org, name="East")
        self.west = Facility.objects.create(organization=self.org, name="West")
        self.u_east = ApptUnit.objects.create(facility=self.east, name="East Clinic")
        self.u_west = ApptUnit.objects.create(facility=self.west, name="West Clinic")
        now = timezone.now()

        def appt(patient, status="scheduled", unit=None, minutes=30, **kw):
            return Appointment.all_objects.create(
                organization=self.org, patient=patient, provider=self.doc, title="Visit",
                appointment_datetime=now, duration_minutes=minutes, status=status, unit=unit, **kw,
            )

        appt(self.patient, "completed", self.u_east, arrived=True)
        appt(self.patient, "cancelled", self.u_east)
        appt(self.patient2, "no_show", self.u_west, minutes=60)
        appt(self.patient2, "scheduled", None, is_video=True)
        Appointment.all_objects.create(
            organization=self.other, patient=self.patient, title="Other org", appointment_datetime=now, status="completed"
        )
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None):
        return engine.run_report("appointments", self.org, config, self.start, self.end, user=user)

    def test_outcomes_by_provider(self):
        res = self.run_cfg({"group_by": "provider", "columns": ["provider", "appointments", "completed", "cancelled", "no_shows", "no_show_pct", "patients"]})
        self.assertEqual(len(res["rows"]), 1)
        row = res["rows"][0]
        self.assertEqual(row["provider"], "Dana Lee")
        self.assertEqual((row["appointments"], row["completed"], row["cancelled"], row["no_shows"]), (4, 1, 1, 1))
        self.assertEqual(row["no_show_pct"], 25.0)
        self.assertEqual(row["patients"], 2)  # counted, never named

    def test_no_patient_identity_is_a_field(self):
        keys = {f["key"] for f in engine.source_summary(engine.SOURCES["appointments"])["fields"]}
        self.assertFalse(keys & {"patient", "patient_name", "_patient", "title", "description"})

    def test_hours_booked_and_visit_type(self):
        res = self.run_cfg({"group_by": "visit_type", "columns": ["visit_type", "appointments", "hours_booked"]})
        rows = {r["visit_type"]: r for r in res["rows"]}
        self.assertEqual(rows["Video"]["appointments"], 1)
        self.assertEqual(rows["In person"]["hours_booked"], 2.0)  # 30 + 30 + 60 minutes

    def test_a_facility_limited_user_sees_only_their_facility_and_unplaced_visits(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "appointments"]}, user=self.admin)
        rows = {r["facility"]: r["appointments"] for r in res["rows"]}
        self.assertEqual(rows, {"East": 2, "No location": 1})
        unlimited = self.run_cfg({"group_by": "facility", "columns": ["facility", "appointments"]})
        self.assertEqual({r["facility"] for r in unlimited["rows"]}, {"East", "West", "No location"})

    def test_access_follows_analytics_right(self):
        patient_view = {s["key"] for s in client_for(self.admin).get(f"{BASE}/sources/").json()}
        self.assertIn("appointments", patient_view)
        body = {"name": "No-shows", "source": "appointments", "config": {"group_by": "provider", "columns": ["provider", "no_shows"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Scheduling")


class NotesSourceTests(TestCase):
    def setUp(self):
        from appointments.models import Appointment, ClinicalNote, Facility, Unit as ApptUnit
        from django.utils import timezone

        from .models import ReportAuditLog  # noqa: F401

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org, first_name="Nia", last_name="Park"
        )
        self.registrar = CustomUser.objects.create_user(username="r", password="x", role="registrar", organization=self.org)
        self.pat1 = CustomUser.objects.create_user(username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames")
        self.pat2 = CustomUser.objects.create_user(username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell")
        fac_e = Facility.objects.create(organization=self.org, name="East")
        fac_w = Facility.objects.create(organization=self.org, name="West")
        self.u_e = ApptUnit.objects.create(facility=fac_e, name="East Clinic")
        self.u_w = ApptUnit.objects.create(facility=fac_w, name="West Clinic")
        self.fac_e = fac_e
        now = timezone.now()

        def appt(patient, unit):
            return Appointment.all_objects.create(
                organization=self.org, patient=patient, title="Visit", appointment_datetime=now, unit=unit
            )

        def note(patient, unit, status="draft", **kw):
            n = ClinicalNote.objects.create(
                organization=self.org, appointment=appt(patient, unit), patient=patient, author=self.nurse,
                note_type="nursing_assessment", status=status, **kw,
            )
            return n

        signed = note(self.pat1, self.u_e, "signed")
        ClinicalNote.objects.filter(pk=signed.pk).update(signed_at=signed.created_at + datetime.timedelta(hours=4))
        note(self.pat1, self.u_e)
        note(self.pat2, self.u_w)
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, **kw):
        return engine.run_report("notes_documentation", self.org, config, self.start, self.end, **kw)

    def test_signed_and_draft_counts_by_author(self):
        res = self.run_cfg({"group_by": "author", "columns": ["author", "notes", "signed", "drafts", "signed_pct", "hours_to_sign", "patients"]})
        row = res["rows"][0]
        self.assertEqual(row["author"], "Nia Park")
        self.assertEqual((row["notes"], row["signed"], row["drafts"]), (3, 1, 2))
        self.assertEqual(row["signed_pct"], 33.3)
        self.assertEqual(row["hours_to_sign"], 4.0)
        self.assertEqual(row["patients"], 2)

    def test_note_text_is_a_column(self):
        from appointments.models import ClinicalNote

        ClinicalNote.objects.filter(status="signed").update(subjective="Chest pain", plan="Monitor", structured_data={"pain_score": 7, "sites": ["arm", "jaw"]})
        res = self.run_cfg({"columns": ["patient", "status", "note_text"], "filters": [{"field": "note_text", "op": "contains", "value": "chest"}]})
        self.assertEqual(len(res["rows"]), 1)
        text = res["rows"][0]["note_text"]
        self.assertIn("Subjective: Chest pain", text)
        self.assertIn("Plan: Monitor", text)
        self.assertIn("Pain score: 7", text)
        self.assertIn("Sites: arm, jaw", text)

    def test_patient_names_are_a_column(self):
        res = self.run_cfg({"group_by": "patient", "columns": ["patient", "notes"]})
        self.assertEqual({r["patient"]: r["notes"] for r in res["rows"]}, {"Ann Ames": 2, "Bo Bell": 1})

    def test_hide_phi_replaces_names_and_note_text(self):
        from appointments.models import ClinicalNote

        ClinicalNote.objects.filter(status="signed").update(subjective="Ann Ames reports chest pain")
        cfg = {"columns": ["patient", "status", "note_text"]}
        shown = self.run_cfg(cfg)
        self.assertEqual(shown["phi"], "shown")
        self.assertIn("Ann Ames", str(shown))
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertEqual(hidden["phi"], "hidden")
        self.assertNotIn("Ames", str(hidden))
        self.assertNotIn("Bell", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})
        self.assertEqual({r["note_text"] for r in hidden["rows"]} - {None}, {"[Hidden]"})
        grouped = self.run_cfg({"group_by": "patient", "columns": ["patient", "notes"]}, hide_phi=True)
        self.assertEqual(sorted(r["notes"] for r in grouped["rows"]), [1, 2])  # grouping still works
        self.assertIsNone(self.run_cfg({"group_by": "author", "columns": ["author", "notes"]})["phi"])

    def test_facility_limited_user_sees_only_their_facility(self):
        self.nurse.facilities.add(self.fac_e)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "notes"]}, user=self.nurse)
        self.assertEqual({r["facility"]: r["notes"] for r in res["rows"]}, {"East": 2})

    def test_access_follows_clinical_notes_right(self):
        names = lambda u: {s["key"] for s in client_for(u).get(f"{BASE}/sources/").json()}  # noqa: E731
        self.assertIn("notes_documentation", names(self.nurse))
        self.assertNotIn("notes_documentation", names(self.registrar))

    def test_every_run_is_audit_logged_and_only_admins_can_read_the_log(self):
        from .models import ReportAuditLog

        body = {
            "source": "notes_documentation", "config": {"group_by": "patient", "columns": ["patient", "notes"]},
            "start": self.start.isoformat(), "end": self.end.isoformat(),
        }
        c = client_for(self.nurse)
        r1 = c.post(f"{BASE}/preview/", body, format="json")
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertEqual({r["patient"] for r in r1.json()["rows"]}, {"Ann Ames", "Bo Bell"})
        c.post(f"{BASE}/preview/", body, format="json")  # a re-run while typing: still one entry
        rows = list(ReportAuditLog.objects.values_list("user_id", "action", "row_count", "phi_hidden"))
        self.assertEqual(rows, [(self.nurse.id, "preview", 2, False)])
        hid = c.post(f"{BASE}/preview/", {**body, "hide_phi": True}, format="json").json()
        self.assertEqual({r["patient"] for r in hid["rows"]}, {"Patient 1", "Patient 2"})
        self.assertEqual(ReportAuditLog.objects.filter(phi_hidden=True).count(), 1)
        self.assertEqual(c.get(f"{BASE}/audit/").status_code, 403)
        log = client_for(self.admin).get(f"{BASE}/audit/").json()
        self.assertEqual(len(log), 2)
        self.assertEqual(log[0]["user"], "Nia Park")

    def test_sources_without_patient_data_are_not_audited(self):
        from .models import ReportAuditLog

        body = {
            "source": "appointments", "config": {"group_by": "provider", "columns": ["provider", "appointments"]},
            "start": self.start.isoformat(), "end": self.end.isoformat(),
        }
        self.assertEqual(client_for(self.admin).post(f"{BASE}/preview/", body, format="json").status_code, 200)
        self.assertEqual(ReportAuditLog.objects.count(), 0)


class VisitsSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Facility, Unit as ApptUnit
        from users.models import Patient, Registration

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org, first_name="Nia", last_name="Park"
        )
        u1 = CustomUser.objects.create_user(username="p1", password="x", role="patient", organization=self.org)
        u2 = CustomUser.objects.create_user(username="p2", password="x", role="patient", organization=self.org)
        self.p1 = make_patient(user=u1, organization=self.org, phone_number="3015550111")
        self.p2 = make_patient(user=u2, organization=self.org, phone_number="3015550112")
        self.east = Facility.objects.create(organization=self.org, name="East")
        self.west = Facility.objects.create(organization=self.org, name="West")
        now = timezone.now()

        def visit(patient, care, **kw):
            return Registration.objects.create(patient=patient, organization=self.org, care_setting=care, arrival_time=now, **kw)

        visit(self.p1, "emergency", facility=self.east, esi=2, assigned_nurse=self.nurse,
              discharge_datetime=now + datetime.timedelta(hours=4))
        visit(self.p1, "ambulatory", facility=self.west)
        visit(self.p2, "emergency", facility=None, esi=4)
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None):
        return engine.run_report("visits", self.org, config, self.start, self.end, user=user)

    def test_volume_and_stay_by_care_setting(self):
        res = self.run_cfg({"group_by": "care", "columns": ["care", "visits", "patients", "discharged", "los_hours"]})
        rows = {r["care"]: r for r in res["rows"]}
        self.assertEqual((rows["ED"]["visits"], rows["ED"]["patients"], rows["ED"]["discharged"]), (2, 2, 1))
        self.assertEqual(rows["ED"]["los_hours"], 4.0)
        self.assertEqual(rows["Clinic"]["visits"], 1)

    def test_acuity_and_nurse(self):
        res = self.run_cfg({"group_by": "esi", "columns": ["esi", "visits"]})
        self.assertEqual({r["esi"]: r["visits"] for r in res["rows"]}, {"ESI 2": 1, "ESI 4": 1, "Not triaged": 1})
        res = self.run_cfg({"group_by": "nurse", "columns": ["nurse", "visits"]})
        self.assertEqual({r["nurse"]: r["visits"] for r in res["rows"]}, {"Nia Park": 1, "No nurse": 2})

    def test_no_patient_identity_is_a_field(self):
        keys = {f["key"] for f in engine.source_summary(engine.SOURCES["visits"])["fields"]}
        self.assertFalse(keys & {"patient", "patient_name", "_patient", "reason", "reason_for_visit"})

    def test_a_facility_limited_user_sees_only_their_facility_and_unplaced_visits(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "visits"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["visits"] for r in res["rows"]}, {"East": 1, "No location": 1})

    def test_module_label_on_a_saved_report(self):
        body = {"name": "ED volume", "source": "visits", "config": {"group_by": "care", "columns": ["care", "visits"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Visits")


class OrdersSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Appointment, Facility, Order, Orderable, Unit as ApptUnit

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dana", last_name="Lee"
        )
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        self.east = Facility.objects.create(organization=self.org, name="East")
        self.west = Facility.objects.create(organization=self.org, name="West")
        u_east = ApptUnit.objects.create(facility=self.east, name="East Clinic")
        u_west = ApptUnit.objects.create(facility=self.west, name="West Clinic")
        cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")
        xray = Orderable.objects.create(code="cxr", name="Chest X-ray", category="imaging")
        now = timezone.now()

        def appt(patient, unit):
            return Appointment.all_objects.create(
                organization=self.org, patient=patient, provider=self.doc, title="Visit",
                appointment_datetime=now, duration_minutes=30, unit=unit,
            )

        def order(patient, orderable, unit, **kw):
            return Order.objects.create(
                organization=self.org, appointment=appt(patient, unit), patient=patient, ordering_provider=self.doc,
                orderable=orderable, orderable_name=orderable.name, orderable_category=orderable.category, **kw,
            )

        order(self.ann, cbc, u_east, status="completed", priority="stat", signed_at=now + datetime.timedelta(hours=1),
              completed_at=now + datetime.timedelta(hours=3), signed_by=self.doc, indication="Ann Ames chest pain",
              result_text="Ann Ames WBC 12")
        order(self.ann, xray, u_east, status="active")
        order(self.bo, cbc, u_west, status="discontinued", discontinue_reason="Bo Bell refused")
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("orders", self.org, config, self.start, self.end, user=user, **kw)

    def test_turnaround_by_category(self):
        res = self.run_cfg({"group_by": "category", "columns": ["category", "orders", "completed", "stat", "hours_to_sign", "hours_to_complete", "patients"]})
        rows = {r["category"]: r for r in res["rows"]}
        self.assertEqual((rows["Laboratory"]["orders"], rows["Laboratory"]["completed"], rows["Laboratory"]["stat"]), (2, 1, 1))
        self.assertEqual(rows["Laboratory"]["hours_to_sign"], 1.0)
        self.assertEqual(rows["Laboratory"]["hours_to_complete"], 2.0)  # signed -> completed
        self.assertEqual(rows["Laboratory"]["patients"], 2)
        self.assertEqual(rows["Imaging"]["orders"], 1)

    def test_hide_phi_masks_names_and_free_text(self):
        cfg = {"columns": ["patient", "status", "indication", "result", "discontinue_reason"]}
        shown = self.run_cfg(cfg)
        self.assertEqual(shown["phi"], "shown")
        self.assertIn("Ann Ames", str(shown))
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertEqual(hidden["phi"], "hidden")
        self.assertNotIn("Ames", str(hidden))
        self.assertNotIn("Bell", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_facility_limited_user_sees_only_their_facility(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "orders"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["orders"] for r in res["rows"]}, {"East": 2})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Order turnaround", "source": "orders", "config": {"group_by": "category", "columns": ["category", "orders"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Orders")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="orders", action="run").exists())


class LabsSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Facility, LabReport, LabResultItem, Unit as ApptUnit
        from users.models import Patient, Registration

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dana", last_name="Lee"
        )
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        east = Facility.objects.create(organization=self.org, name="East")
        west = Facility.objects.create(organization=self.org, name="West")
        self.east = east
        u_east = ApptUnit.objects.create(facility=east, name="East Clinic")
        u_west = ApptUnit.objects.create(facility=west, name="West Clinic")
        prof_a = make_patient(user=self.ann, organization=self.org, phone_number="3015550111")
        prof_b = make_patient(user=self.bo, organization=self.org, phone_number="3015550112")
        now = timezone.now()
        v_east = Registration.objects.create(patient=prof_a, organization=self.org, facility=east, unit=u_east, arrival_time=now)
        v_west = Registration.objects.create(patient=prof_b, organization=self.org, facility=west, unit=u_west, arrival_time=now)

        def report(patient, title, visit, items, **kw):
            rep = LabReport.objects.create(
                organization=self.org, patient=patient, title=title, visit=visit,
                collected_at=now, resulted_at=now + datetime.timedelta(hours=2), **kw,
            )
            for n, (name, value, flag) in enumerate(items):
                LabResultItem.objects.create(report=rep, sort_order=n, test_name=name, value=value, abnormal_flag=flag)
            return rep

        report(self.ann, "BMP", v_east, [("Na", "140", ""), ("K", "6.9", "HH"), ("Cr", "1.9", "H")],
               comment="Ann Ames hemolyzed", review_status="reviewed", reviewed_by=self.doc,
               reviewed_at=now + datetime.timedelta(hours=3))
        report(self.ann, "CBC", v_east, [("WBC", "7", "")])
        report(self.bo, "BMP", v_west, [("Na", "128", "L")], comment="Bo Bell repeat")
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("lab_results", self.org, config, self.start, self.end, user=user, **kw)

    def test_results_and_review_by_panel(self):
        res = self.run_cfg({"group_by": "panel", "columns": ["panel", "reports", "results", "abnormal", "critical", "unreviewed", "hours_to_result", "hours_to_review"]})
        rows = {r["panel"]: r for r in res["rows"]}
        bmp = rows["BMP"]
        self.assertEqual((bmp["reports"], bmp["results"], bmp["abnormal"], bmp["critical"], bmp["unreviewed"]), (2, 4, 3, 1, 1))
        self.assertEqual(bmp["hours_to_result"], 2.0)
        self.assertEqual(bmp["hours_to_review"], 1.0)  # resulted -> reviewed, only the reviewed report counts
        self.assertEqual(rows["CBC"]["unreviewed"], 1)

    def test_hide_phi_masks_names_and_comments(self):
        cfg = {"columns": ["patient", "panel", "comment"]}
        self.assertEqual(self.run_cfg(cfg)["phi"], "shown")
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertEqual(hidden["phi"], "hidden")
        self.assertNotIn("Ames", str(hidden))
        self.assertNotIn("Bell", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_facility_limited_user_sees_only_their_facility(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "reports"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["reports"] for r in res["rows"]}, {"East": 2})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Unreviewed labs", "source": "lab_results", "config": {"group_by": "panel", "columns": ["panel", "unreviewed"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Labs")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="lab_results", action="run").exists())


class FlowsheetSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import (
            Appointment, Facility, FlowsheetRowDefinition, FlowsheetTemplate, Unit as ApptUnit, VitalSignsFlowsheet,
        )

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.doc = CustomUser.objects.create_user(username="d", password="x", role="doctor", organization=self.org)
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        self.east = Facility.objects.create(organization=self.org, name="East")
        west = Facility.objects.create(organization=self.org, name="West")
        u_east = ApptUnit.objects.create(facility=self.east, name="East Clinic")
        u_west = ApptUnit.objects.create(facility=west, name="West Clinic")
        tpl = FlowsheetTemplate.objects.create(code="vitals", name="Vital signs")
        FlowsheetRowDefinition.objects.create(template=tpl, section_label="Vitals", key="hr", label="Heart rate", unit="bpm", field_type="numeric")
        FlowsheetRowDefinition.objects.create(template=tpl, section_label="Vitals", key="note", label="Comment", field_type="text")
        now = timezone.now()

        def sheet(patient, unit, readings):
            appt = Appointment.all_objects.create(
                organization=self.org, patient=patient, provider=self.doc, title="Visit",
                appointment_datetime=now, duration_minutes=30, unit=unit,
            )
            columns = [
                {"id": f"c{n}", "timestamp": (now + datetime.timedelta(minutes=n)).isoformat(), "recorded_by": self.doc.pk, "recorded_by_name": "Dana Lee"}
                for n in range(len(readings))
            ]
            data = {"hr": {f"c{n}": v for n, v in enumerate(readings)}}
            return VitalSignsFlowsheet.objects.create(
                organization=self.org, template=tpl, appointment=appt, patient=patient, columns=columns, data=data
            )

        sheet(self.ann, u_east, ["60", "80", "100 bpm"])
        sheet(self.bo, u_west, ["70"])
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("flowsheet_entries", self.org, config, self.start, self.end, user=user, **kw)

    def test_average_lowest_highest_by_item(self):
        res = self.run_cfg({"group_by": "item", "columns": ["item", "readings", "avg_value", "min_value", "max_value", "total_value", "patients", "time_points"]})
        self.assertEqual(len(res["rows"]), 1)  # the text row without a value is not a charted value
        row = res["rows"][0]
        self.assertEqual((row["item"], row["readings"], row["patients"], row["time_points"]), ("Heart rate", 4, 2, 4))
        self.assertEqual((row["avg_value"], row["min_value"], row["max_value"], row["total_value"]), (77.5, 60, 100, 310))

    def test_hide_phi_masks_patient_names(self):
        cfg = {"columns": ["patient", "item", "avg_value"]}
        self.assertEqual(self.run_cfg(cfg)["phi"], "shown")
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertNotIn("Ames", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_facility_limited_user_sees_only_their_facility(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "readings"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["readings"] for r in res["rows"]}, {"East": 3})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Vitals", "source": "flowsheet_entries", "config": {"group_by": "item", "columns": ["item", "avg_value"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Flowsheets")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="flowsheet_entries", action="run").exists())


class VaccineSourceTests(TestCase):
    def setUp(self):
        from appointments.models import ImmunizationItem, PatientImmunization

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        flu = ImmunizationItem.objects.create(organization=self.org, code="flu", name="Influenza")
        mmr = ImmunizationItem.objects.create(organization=self.org, code="mmr", name="MMR")
        today = datetime.date.today()

        def rec(patient, item, **kw):
            return PatientImmunization.all_objects.create(organization=self.org, patient=patient, item=item, given_on=today, **kw)

        rec(self.ann, flu, status="done", vis_given=True, screening_reviewed=True)
        rec(self.bo, flu, status="not_done", not_done_reason="declined", notes="Bo Bell declined")
        rec(self.ann, mmr, status="done")
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("vaccines", self.org, config, self.start, self.end, user=user, **kw)

    def test_given_and_declined_by_vaccine(self):
        res = self.run_cfg({"group_by": "item", "columns": ["item", "records", "given", "not_done", "declined", "declined_pct", "vis_pct", "patients"]})
        rows = {r["item"]: r for r in res["rows"]}
        flu = rows["Influenza"]
        self.assertEqual((flu["records"], flu["given"], flu["not_done"], flu["declined"], flu["patients"]), (2, 1, 1, 1, 2))
        self.assertEqual(flu["declined_pct"], 50.0)
        self.assertEqual(flu["vis_pct"], 100.0)  # of the one dose given
        self.assertEqual(rows["MMR"]["given"], 1)

    def test_hide_phi_masks_names_and_notes(self):
        cfg = {"columns": ["patient", "item", "notes"]}
        self.assertEqual(self.run_cfg(cfg)["phi"], "shown")
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertNotIn("Ames", str(hidden))
        self.assertNotIn("Bell", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Flu uptake", "source": "vaccines", "config": {"group_by": "item", "columns": ["item", "given"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Vaccines")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="vaccines", action="run").exists())


class ReferralSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Referral

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dana", last_name="Lee"
        )
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        now = timezone.now()

        def referral(patient, **kw):
            return Referral.objects.create(organization=self.org, patient=patient, referring_provider=self.doc, **kw)

        referral(self.ann, specialty="Cardiology", status="report_received", sent_at=now, seen_at=now + datetime.timedelta(days=4),
                 report_received_at=now + datetime.timedelta(days=6), reason="Ann Ames chest pain")
        referral(self.bo, specialty="Cardiology", status="sent", sent_at=now, schedule_due=now - datetime.timedelta(days=1))
        referral(self.bo, specialty="Dermatology", status="declined", sent_at=now, status_note="Bo Bell")
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("referrals", self.org, config, self.start, self.end, user=user, **kw)

    def test_progress_and_turnaround_by_specialty(self):
        res = self.run_cfg({"group_by": "specialty", "columns": ["specialty", "referrals", "sent", "seen", "reports", "open", "overdue_schedule", "days_to_seen", "days_to_report", "seen_pct"]})
        rows = {r["specialty"]: r for r in res["rows"]}
        cardio = rows["Cardiology"]
        self.assertEqual((cardio["referrals"], cardio["sent"], cardio["seen"], cardio["reports"], cardio["open"], cardio["overdue_schedule"]), (2, 2, 1, 1, 1, 1))
        self.assertEqual((cardio["days_to_seen"], cardio["days_to_report"], cardio["seen_pct"]), (4.0, 6.0, 50.0))
        self.assertEqual(rows["Dermatology"]["open"], 0)

    def test_hide_phi_masks_names_and_text(self):
        cfg = {"columns": ["patient", "specialty", "reason"]}
        self.assertEqual(self.run_cfg(cfg)["phi"], "shown")
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertNotIn("Ames", str(hidden))
        self.assertNotIn("Bell", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Referral turnaround", "source": "referrals", "config": {"group_by": "specialty", "columns": ["specialty", "referrals"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Referrals")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="referrals", action="run").exists())


class AllergySourceTests(TestCase):
    def setUp(self):
        from appointments.models import PatientAllergy

        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.ann = CustomUser.objects.create_user(
            username="p1", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.bo = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        far = CustomUser.objects.create_user(username="p3", password="x", role="patient", organization=self.other)
        PatientAllergy.objects.create(organization=self.org, patient=self.ann, substance="Penicillin", category="medication", severity="severe", code="7980", code_system="rxnorm")
        PatientAllergy.objects.create(organization=self.org, patient=self.bo, substance="Penicillin", category="medication", severity="mild", status="inactive")
        PatientAllergy.objects.create(organization=None, patient=self.bo, substance="Peanut", category="food", severity="severe")
        PatientAllergy.objects.create(organization=self.other, patient=far, substance="Latex")
        today = datetime.date.today()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None, **kw):
        return engine.run_report("allergies", self.org, config, self.start, self.end, user=user, **kw)

    def test_counts_by_substance_and_other_orgs_are_excluded(self):
        res = self.run_cfg({"group_by": "substance", "columns": ["substance", "allergies", "active", "severe", "severe_pct", "coded_pct", "patients"]})
        rows = {r["substance"]: r for r in res["rows"]}
        self.assertEqual(set(rows), {"Penicillin", "Peanut"})  # Latex belongs to another organization
        pen = rows["Penicillin"]
        self.assertEqual((pen["allergies"], pen["active"], pen["severe"], pen["patients"]), (2, 1, 1, 2))
        self.assertEqual((pen["severe_pct"], pen["coded_pct"]), (100.0, 50.0))

    def test_hide_phi_masks_names(self):
        cfg = {"columns": ["patient", "substance"]}
        self.assertEqual(self.run_cfg(cfg)["phi"], "shown")
        hidden = self.run_cfg(cfg, hide_phi=True)
        self.assertNotIn("Ames", str(hidden))
        self.assertEqual({r["patient"] for r in hidden["rows"]}, {"Patient 1", "Patient 2"})

    def test_save_and_run_is_audited(self):
        from .models import ReportAuditLog

        body = {"name": "Allergies", "source": "allergies", "config": {"group_by": "substance", "columns": ["substance", "allergies"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Allergies")
        ran = client_for(self.admin).post(
            f"{BASE}/{made.json()['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat()}, format="json"
        )
        self.assertEqual(ran.status_code, 200, ran.content)
        self.assertTrue(ReportAuditLog.objects.filter(source="allergies", action="run").exists())


class BedCensusTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Bed, Facility, Room, Unit as ApptUnit
        from users.models import Patient, Registration

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        u = CustomUser.objects.create_user(username="p1", password="x", role="patient", organization=self.org)
        profile = make_patient(user=u, organization=self.org, phone_number="3015550111")
        self.east = Facility.objects.create(organization=self.org, name="East")
        west = Facility.objects.create(organization=self.org, name="West")
        ward = ApptUnit.objects.create(facility=self.east, name="Ward 3", care_type="inpatient")
        clinic = ApptUnit.objects.create(facility=west, name="West ED", care_type="emergency")
        room = Room.objects.create(unit=ward, name="301")
        room_w = Room.objects.create(unit=clinic, name="E1")
        b1 = Bed.objects.create(room=room, name="A")
        Bed.objects.create(room=room, name="B")
        Bed.objects.create(room=room, name="C", hold="cleaning")
        Bed.objects.create(room=room, name="D", is_active=False)
        Bed.objects.create(room=room_w, name="W1")
        Registration.objects.create(
            patient=profile, organization=self.org, facility=self.east, unit=ward, room=room, bed=b1,
            arrival_time=timezone.now() - datetime.timedelta(hours=5),
        )
        today = timezone.localdate()
        self.start, self.end = today, today

    def run_cfg(self, config, user=None):
        return engine.run_report("bed_census", self.org, config, self.start, self.end, user=user)

    def test_ward_counts_and_occupancy(self):
        res = self.run_cfg({"group_by": "unit", "columns": ["unit", "beds", "in_service", "occupied", "available", "cleaning", "inactive", "occupancy_pct"]})
        rows = {r["unit"]: r for r in res["rows"]}
        ward = rows["Ward 3"]
        self.assertEqual((ward["beds"], ward["in_service"], ward["occupied"], ward["available"], ward["cleaning"], ward["inactive"]), (4, 3, 1, 1, 1, 1))
        self.assertAlmostEqual(ward["occupancy_pct"], 33.3, places=1)
        self.assertEqual(rows["West ED"]["available"], 1)

    def test_hours_occupied_and_no_patient_field(self):
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "hours_occupied"]})
        east = {r["facility"]: r for r in res["rows"]}["East"]
        self.assertGreaterEqual(east["hours_occupied"], 4.9)
        keys = {f["key"] for f in engine.source_summary(engine.SOURCES["bed_census"])["fields"]}
        self.assertFalse(keys & {"patient", "patient_name", "_patient"})

    def test_a_facility_limited_user_sees_only_their_facility(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "beds"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["beds"] for r in res["rows"]}, {"East": 4})

    def test_save_and_module_label(self):
        body = {"name": "Beds now", "source": "bed_census", "config": {"group_by": "unit", "columns": ["unit", "beds"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Census")


class TelehealthSourceTests(TestCase):
    def setUp(self):
        from django.utils import timezone

        from appointments.models import Appointment, Facility, Unit as ApptUnit
        from telehealth.models import TelehealthParticipant, TelehealthSession, TelehealthVisitRecord

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dana", last_name="Lee"
        )
        self.ann = CustomUser.objects.create_user(username="p1", password="x", role="patient", organization=self.org)
        self.bo = CustomUser.objects.create_user(username="p2", password="x", role="patient", organization=self.org)
        self.east = Facility.objects.create(organization=self.org, name="East")
        west = Facility.objects.create(organization=self.org, name="West")
        u_east = ApptUnit.objects.create(facility=self.east, name="East Clinic")
        u_west = ApptUnit.objects.create(facility=west, name="West Clinic")
        now = timezone.now()

        def session(patient, unit, room, status="ended", started=True, **record):
            appt = Appointment.all_objects.create(
                organization=self.org, patient=patient, provider=self.doc, title="Video",
                appointment_datetime=now, duration_minutes=30, unit=unit, is_video=True,
            )
            s = TelehealthSession.objects.create(
                appointment=appt, organization=self.org, status=status, room_name=room,
                started_at=now if started else None, ended_at=now + datetime.timedelta(minutes=20) if started else None,
                consent_at=now if started else None,
            )
            TelehealthParticipant.objects.create(
                session=s, role="patient", arrived_at=now, admitted_at=now + datetime.timedelta(minutes=4), joined_at=now if started else None
            )
            if record:
                TelehealthVisitRecord.objects.create(session=s, **record)
            return s

        session(self.ann, u_east, "r1", modality="audio_video", duration_seconds=1200)
        session(self.ann, u_east, "r2", modality="audio_only", duration_seconds=600)
        session(self.bo, u_west, "r3", started=False)
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_cfg(self, config, user=None):
        return engine.run_report("telehealth", self.org, config, self.start, self.end, user=user)

    def test_completion_waiting_and_length_by_provider(self):
        res = self.run_cfg({"group_by": "provider", "columns": ["provider", "sessions", "completed", "never_started", "audio_only", "wait_minutes", "visit_minutes", "patients"]})
        row = res["rows"][0]
        self.assertEqual(row["provider"], "Dana Lee")
        self.assertEqual((row["sessions"], row["completed"], row["never_started"], row["audio_only"], row["patients"]), (3, 2, 1, 1, 2))
        self.assertEqual(row["wait_minutes"], 4.0)
        self.assertEqual(row["visit_minutes"], 15.0)  # 20 and 10 minutes

    def test_no_patient_identity_is_a_field(self):
        keys = {f["key"] for f in engine.source_summary(engine.SOURCES["telehealth"])["fields"]}
        self.assertFalse(keys & {"patient", "patient_name", "_patient"})

    def test_a_facility_limited_user_sees_only_their_facility(self):
        self.admin.facilities.add(self.east)
        res = self.run_cfg({"group_by": "facility", "columns": ["facility", "sessions"]}, user=self.admin)
        self.assertEqual({r["facility"]: r["sessions"] for r in res["rows"]}, {"East": 2})

    def test_save_and_module_label(self):
        body = {"name": "Video visits", "source": "telehealth", "config": {"group_by": "provider", "columns": ["provider", "sessions"]}, "audience": "me"}
        made = client_for(self.admin).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Telehealth")


class LinkedReportTests(TestCase):
    """Reports that combine several kinds of records (the canvas)."""

    def setUp(self):
        from django.utils import timezone

        from communicator.models import MessageLog
        from users.models import Patient, Registration

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org, first_name="Nia", last_name="Park"
        )
        self.nurse2 = CustomUser.objects.create_user(
            username="n2", password="x", role="nurse", organization=self.org, first_name="Omar", last_name="Reyes"
        )

        def patient(username, first, last, phone):
            u = CustomUser.objects.create_user(username=username, password="x", role="patient", organization=self.org, first_name=first, last_name=last)
            return make_patient(user=u, organization=self.org, phone_number=phone)

        self.ann = patient("p1", "Ann", "Ames", "(301) 555-0101")
        self.bo = patient("p2", "Bo", "Bell", "301-555-0102")
        self.cy = patient("p3", "Cy", "Cole", "3015550103")
        now = timezone.now()
        for number in ("+13015550101", "+13015550102", "+13015550103", "+13015559999"):
            MessageLog.objects.create(user=self.admin, recipient=number, body="Reminder", message_type="sms", status="sent")
        Registration.objects.create(patient=self.ann, organization=self.org, care_setting="emergency", arrival_time=now, assigned_nurse=self.nurse)
        Registration.objects.create(patient=self.ann, organization=self.org, care_setting="ambulatory", arrival_time=now, assigned_nurse=self.nurse2)
        Registration.objects.create(patient=self.bo, organization=self.org, care_setting="ambulatory", arrival_time=now, assigned_nurse=self.nurse)
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def preview(self, user, canvas, config=None, **extra):
        body = {
            "source": "linked", "config": {"canvas": canvas, **(config or {})},
            "start": self.start.isoformat(), "end": self.end.isoformat(), **extra,
        }
        return client_for(user).post(f"{BASE}/preview/", body, format="json")

    def test_texted_patients_by_visit_type(self):
        canvas = {"objects": ["msg", "pat", "visit"], "keep_unmatched": True, "window_days": 7}
        cfg = {"group_by": "visit__care", "columns": ["visit__care", "pat__count", "msg__count", "visit__count"]}
        res = self.preview(self.admin, canvas, cfg)
        self.assertEqual(res.status_code, 200, res.content)
        rows = {r["visit__care"]: r for r in res.json()["rows"]}
        self.assertEqual(rows["ED"]["pat__count"], 1)
        self.assertEqual(rows["Clinic"]["pat__count"], 2)  # Ann and Bo
        self.assertEqual(rows["No visit"]["pat__count"], 1)  # Cy was texted and never came in
        self.assertEqual(res.json()["totals"]["msg__count"], 4)  # the unmatched number is kept
        self.assertEqual(res.json()["totals"]["pat__count"], 3)

    def test_leaving_unmatched_out_drops_patients_without_a_visit(self):
        canvas = {"objects": ["msg", "pat", "visit"], "keep_unmatched": False, "window_days": 7}
        res = self.preview(self.admin, canvas, {"group_by": "visit__care", "columns": ["visit__care", "pat__count"]})
        self.assertEqual({r["visit__care"] for r in res.json()["rows"]}, {"ED", "Clinic"})

    def test_nurse_for_each_patient_through_the_visit(self):
        canvas = {"objects": ["pat", "visit", "nurse"], "keep_unmatched": False, "window_days": 0}
        res = self.preview(self.admin, canvas, {"columns": ["nurse__name", "pat__name", "visit__care"]})
        self.assertEqual(res.status_code, 200, res.content)
        pairs = {(r["nurse__name"], r["pat__name"], r["visit__care"]) for r in res.json()["rows"]}
        self.assertEqual(pairs, {("Nia Park", "Ann Ames", "ED"), ("Omar Reyes", "Ann Ames", "Clinic"), ("Nia Park", "Bo Bell", "Clinic")})

    def test_hide_phi_masks_the_patient_name_in_a_linked_report(self):
        canvas = {"objects": ["pat", "visit", "nurse"], "keep_unmatched": False, "window_days": 0}
        res = self.preview(self.admin, canvas, {"columns": ["nurse__name", "pat__name"]}, hide_phi=True)
        self.assertEqual(res.json()["phi"], "hidden")
        self.assertNotIn("Ames", str(res.json()))
        self.assertEqual({r["pat__name"] for r in res.json()["rows"]}, {"Patient 1", "Patient 2"})

    def test_unconnected_things_say_what_to_add(self):
        res = self.preview(self.admin, {"objects": ["msg", "visit"]}, {"columns": ["msg__count"]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Add Patient", res.json()["error"])

    def test_every_object_keeps_its_own_right(self):
        canvas = {"objects": ["msg", "pat", "visit"]}
        res = self.preview(self.nurse, canvas, {"columns": ["visit__count"]})  # a nurse lacks the message log right
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.preview(self.nurse, {"objects": ["pat", "visit", "nurse"]}, {"columns": ["visit__count"]}).status_code, 200)

    def test_orders_and_labs_link_to_patients_visits_and_each_other(self):
        from django.utils import timezone

        from appointments.models import Appointment, LabReport, LabResultItem, Order, Orderable
        from users.models import Registration

        now = timezone.now()
        cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")
        appt = Appointment.all_objects.create(
            organization=self.org, patient=self.ann.user, provider=self.nurse, title="Visit",
            appointment_datetime=now, duration_minutes=30,
        )
        Registration.objects.filter(patient=self.ann, care_setting="emergency").update(appointment=appt)
        order = Order.objects.create(
            organization=self.org, appointment=appt, patient=self.ann.user, ordering_provider=self.nurse,
            orderable=cbc, orderable_name="CBC", orderable_category="laboratory", status="completed",
        )
        report = LabReport.objects.create(
            organization=self.org, patient=self.ann.user, order=order, title="CBC", resulted_at=now,
        )
        LabResultItem.objects.create(report=report, test_name="WBC", value="20", abnormal_flag="HH")

        canvas = {"objects": ["pat", "visit", "order"], "keep_unmatched": False, "window_days": 7}
        cfg = {"group_by": "visit__care", "columns": ["visit__care", "pat__count", "order__count"]}
        res = self.preview(self.admin, canvas, cfg)
        self.assertEqual(res.status_code, 200, res.content)
        rows = {r["visit__care"]: r for r in res.json()["rows"]}
        self.assertEqual(rows["ED"]["order__count"], 1)  # the order belongs to the ED visit through its appointment

        canvas = {"objects": ["order", "lab", "pat"], "keep_unmatched": True, "window_days": 7}
        cfg = {"group_by": "order__category", "columns": ["order__category", "order__count", "lab__count", "lab__critical"]}
        res = self.preview(self.admin, canvas, cfg)
        self.assertEqual(res.status_code, 200, res.content)
        row = res.json()["rows"][0]
        self.assertEqual((row["order__category"], row["order__count"], row["lab__count"], row["lab__critical"]), ("Laboratory", 1, 1, 1))

        cat = client_for(self.admin).get(f"{BASE}/linked-catalog/").json()
        keys = {o["key"] for o in cat["objects"]}
        self.assertTrue({"order", "lab", "referral", "vaccine", "allergy"} <= keys)

    def test_save_run_audit_and_catalog(self):
        from .models import ReportAuditLog

        canvas = {"objects": ["pat", "visit", "nurse"], "keep_unmatched": False, "window_days": 0}
        body = {
            "name": "Nurse per patient", "source": "linked", "audience": "me",
            "config": {"canvas": canvas, "columns": ["nurse__name", "pat__name"]},
        }
        made = client_for(self.nurse).post(f"{BASE}/", body, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertEqual(made.json()["module_label"], "Linked")
        self.assertEqual(made.json()["source_label"], "Linked report")
        run = {"start": self.start.isoformat(), "end": self.end.isoformat()}
        res = client_for(self.nurse).post(f"{BASE}/{made.json()['id']}/run/", run, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.json()["rows"]), 3)
        self.assertEqual(ReportAuditLog.objects.filter(source="linked", action="run", user=self.nurse).count(), 1)
        cat = client_for(self.nurse).get(f"{BASE}/linked-catalog/").json()
        allowed = {o["key"]: o["allowed"] for o in cat["objects"]}
        self.assertTrue(allowed["visit"])
        self.assertFalse(allowed["msg"])
        self.assertTrue(any(l["fuzzy"] and l["label"] == "matched by phone" for l in cat["links"]))

    def test_tiles_highlight_and_sort_work_on_a_linked_report(self):
        canvas = {"objects": ["pat", "visit", "nurse"], "keep_unmatched": False, "window_days": 0}
        cfg = {
            "group_by": "nurse__name", "columns": ["nurse__name", "visit__count"],
            "tiles": [{"field": "_rows", "agg": "count", "label": "Rows"}, {"field": "visit__count", "agg": "sum", "label": "Visits"},
                      {"field": "_flagged", "agg": "count", "label": "Busy nurses"}],
            "highlight": {"field": "visit__count", "op": "gte", "value": "2"},
            "sort": {"field": "visit__count", "dir": "desc"},
        }
        res = self.preview(self.admin, canvas, cfg)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual([r["nurse__name"] for r in body["rows"]], ["Nia Park", "Omar Reyes"])  # Nia has 2 visits, Omar 1
        self.assertEqual([r["_flag"] for r in body["rows"]], [True, False])
        tiles = {t["label"]: t["value"] for t in body["tiles"]}
        self.assertEqual(tiles, {"Rows": 2, "Visits": 3, "Busy nurses": 1})


class DocumentationReportTests(TestCase):
    """Documentation reports: notes with their patient, people, visit and picked observations."""

    def setUp(self):
        from appointments.models import (
            Appointment, ClinicalNote, Dictionary, DictionaryItem, Facility, NoteFieldDefinition, NoteTemplate, Unit as ApptUnit,
        )
        from django.utils import timezone

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org, first_name="Nia", last_name="Park"
        )
        self.doc = CustomUser.objects.create_user(
            username="d", password="x", role="doctor", organization=self.org, first_name="Dee", last_name="Rivera"
        )
        Staff.objects.create(organization=self.org, first_name="Dee", last_name="Rivera", profession="Psychiatry", user=self.doc)
        self.pat = CustomUser.objects.create_user(
            username="p", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames"
        )
        self.pat2 = CustomUser.objects.create_user(
            username="p2", password="x", role="patient", organization=self.org, first_name="Bo", last_name="Bell"
        )
        fac = Facility.objects.create(organization=self.org, name="East")
        unit = ApptUnit.objects.create(facility=fac, name="East Clinic")
        answers = Dictionary.objects.create(code="phq_answers", name="PHQ answers")
        for i, label in enumerate(["Not at all", "Several days"]):
            DictionaryItem.objects.create(dictionary=answers, value=str(i), label=label, sort_order=i)
        self.tpl = NoteTemplate.objects.create(code="phq9", name="PHQ-9 depression screen", organization=self.org)
        for i, (key, label, ftype, dic) in enumerate(
            [("q1", "Little interest", "dropdown", answers), ("total_score", "Total score", "calculated", None),
             ("comment", "Comment", "textarea", None), ("followup", "Follow up needed", "checkbox", None)]
        ):
            NoteFieldDefinition.objects.create(template=self.tpl, key=key, label=label, field_type=ftype, dictionary=dic, sort_order=i)
        self.tpl2 = NoteTemplate.objects.create(code="gad7", name="GAD-7 anxiety screen", organization=self.org)
        NoteFieldDefinition.objects.create(template=self.tpl2, key="total_score", label="Total score", field_type="calculated", sort_order=0)
        now = timezone.now()

        def visit(patient):
            return Appointment.all_objects.create(
                organization=self.org, patient=patient, provider=self.doc, title="Visit", appointment_datetime=now, unit=unit
            )

        def note(patient, template, data, status="signed"):
            n = ClinicalNote.objects.create(
                organization=self.org, appointment=visit(patient), patient=patient, author=self.nurse, note_type="nursing_assessment",
                documentation_type=template.code, template=template, template_version=1, structured_data=data, status=status,
                template_snapshot={"fields": [{"key": "q1", "options": [{"value": "0", "label": "Not at all"}, {"value": "1", "label": "Several days"}]}]},
            )
            return n

        self.n1 = note(self.pat, self.tpl, {"q1": "1", "total_score": "18", "total_score__interpretation": "Moderately severe", "comment": "Tearful", "followup": True})
        self.n2 = note(self.pat2, self.tpl, {"q1": "0", "total_score": "6", "total_score__interpretation": "Mild"})
        self.n3 = note(self.pat, self.tpl2, {"total_score": "14", "total_score__interpretation": "Moderate"})
        note(self.pat2, self.tpl, {"total_score": "20"}, status="draft")
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_docs(self, docs, config=None, hide=False, user=None):
        from . import custom_report_documentation as documentation

        clean = documentation.clean_docs(docs)
        src = documentation.build_source(clean, self.org, user or self.admin, hide)
        return engine.run_report(documentation.DOC_KEY, self.org, config or {}, self.start, self.end, user=user or self.admin, hide_phi=hide, src=src)

    def test_one_row_per_signed_note_with_people_patient_and_visit(self):
        res = self.run_docs({"templates": ["phq9"], "observations": ["total_score"]}, {"columns": ["template", "date", "patient", "mrn", "visit_id", "author", "attending", "discipline", "num__total_score"]})
        self.assertEqual(len(res["rows"]), 2)  # the draft is left out by default
        row = next(r for r in res["rows"] if r["patient"] == "Ann Ames")
        self.assertEqual(row["template"], "PHQ-9 depression screen")
        self.assertEqual((row["author"], row["attending"], row["discipline"]), ("Nia Park", "Dee Rivera", "Psychiatry"))
        self.assertTrue(row["mrn"].startswith("MRN-"))
        self.assertEqual(row["visit_id"], str(self.n1.appointment_id))
        self.assertEqual(row["num__total_score"], 18)

    def test_whole_categories_pick_up_new_templates_by_themselves(self):
        from appointments.models import ClinicalNote, NoteFieldDefinition, NoteTemplate
        from . import custom_report_documentation as documentation

        docs = {"templates": [], "groups": ["Other structured notes"], "observations": ["total_score"]}
        res = self.run_docs(docs, {"columns": ["template", "num__total_score"]})
        self.assertEqual({r["template"] for r in res["rows"]}, {"PHQ-9 depression screen", "GAD-7 anxiety screen"})
        # a screen created after the report was saved joins it without editing the report
        tpl3 = NoteTemplate.objects.create(code="asq", name="ASQ suicide screen", organization=self.org)
        NoteFieldDefinition.objects.create(template=tpl3, key="total_score", label="Total score", field_type="calculated", sort_order=0)
        ClinicalNote.objects.create(
            organization=self.org, appointment=self.n1.appointment, patient=self.pat, author=self.nurse, note_type="nursing_assessment",
            documentation_type="asq", template=tpl3, template_version=1, structured_data={"total_score": "3"}, status="signed",
        )
        res = self.run_docs(docs, {"columns": ["template", "num__total_score"]})
        self.assertIn("ASQ suicide screen", {r["template"] for r in res["rows"]})
        cat = documentation.catalog(self.admin, self.org, [], ["Other structured notes"])
        self.assertIn("asq", cat["covered"])
        self.assertIn("Other structured notes", cat["groups"])

    def test_rows_carry_a_reference_and_the_whole_note_opens(self):
        res = self.run_docs({"templates": ["phq9"], "observations": ["total_score"]}, {"columns": ["patient"]})
        self.assertTrue(all(r["_ref"].startswith("note:") for r in res["rows"]))
        c = client_for(self.admin)
        r = c.get(f"{BASE}/documentation-document/", {"ref": f"note:{self.n1.pk}", "hide_phi": "false"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["title"], body["status"]), ("PHQ-9 depression screen", "Signed"))
        header = {h["label"]: h["value"] for h in body["header"]}
        self.assertEqual((header["Patient"], header["Author"], header["Attending physician"]), ("Ann Ames", "Nia Park", "Dee Rivera"))
        items = {i["label"]: i for sec in body["sections"] for i in sec["items"]}
        self.assertEqual(items["Little interest"]["value"], "Several days")
        self.assertEqual(items["Comment"]["value"], "Tearful")
        self.assertEqual((items["Total score"]["value"], items["Total score"]["meaning"]), ("18", "Moderately severe"))
        self.assertEqual(items["Follow up needed"]["value"], "Yes")
        from .models import ReportAuditLog

        self.assertTrue(ReportAuditLog.objects.filter(source="note_documentation", action="view", user=self.admin).exists())

    def test_opening_a_note_with_hide_phi_masks_name_mrn_and_text(self):
        c = client_for(self.admin)
        body = c.get(f"{BASE}/documentation-document/", {"ref": f"note:{self.n1.pk}"}).json()  # hiding is the default
        header = {h["label"]: h["value"] for h in body["header"]}
        self.assertEqual((header["Patient"], header["MRN"]), ("[Hidden]", "[Hidden]"))
        items = {i["label"]: i["value"] for sec in body["sections"] for i in sec["items"]}
        self.assertEqual((items["Comment"], items["Total score"], items["Little interest"]), ("[Hidden]", "18", "Several days"))

    def test_a_note_of_another_organization_does_not_open(self):
        other = Organization.objects.create(name="Org B")
        stranger = CustomUser.objects.create_user(username="x", password="x", role="admin", organization=other)
        r = client_for(stranger).get(f"{BASE}/documentation-document/", {"ref": f"note:{self.n1.pk}"})
        self.assertEqual(r.status_code, 404)
        self.assertEqual(client_for(self.admin).get(f"{BASE}/documentation-document/", {"ref": "garbage"}).status_code, 404)

    def test_a_report_needs_a_note_or_a_category(self):
        from . import custom_report_documentation as documentation

        with self.assertRaises(engine.ReportConfigError):
            documentation.clean_docs({"templates": [], "groups": []})
        self.assertEqual(documentation.clean_docs({"groups": ["Flowsheets"]})["groups"], ["Flowsheets"])

    def test_status_all_includes_drafts(self):
        res = self.run_docs({"templates": ["phq9"], "observations": ["total_score"], "status": "all"})
        self.assertEqual(len(res["rows"]), 3)

    def test_labels_checkboxes_and_meaning(self):
        res = self.run_docs(
            {"templates": ["phq9"], "observations": ["q1", "total_score__interpretation", "followup"]},
            {"columns": ["patient", "obs__q1", "obs__total_score__interpretation", "obs__followup"]},
        )
        row = next(r for r in res["rows"] if r["patient"] == "Ann Ames")
        self.assertEqual(row["obs__q1"], "Several days")
        self.assertEqual(row["obs__total_score__interpretation"], "Moderately severe")
        self.assertEqual(row["obs__followup"], "Yes")

    def test_a_shared_observation_lines_up_across_notes(self):
        res = self.run_docs({"templates": ["phq9", "gad7"], "observations": ["total_score"]}, {"columns": ["template", "num__total_score"], "sort": {"field": "num__total_score", "dir": "desc"}})
        self.assertEqual([r["num__total_score"] for r in res["rows"]], [18, 14, 6])
        # the average works because the score is a number
        grouped = self.run_docs({"templates": ["phq9", "gad7"], "observations": ["total_score"]}, {"group_by": "template", "columns": ["template", "num__total_score"]})
        by = {r["template"]: r["num__total_score"] for r in grouped["rows"]}
        self.assertEqual(by["PHQ-9 depression screen"], 12.0)
        self.assertEqual(by["GAD-7 anxiety screen"], 14)

    def test_score_filter(self):
        res = self.run_docs(
            {"templates": ["phq9", "gad7"], "observations": ["total_score"]},
            {"columns": ["patient", "num__total_score"], "filters": [{"field": "num__total_score", "op": "gte", "value": 15}]},
        )
        self.assertEqual([r["num__total_score"] for r in res["rows"]], [18])

    def test_long_layout_gives_one_row_per_observation(self):
        res = self.run_docs(
            {"templates": ["phq9"], "observations": ["q1", "total_score"], "layout": "long"},
            {"columns": ["patient", "observation", "value", "value_num"]},
        )
        rows = [(r["patient"], r["observation"], r["value"]) for r in res["rows"]]
        self.assertIn(("Ann Ames", "Little interest", "Several days"), rows)
        self.assertIn(("Ann Ames", "Total score", "18"), rows)
        self.assertEqual(len(rows), 4)

    def test_hide_phi_masks_names_mrn_and_typed_text_but_not_scores(self):
        for layout in ("wide", "long"):
            res = self.run_docs(
                {"templates": ["phq9"], "observations": ["comment", "total_score"], "layout": layout},
                {"columns": ["patient", "mrn", "visit_id"] + (["obs__comment", "num__total_score"] if layout == "wide" else ["observation", "value"])},
                hide=True,
            )
            self.assertEqual(res["phi"], "hidden")
            for r in res["rows"]:
                self.assertTrue(r["patient"].startswith("Patient "))
                self.assertEqual(r["mrn"], "[Hidden]")
                self.assertTrue(r["visit_id"])
            text = " ".join(str(v) for r in res["rows"] for v in r.values())
            self.assertNotIn("Tearful", text)
            self.assertNotIn("Ames", text)
            if layout == "wide":
                self.assertIn(18, [r["num__total_score"] for r in res["rows"]])
            else:
                self.assertIn("18", [r["value"] for r in res["rows"]])

    def test_a_note_written_without_a_template_gives_its_soap_sections(self):
        from appointments.models import Appointment, ClinicalNote
        from django.utils import timezone

        appt = Appointment.all_objects.create(organization=self.org, patient=self.pat, title="V", appointment_datetime=timezone.now())
        ClinicalNote.objects.create(
            organization=self.org, appointment=appt, patient=self.pat, author=self.nurse, note_type="doctor_assessment",
            documentation_type="progress_note", status="signed", subjective="Doing better", plan="Home",
        )
        res = self.run_docs({"templates": ["progress_note"], "observations": ["subjective", "plan"]}, {"columns": ["template", "obs__subjective", "obs__plan"]})
        self.assertEqual(res["rows"][0]["obs__subjective"], "Doing better")
        self.assertEqual(res["rows"][0]["template"], "Progress Note")

    def test_save_run_and_audit_through_the_api(self):
        body = {
            "name": "PHQ-9 screens", "source": "note_documentation", "audience": "me", "audience_roles": [],
            "config": {"docs": {"templates": ["phq9"], "observations": ["total_score"]}, "columns": ["patient", "mrn", "num__total_score"]},
        }
        c = client_for(self.admin)
        res = c.post(f"{BASE}/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        saved = res.json()
        self.assertEqual(saved["config"]["docs"]["templates"], ["phq9"])
        run = c.post(f"{BASE}/{saved['id']}/run/", {"start": self.start.isoformat(), "end": self.end.isoformat(), "hide_phi": True}, format="json")
        self.assertEqual(run.status_code, 200, run.content)
        self.assertEqual(len(run.json()["rows"]), 2)
        from .models import ReportAuditLog

        log = ReportAuditLog.objects.get(source="note_documentation", action="run")
        self.assertTrue(log.phi_hidden)

    def test_needs_the_clinical_notes_right_and_a_template(self):
        reg = CustomUser.objects.create_user(username="reg", password="x", role="patient", organization=self.org)
        body = {"name": "X", "source": "note_documentation", "audience": "me", "config": {"docs": {"templates": ["phq9"], "observations": []}}}
        self.assertIn(client_for(reg).post(f"{BASE}/", body, format="json").status_code, (400, 403))
        empty = {"name": "X", "source": "note_documentation", "audience": "me", "config": {"docs": {"templates": []}}}
        self.assertEqual(client_for(self.admin).post(f"{BASE}/", empty, format="json").status_code, 400)

    def test_catalog_lists_templates_and_the_observations_of_the_picked_ones(self):
        res = client_for(self.admin).get(f"{BASE}/documentation-catalog/?templates=phq9,gad7")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertIn("phq9", [t["code"] for t in data["templates"]])
        self.assertIn("progress_note", [t["code"] for t in data["templates"]])
        ids = [o["id"] for o in data["observations"]]
        self.assertEqual(ids.count("total_score"), 1)  # shared by both, one entry
        self.assertIn("total_score__interpretation", ids)
        self.assertIn("q1", ids)

    def test_documentation_is_not_offered_in_the_generic_builder(self):
        res = client_for(self.admin).get(f"{BASE}/sources/")
        self.assertNotIn("note_documentation", [s["key"] for s in res.json()])


class DocumentationFlowsheetTests(TestCase):
    """Flowsheets are documentation: their own category in the picker, one document per time point charted."""

    def setUp(self):
        from django.utils import timezone

        from appointments.models import (
            Appointment, Dictionary, DictionaryItem, Facility, FlowsheetRowDefinition, FlowsheetTemplate, Unit as ApptUnit,
            VitalSignsFlowsheet,
        )

        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(username="n", password="x", role="nurse", organization=self.org, first_name="Nia", last_name="Park")
        self.doc = CustomUser.objects.create_user(username="d", password="x", role="doctor", organization=self.org, first_name="Dee", last_name="Rivera")
        self.pat = CustomUser.objects.create_user(username="p", password="x", role="patient", organization=self.org, first_name="Ann", last_name="Ames")
        fac = Facility.objects.create(organization=self.org, name="East")
        unit = ApptUnit.objects.create(facility=fac, name="East Clinic")
        sides = Dictionary.objects.create(code="sides", name="Sides")
        DictionaryItem.objects.create(dictionary=sides, value="L", label="Left arm", sort_order=0)
        tpl = FlowsheetTemplate.objects.create(code="vitals", name="Vital signs")
        for i, (key, label, ftype, dic) in enumerate(
            [("hr", "Heart rate", "numeric", None), ("site", "BP site", "dropdown", sides), ("note", "Comment", "text", None)]
        ):
            FlowsheetRowDefinition.objects.create(template=tpl, section_label="Vitals", key=key, label=label, field_type=ftype, dictionary=dic, sort_order=i)
        now = timezone.now()
        appt = Appointment.all_objects.create(
            organization=self.org, patient=self.pat, provider=self.doc, title="Visit", appointment_datetime=now, unit=unit
        )
        columns = [
            {"id": f"c{n}", "timestamp": (now + datetime.timedelta(minutes=n)).isoformat(), "recorded_by": self.nurse.pk, "recorded_by_name": "Nia Park"}
            for n in range(2)
        ]
        data = {"hr": {"c0": "72", "c1": "88"}, "site": {"c0": "L"}, "note": {"c1": "anxious"}}
        VitalSignsFlowsheet.objects.create(organization=self.org, template=tpl, appointment=appt, patient=self.pat, columns=columns, data=data)
        today = timezone.localdate()
        self.start, self.end = today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)

    def run_docs(self, docs, config=None, hide=False):
        from . import custom_report_documentation as documentation

        clean = documentation.clean_docs(docs)
        src = documentation.build_source(clean, self.org, self.admin, hide)
        return engine.run_report(documentation.DOC_KEY, self.org, config or {}, self.start, self.end, user=self.admin, hide_phi=hide, src=src)

    def test_flowsheets_are_their_own_category_in_the_picker(self):
        from . import custom_report_documentation as documentation

        cat = documentation.catalog(self.admin, self.org, ["flowsheet:vitals"])
        item = next(t for t in cat["templates"] if t["code"] == "flowsheet:vitals")
        self.assertEqual(item["group"], "Flowsheets")
        self.assertEqual({o["id"] for o in cat["observations"]}, {"hr", "site", "note"})

    def test_one_row_per_time_point_with_people_and_visit(self):
        cols = ["template", "time", "patient", "author", "author_role", "attending", "discipline", "visit_id", "status", "num__hr", "obs__site"]
        res = self.run_docs({"templates": ["flowsheet:vitals"], "observations": ["hr", "site"]}, {"columns": cols, "sort": {"field": "time", "dir": "asc"}})
        self.assertEqual(len(res["rows"]), 2)
        first = res["rows"][0]
        self.assertEqual((first["template"], first["author"], first["attending"], first["status"]), ("Vital signs", "Nia Park", "Dee Rivera", "Charted"))
        self.assertEqual(first["author_role"], "Nurse")
        self.assertEqual((first["num__hr"], first["obs__site"]), (72, "Left arm"))
        self.assertEqual(res["rows"][1]["num__hr"], 88)

    def test_long_layout_one_row_per_charted_value(self):
        res = self.run_docs({"templates": ["flowsheet:vitals"], "observations": ["hr", "site"], "layout": "long"}, {"columns": ["observation", "value"]})
        self.assertEqual(sorted((r["observation"], r["value"]) for r in res["rows"]), [("BP site", "Left arm"), ("Heart rate", "72"), ("Heart rate", "88")])

    def test_hide_phi_masks_typed_text_only(self):
        res = self.run_docs({"templates": ["flowsheet:vitals"], "observations": ["hr", "note"]}, {"columns": ["patient", "num__hr", "obs__note"]}, hide=True)
        self.assertTrue(all(r["patient"].startswith("Patient ") for r in res["rows"]))
        self.assertIn("[Hidden]", [r["obs__note"] for r in res["rows"]])
        self.assertEqual(sorted(r["num__hr"] for r in res["rows"]), [72, 88])

    def test_notes_and_flowsheets_in_one_report(self):
        res = self.run_docs({"templates": ["progress_note", "flowsheet:vitals"], "observations": ["hr"]}, {"columns": ["template", "num__hr"]})
        self.assertEqual({r["template"] for r in res["rows"]}, {"Vital signs"})

    def test_flowsheet_entries_left_out_of_the_regular_builder(self):
        c = client_for(self.admin)
        keys = [s["key"] for s in c.get(f"{BASE}/sources/").json()]
        self.assertTrue(keys)
        self.assertNotIn("flowsheet_entries", keys)

    def test_a_flowsheet_time_point_opens_as_a_whole_document(self):
        res = self.run_docs({"templates": ["flowsheet:vitals"], "observations": ["hr"]}, {"columns": ["time", "num__hr"], "sort": {"field": "time", "dir": "asc"}})
        ref = res["rows"][1]["_ref"]
        self.assertTrue(ref.startswith("flowsheet:"))
        body = client_for(self.admin).get(f"{BASE}/documentation-document/", {"ref": ref, "hide_phi": "false"}).json()
        self.assertEqual((body["title"], body["status"]), ("Vital signs", "Charted"))
        items = {i["label"]: i["value"] for sec in body["sections"] for i in sec["items"]}
        self.assertEqual(items["Heart rate"], "88")
        self.assertEqual(items["Comment"], "anxious")
        self.assertNotIn("BP site", items)  # nothing was charted for it at this time
        masked = client_for(self.admin).get(f"{BASE}/documentation-document/", {"ref": ref}).json()
        self.assertEqual({i["label"]: i["value"] for sec in masked["sections"] for i in sec["items"]}["Comment"], "[Hidden]")
