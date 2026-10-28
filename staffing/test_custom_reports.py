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
        self.p1 = Patient.objects.create(user=u1, organization=self.org, phone_number="3015550111")
        self.p2 = Patient.objects.create(user=u2, organization=self.org, phone_number="3015550112")
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
        prof_a = Patient.objects.create(user=self.ann, organization=self.org, phone_number="3015550111")
        prof_b = Patient.objects.create(user=self.bo, organization=self.org, phone_number="3015550112")
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
            return Patient.objects.create(user=u, organization=self.org, phone_number=phone)

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
