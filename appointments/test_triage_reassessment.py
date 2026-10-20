import datetime as dt

from django.utils import timezone

from users.models import Registration
from users.test_ed_board import EdBoardBase

from .models import ClinicalNote, TriageReassessment, TriageSettings

LOG = "/api/triage/patient/{}/reassessments/"


class ReassessmentTests(EdBoardBase):
    """The recheck log, the due time from the clinic's gaps, and what the ED board shows."""

    def setUp(self):
        super().setUp()
        self.patient.date_of_birth = timezone.localdate() - dt.timedelta(days=58 * 365 + 20)
        self.patient.legal_sex = "M"
        self.patient.save()
        self.vid = self.er_visit()  # no bed: waiting
        self.visit = Registration.objects.get(pk=self.vid)
        self.appt = self.visit.appointment
        self.visit.esi = 3
        self.visit.save()

    def triage_note(self, status="signed", signed_minutes_ago=30, level=3):
        return ClinicalNote.objects.create(
            organization=self.org, appointment=self.appt, patient=self.patient_user, author=self.nurse, note_type="nursing_assessment",
            documentation_type="triage_note", status=status,
            signed_at=timezone.now() - dt.timedelta(minutes=signed_minutes_ago) if status == "signed" else None,
            structured_data={"esi_level": level, "triage_snapshot": {"vitals": {"hr": 112, "spo2": 94}}})

    def gaps(self, **minutes):
        TriageSettings.objects.update_or_create(organization=self.org, defaults={"reassess_minutes": {k.lstrip("l"): v for k, v in minutes.items()}})

    def log(self, user=None):
        return self.as_(user or self.nurse).get(LOG.format(self.patient_user.pk))

    def add(self, body, user=None):
        return self.as_(user or self.nurse).post(LOG.format(self.patient_user.pk), body, format="json")

    def board_visit(self):
        return [r for r in self.board().json()["rows"] if r["type"] == "waiting"][0]["visit"]

    # ---- the log ----
    def test_log_is_empty_until_the_triage_note_is_signed(self):
        body = self.log().json()
        self.assertIsNone(body["triage"])
        self.assertEqual(body["rows"], [])
        self.triage_note(status="draft")
        self.assertIsNone(self.log().json()["triage"])

    def test_cannot_add_before_signing(self):
        r = self.add({"change": "Looks worse"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Sign the triage note", r.json()["detail"])
        self.assertEqual(TriageReassessment.objects.count(), 0)

    def test_first_row_is_the_initial_triage(self):
        self.triage_note()
        rows = self.log().json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["change"], "Initial triage")
        self.assertEqual(rows[0]["vitals"], {"hr": 112, "spo2": 94})
        self.assertEqual(rows[0]["level_after"], 3)
        self.assertEqual(rows[0]["flags"]["hr"]["status"], "high")

    def test_adding_a_recheck_records_vitals_nurse_and_time(self):
        self.triage_note()
        r = self.add({"vitals": {"hr": "98", "spo2": 97, "temp_f": "98.6", "pain": 4}, "change": "Pain better"})
        self.assertEqual(r.status_code, 201, r.content)
        rows = r.json()["rows"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["vitals"], {"hr": 98, "spo2": 97, "temp_f": 98.6, "pain": 4})
        self.assertEqual(rows[1]["change"], "Pain better")
        self.assertEqual(rows[1]["level_before"], 3)
        self.assertEqual(rows[1]["level_after"], 3)
        self.assertEqual(TriageReassessment.objects.get().recorded_by, self.nurse)

    def test_needs_something_to_record(self):
        self.triage_note()
        self.assertEqual(self.add({}).status_code, 400)
        self.assertEqual(self.add({"vitals": {"hr": ""}, "change": "  "}).status_code, 400)

    def test_bad_vitals_are_refused(self):
        self.triage_note()
        for vitals in ({"hr": "fast"}, {"spo2": 140}, {"pain": 11}, {"temp_f": 20}, {"bp": 120}, "x"):
            self.assertEqual(self.add({"vitals": vitals}).status_code, 400, vitals)

    def test_a_new_level_needs_a_reason_and_goes_onto_the_visit(self):
        self.triage_note()
        self.assertEqual(self.add({"vitals": {"hr": 130}, "level": 2}).status_code, 400)
        r = self.add({"vitals": {"hr": 130}, "level": 2, "change": "Chest pain returned"})
        self.assertEqual(r.status_code, 201, r.content)
        self.visit.refresh_from_db()
        self.assertEqual(self.visit.esi, 2)
        row = r.json()["rows"][-1]
        self.assertEqual((row["level_before"], row["level_after"]), (3, 2))
        self.assertEqual(self.add({"change": "x", "level": 9}).status_code, 400)

    def test_log_rows_cannot_be_edited_or_deleted(self):
        self.triage_note()
        self.add({"change": "Stable"})
        row = TriageReassessment.objects.get()
        for method in ("put", "patch", "delete"):
            r = getattr(self.as_(self.nurse), method)(f"{LOG.format(self.patient_user.pk)}{row.pk}/")
            self.assertIn(r.status_code, (404, 405))
        self.assertEqual(TriageReassessment.objects.count(), 1)

    def test_only_clinicians_and_own_clinic(self):
        self.triage_note()
        self.assertEqual(self.log(self.registrar).status_code, 403)
        self.assertEqual(self.add({"change": "x"}, self.registrar).status_code, 403)
        from appointments.test_locations import make_user
        outsider = make_user("out", "nurse", self.other_org)
        self.assertIn(self.log(outsider).status_code, (403, 404))

    def test_discharged_visit_cannot_be_rechecked(self):
        self.triage_note()
        Registration.objects.filter(pk=self.vid).update(discharge_datetime=timezone.now())
        self.assertEqual(self.add({"change": "x"}).status_code, 400)

    # ---- due time ----
    def test_no_due_time_until_the_clinic_sets_a_gap(self):
        self.triage_note()
        body = self.log().json()
        self.assertIsNone(body["due_at"])
        self.assertIsNone(body["gap_minutes"])

    def test_due_time_is_gap_after_signing_then_after_last_recheck(self):
        self.gaps(l3=60)
        note = self.triage_note(signed_minutes_ago=30)
        body = self.log().json()
        self.assertEqual(body["gap_minutes"], 60)
        due = dt.datetime.fromisoformat(body["due_at"])
        self.assertAlmostEqual((due - note.signed_at).total_seconds(), 3600, delta=1)
        self.add({"change": "Stable"})
        last = TriageReassessment.objects.get().recorded_at
        due = dt.datetime.fromisoformat(self.log().json()["due_at"])
        self.assertAlmostEqual((due - last).total_seconds(), 3600, delta=1)

    def test_gap_follows_the_current_level(self):
        self.gaps(l2=15, l3=60)
        self.triage_note()
        self.add({"change": "Worse", "level": 2})
        self.assertEqual(self.log().json()["gap_minutes"], 15)

    # ---- the ED board ----
    def test_board_shows_no_triage_note_yet(self):
        t = self.board_visit()["triage"]
        self.assertEqual(t["note"], "none")
        self.assertIsNone(t["signed_at"])

    def test_board_shows_draft_then_signed(self):
        note = self.triage_note(status="draft")
        self.assertEqual(self.board_visit()["triage"]["note"], "draft")
        note.status, note.signed_at = "signed", timezone.now()
        note.save()
        t = self.board_visit()["triage"]
        self.assertEqual(t["note"], "signed")
        self.assertIsNotNone(t["signed_at"])

    def test_board_signed_beats_an_older_or_newer_draft(self):
        self.triage_note(status="signed")
        self.triage_note(status="draft")
        self.assertEqual(self.board_visit()["triage"]["note"], "signed")

    def test_board_shows_due_time_count_and_last_recheck(self):
        self.gaps(l3=45)
        self.triage_note(signed_minutes_ago=50)
        t = self.board_visit()["triage"]
        self.assertEqual((t["gap_minutes"], t["reassessments"]), (45, 0))
        self.assertLess(dt.datetime.fromisoformat(t["due_at"]), timezone.now())  # overdue by about 5 minutes
        self.add({"change": "Stable"})
        t = self.board_visit()["triage"]
        self.assertEqual(t["reassessments"], 1)
        self.assertIsNotNone(t["last_at"])
        self.assertGreater(dt.datetime.fromisoformat(t["due_at"]), timezone.now())

    def test_board_has_no_due_time_without_a_gap(self):
        self.triage_note()
        t = self.board_visit()["triage"]
        self.assertIsNone(t["due_at"])
        self.assertIsNone(t["gap_minutes"])

    def test_board_edit_response_carries_triage_too(self):
        self.triage_note()
        r = self.as_(self.nurse).patch(f"/api/users/admissions/{self.vid}/board/", {"comments": "hi"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["triage"]["note"], "signed")

    def test_new_columns_are_in_the_default_layout(self):
        keys = [c["key"] for c in self.board().json()["views"][0]["columns"]]
        self.assertIn("triage_note", keys)
        self.assertIn("reassess", keys)
        self.assertEqual(keys.index("triage_note"), keys.index("esi") + 1)
