from datetime import date, datetime, timedelta

import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from appointments.models import Facility
from appointments.test_locations import Base, make_user
from users.models import Registration

from .models import CaseHistory, SurgeryCase, SurgeryRoom
from .services import age_text

API = "/api/surgery/"


def at(day, hhmm):
    h, m = hhmm.split(":")
    return timezone.make_aware(datetime(day.year, day.month, day.day, int(h), int(m)))


class SurgeryBase(Base):
    def setUp(self):
        super().setUp()
        self.day = date(2026, 11, 3)
        self.or1 = SurgeryRoom.objects.create(facility=self.hospital, name="OR-1", sort_order=1)
        self.or2 = SurgeryRoom.objects.create(facility=self.hospital, name="OR-2", sort_order=2)
        self.patient.date_of_birth = date(1960, 1, 31)
        self.patient.legal_sex = "F"
        self.patient.save()

    def book(self, user=None, start="08:00", **extra):
        body = {
            "patient": self.patient.pk, "facility": self.hospital.pk, "room": self.or1.pk,
            "scheduled_start": at(self.day, start).isoformat(), "duration_minutes": 90,
            "surgeon": self.doctor.pk, "service": "Urology", "case_type": "elective",
            "procedures": [{"name": "CYSTOSCOPY", "laterality": "right"}, {"name": "STENT"}],
        }
        body.update(extra)
        return self.as_(user or self.nurse).post(API + "cases/", body, format="json")

    def make_case(self, **extra):
        r = self.book(**extra)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def move(self, case_id, status, user=None, **extra):
        return self.as_(user or self.nurse).post(f"{API}cases/{case_id}/status/", {"status": status, **extra}, format="json")


class BookingTests(SurgeryBase):
    def test_booking_assigns_case_number_and_returns_list_fields(self):
        row = self.make_case()
        self.assertEqual(row["case_number"], 1001)
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["status_label"], "Pending")
        self.assertEqual((row["date"], row["time"]), ("2026-11-03", "08:00"))
        self.assertEqual(row["room"]["name"], "OR-1")
        self.assertEqual(row["patient"]["name"], "Bcs, Test")
        self.assertEqual(row["patient"]["mrn"], self.patient.mrn)
        self.assertEqual(row["procedures_text"], "CYSTOSCOPY [Right]; STENT")
        self.assertTrue(row["procedures"][0]["is_primary"])
        self.assertEqual(row["next_statuses"], ["preop", "cancelled"])
        self.assertEqual(self.make_case(start="10:00")["case_number"], 1002)

    def test_case_numbers_are_per_organization(self):
        self.make_case()
        other_hospital = Facility.objects.create(organization=self.other_org, name="Elsewhere Hospital")
        from users.models import Patient
        other_user = make_user("pat3", "patient", self.other_org, first_name="Zed", last_name="Zed")
        other_patient = Patient.objects.get(user=other_user)
        other_patient.organization = self.other_org
        other_patient.save()
        other_nurse = make_user("n2", "nurse", self.other_org)
        r = self.as_(other_nurse).post(API + "cases/", {
            "patient": other_patient.pk, "facility": other_hospital.pk,
            "scheduled_start": at(self.day, "09:00").isoformat()}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["case_number"], 1001)

    def test_requires_patient_time_and_facility(self):
        r = self.as_(self.nurse).post(API + "cases/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("patient", r.json())
        self.assertIn("scheduled_start", r.json())

    def test_facility_comes_from_the_room_when_left_out(self):
        r = self.as_(self.nurse).post(API + "cases/", {
            "patient": self.patient.pk, "room": self.or2.pk, "scheduled_start": at(self.day, "09:00").isoformat()}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["facility"], self.hospital.pk)

    def test_room_must_belong_to_the_facility(self):
        clinic = Facility.objects.create(organization=self.org, name="Clinic Annex")
        r = self.book(facility=clinic.pk)
        self.assertEqual(r.status_code, 400)
        self.assertIn("room", r.json())

    def test_other_organizations_records_are_rejected(self):
        from users.models import Patient
        u = make_user("pat4", "patient", self.other_org, first_name="Out", last_name="Sider")
        outsider = Patient.objects.get(user=u)
        outsider.organization = self.other_org
        outsider.save()
        self.assertEqual(self.book(patient=outsider.pk).status_code, 400)

    def test_visit_must_belong_to_the_patient(self):
        self.patient2.organization = self.org
        self.patient2.save()
        visit = Registration.objects.create(patient=self.patient2, organization=self.org)
        r = self.book(visit=visit.pk)
        self.assertEqual(r.status_code, 400)
        self.assertIn("visit", r.json())

    def test_visit_link_shows_the_visit_number(self):
        visit = Registration.objects.create(patient=self.patient, organization=self.org)
        row = self.make_case(visit=visit.pk)
        self.assertEqual(row["visit"]["id"], visit.pk)
        self.assertTrue(row["visit"]["visit_number"])

    def test_overlap_is_a_warning_not_a_block(self):
        self.make_case(start="08:00")
        r = self.book(start="09:00")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["warnings"], ["Overlaps case 1001 in OR-1"])
        self.assertEqual(self.book(start="09:00", room=self.or2.pk).json()["warnings"], [])

    def test_patients_and_patient_role_cannot_use_the_module(self):
        self.assertEqual(self.as_(self.patient_user).get(API + "cases/").status_code, 403)
        self.assertEqual(self.client.__class__().get(API + "cases/").status_code, 401)


class CaseListTests(SurgeryBase):
    def test_lists_one_day_in_time_order_with_legend(self):
        late = self.make_case(start="14:00")
        early = self.make_case(start="07:30", room=self.or2.pk)
        self.make_case(start="08:00", scheduled_start=at(self.day + timedelta(days=1), "08:00").isoformat())
        self.move(early["id"], "preop")
        data = self.as_(self.nurse).get(API + "cases/", {"date": "2026-11-03"}).json()
        self.assertEqual([r["id"] for r in data["results"]], [early["id"], late["id"]])
        self.assertEqual(data["count"], 2)
        legend = {x["status"]: x["count"] for x in data["legend"]}
        self.assertEqual((legend["pending"], legend["preop"], legend["pacu"]), (1, 1, 0))

    def test_filters(self):
        a = self.make_case(start="08:00", service="Urology")
        b = self.make_case(start="10:00", room=self.or2.pk, service="Orthopedic Surgery", case_type="urgent",
                           procedures=[{"name": "TOTAL KNEE REPLACEMENT", "laterality": "left"}])
        self.move(b["id"], "preop")
        def ids(**params):
            return [r["id"] for r in self.as_(self.nurse).get(API + "cases/", {"date": "2026-11-03", **params}).json()["results"]]
        self.assertEqual(ids(status="preop"), [b["id"]])
        self.assertEqual(ids(status="pending,preop"), [a["id"], b["id"]])
        self.assertEqual(ids(room=self.or2.pk), [b["id"]])
        self.assertEqual(ids(service="urology"), [a["id"]])
        self.assertEqual(ids(case_type="urgent"), [b["id"]])
        self.assertEqual(ids(q="knee"), [b["id"]])
        self.assertEqual(ids(q=str(a["case_number"])), [a["id"]])
        self.assertEqual(ids(q=self.patient.mrn), [a["id"], b["id"]])
        self.assertEqual(ids(q="nobody"), [])

    def test_date_range(self):
        self.make_case()
        self.make_case(scheduled_start=at(self.day + timedelta(days=2), "08:00").isoformat())
        data = self.as_(self.nurse).get(API + "cases/", {"date": "2026-11-03", "date_to": "2026-11-05"}).json()
        self.assertEqual(data["count"], 2)

    def test_other_organization_sees_nothing(self):
        self.make_case()
        stranger = make_user("n3", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(API + "cases/", {"date": "2026-11-03"}).json()["count"], 0)

    def test_facility_assignment_limits_the_list(self):
        self.make_case()
        annex = Facility.objects.create(organization=self.org, name="Annex")
        limited = make_user("n4", "nurse", self.org)
        limited.facilities.add(annex)
        self.assertEqual(self.as_(limited).get(API + "cases/", {"date": "2026-11-03"}).json()["count"], 0)
        self.assertEqual(self.as_(self.nurse).get(API + "cases/", {"date": "2026-11-03"}).json()["count"], 1)

    def test_bad_date(self):
        self.assertEqual(self.as_(self.nurse).get(API + "cases/", {"date": "11/03/2026"}).status_code, 400)


class StatusFlowTests(SurgeryBase):
    def test_full_flow_stamps_times(self):
        case = self.make_case()
        for new in ("preop", "or", "pacu", "discharged"):
            r = self.move(case["id"], new)
            self.assertEqual(r.status_code, 200, r.content)
            self.assertEqual(r.json()["status"], new)
        times = r.json()["times"]
        for f in ("preop_start", "patient_in", "patient_out", "pacu_start", "discharged_at"):
            self.assertIsNotNone(times[f], f)
        self.assertIsNone(times["procedure_start"])
        self.assertEqual(r.json()["next_statuses"], [])

    def test_skipping_a_step_is_409(self):
        case = self.make_case()
        r = self.move(case["id"], "or")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["allowed"], ["preop", "cancelled"])
        self.assertEqual(SurgeryCase.objects.get(pk=case["id"]).status, "pending")

    def test_unknown_status_is_400(self):
        self.assertEqual(self.move(self.make_case()["id"], "flying").status_code, 400)

    def test_cancel_needs_a_reason_and_closes_the_case(self):
        case = self.make_case()
        self.assertEqual(self.move(case["id"], "cancelled").status_code, 409)
        r = self.move(case["id"], "cancelled", reason="Patient ate breakfast")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["cancel_reason"], "Patient ate breakfast")
        self.assertEqual(self.move(case["id"], "preop").status_code, 409)

    def test_transfer_to_inpatient_from_pacu(self):
        case = self.make_case()
        for s in ("preop", "or", "pacu"):
            self.move(case["id"], s)
        self.assertEqual(self.move(case["id"], "transferred").json()["status_label"], "Transferred to Inpatient")

    def test_existing_time_is_not_overwritten_by_the_stamp(self):
        case = self.make_case()
        manual = at(self.day, "07:10")
        self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"preop_start": manual.isoformat()}, format="json")
        r = self.move(case["id"], "preop")
        self.assertEqual(r.json()["times"]["preop_start"], "2026-11-03T07:10-05:00")


class EditTests(SurgeryBase):
    def test_edit_moves_room_and_writes_history(self):
        case = self.make_case()
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"room": self.or2.pk, "comments": "add loupes"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["room"]["name"], "OR-2")
        hist = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        self.assertEqual([h["action"] for h in hist], ["updated", "created"])
        fields = {c["field"]: (c["previous"], c["new"]) for c in hist[0]["changes"]}
        self.assertEqual(fields["room_id"], (str(self.or1.pk), str(self.or2.pk)))
        self.assertEqual(fields["comments"], ("", "add loupes"))

    def test_replacing_procedures(self):
        case = self.make_case()
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"procedures": [{"name": "HIP", "laterality": "left"}]}, format="json")
        self.assertEqual(r.json()["procedures_text"], "HIP [Left]")

    def test_times_cannot_run_backwards(self):
        case = self.make_case()
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {
            "patient_in": at(self.day, "09:00").isoformat(), "procedure_start": at(self.day, "08:00").isoformat()}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("procedure_start", r.json())

    def test_closed_case_only_takes_comments(self):
        case = self.make_case()
        self.move(case["id"], "cancelled", reason="x")
        self.assertEqual(self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"room": self.or2.pk}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"comments": "note"}, format="json").status_code, 200)

    def test_status_changes_are_in_history(self):
        case = self.make_case()
        self.move(case["id"], "preop")
        hist = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        self.assertEqual(hist[0]["action"], "status")
        fields = {c["field"]: c["new"] for c in hist[0]["changes"]}
        self.assertEqual(fields["status"], "preop")
        self.assertIn("preop_start", fields)

    def test_cannot_edit_another_organizations_case(self):
        case = self.make_case()
        stranger = make_user("n5", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).patch(f"{API}cases/{case['id']}/", {"comments": "x"}, format="json").status_code, 404)
        self.assertEqual(self.move(case["id"], "preop", user=stranger).status_code, 404)


class PlannerTests(SurgeryBase):
    def test_planner_rooms_bars_legend_and_overlap(self):
        a = self.make_case(start="08:00")
        b = self.make_case(start="09:00")  # overlaps a in OR-1
        c = self.make_case(start="08:00", room=self.or2.pk, duration_minutes=30)
        free = self.as_(self.nurse).post(API + "cases/", {
            "patient": self.patient.pk, "facility": self.hospital.pk, "scheduled_start": at(self.day, "11:00").isoformat()}, format="json").json()
        self.move(c["id"], "preop")
        d = self.as_(self.nurse).get(API + "planner/", {"date": "2026-11-03"}).json()
        self.assertEqual(d["facility"], self.hospital.pk)
        self.assertEqual([r["name"] for r in d["rooms"]], ["OR-1", "OR-2"])
        or1 = d["rooms"][0]["cases"]
        self.assertEqual([x["id"] for x in or1], [a["id"], b["id"]])
        self.assertTrue(all(x["overlap"] for x in or1))
        self.assertFalse(d["rooms"][1]["cases"][0]["overlap"])
        self.assertEqual(d["rooms"][1]["cases"][0]["label"], f"{c['case_number']} / {self.patient.mrn} / Elective / In PreOp")
        self.assertEqual([x["id"] for x in d["unassigned"]], [free["id"]])
        legend = {x["status"]: x["count"] for x in d["legend"]}
        self.assertEqual((legend["pending"], legend["preop"]), (3, 1))
        self.assertEqual((d["day_start"], d["day_end"]), (7, 19))

    def test_hours_stretch_for_early_and_late_cases(self):
        self.make_case(start="05:30", duration_minutes=60)
        self.make_case(start="20:15", duration_minutes=90, room=self.or2.pk)
        d = self.as_(self.nurse).get(API + "planner/", {"date": "2026-11-03"}).json()
        self.assertEqual((d["day_start"], d["day_end"]), (5, 22))

    def test_cancelled_cases_do_not_count_as_overlap(self):
        a = self.make_case(start="08:00")
        b = self.make_case(start="09:00")
        self.move(b["id"], "cancelled", reason="x")
        d = self.as_(self.nurse).get(API + "planner/", {"date": "2026-11-03"}).json()
        self.assertFalse(any(x["overlap"] for x in d["rooms"][0]["cases"]))

    def test_status_counts_endpoint(self):
        self.make_case()
        d = self.as_(self.nurse).get(API + "status-counts/", {"date": "2026-11-03"}).json()
        self.assertEqual(len(d["legend"]), 7)
        self.assertEqual({x["status"]: x["count"] for x in d["legend"]}["pending"], 1)

    def test_facility_choice_and_unknown_facility(self):
        annex = Facility.objects.create(organization=self.org, name="Annex")
        d = self.as_(self.nurse).get(API + "planner/", {"date": "2026-11-03", "facility": annex.pk}).json()
        self.assertEqual((d["facility"], d["rooms"]), (annex.pk, []))
        self.assertEqual({f["name"] for f in d["facilities"]}, {"General Hospital", "Annex"})


class RoomTests(SurgeryBase):
    def test_only_admins_manage_rooms(self):
        body = {"facility": self.hospital.pk, "name": "OR-3"}
        self.assertEqual(self.as_(self.nurse).post(API + "rooms/", body, format="json").status_code, 403)
        r = self.as_(self.admin).post(API + "rooms/", body, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.as_(self.admin).post(API + "rooms/", body, format="json").status_code, 409)
        names = [x["name"] for x in self.as_(self.nurse).get(API + "rooms/").json()]
        self.assertEqual(names, ["OR-1", "OR-2", "OR-3"])

    def test_deactivated_room_leaves_the_planner(self):
        self.as_(self.admin).patch(f"{API}rooms/{self.or2.pk}/", {"is_active": False}, format="json")
        d = self.as_(self.nurse).get(API + "planner/", {"date": "2026-11-03"}).json()
        self.assertEqual([r["name"] for r in d["rooms"]], ["OR-1"])


class AgeTests(Base):
    def test_age_text(self):
        today = date(2026, 11, 3)
        self.assertEqual(age_text(date(1967, 3, 1), today), "59y")
        self.assertEqual(age_text(date(2024, 6, 1), today), "2y 5m")
        self.assertEqual(age_text(date(2024, 11, 1), today), "2y")
        self.assertEqual(age_text(date(2026, 1, 13), today), "9m 3w")
        self.assertEqual(age_text(date(2026, 10, 20), today), "2w 0d")


class CaseHeaderTests(SurgeryBase):
    def test_header_fields_save_and_come_back(self):
        case = self.make_case()
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {
            "planned_start": at(self.day, "07:45").isoformat(),
            "scheduled_delay_reason": "Surgeon Late",
            "physical_status": "ASA 3", "block_id": "VasAc", "requires_review": True, "review_reason": "Consent unclear",
            "booking_comments_2": "1ST CASE", "procedure_notes": "late", "provider_notes": "gloves 7",
            "time_reasons": {"patient_in": "Surgeon Late", "preop_start": ""},
        }, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        h = r.json()["header"]
        self.assertEqual((h["physical_status"], h["block_id"], h["requires_review"]), ("ASA 3", "VasAc", True))
        self.assertTrue(h["planned_start"].startswith("2026-11-03T07:45"))
        self.assertEqual(r.json()["time_reasons"], {"patient_in": "Surgeon Late"})
        self.assertEqual(self.as_(self.nurse).get(f"{API}cases/{case['id']}/").json()["header"]["provider_notes"], "gloves 7")

    def test_unknown_time_reason_key_rejected(self):
        case = self.make_case()
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"time_reasons": {"bogus": "x"}}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_actual_times_delay_and_duration_are_computed(self):
        case = self.make_case(start="07:30")
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {
            "patient_in": at(self.day, "08:02").isoformat(), "patient_out": at(self.day, "10:38").isoformat()}, format="json")
        h = r.json()["header"]
        self.assertTrue(h["actual_start"].startswith("2026-11-03T08:02") and h["actual_end"].startswith("2026-11-03T10:38"))
        self.assertEqual(h["actual_minutes"], 156)
        self.assertEqual(h["scheduled_delay_minutes"], 32)

    def test_on_time_start_has_no_delay(self):
        case = self.make_case(start="08:00")
        r = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"patient_in": at(self.day, "07:50").isoformat()}, format="json")
        self.assertEqual(r.json()["header"]["scheduled_delay_minutes"], 0)

    def test_ready_for_or_and_preop_end_keep_milestone_order(self):
        case = self.make_case()
        ok = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {
            "preop_start": at(self.day, "06:49").isoformat(), "ready_for_or": at(self.day, "07:58").isoformat(),
            "preop_end": at(self.day, "08:00").isoformat(), "patient_in": at(self.day, "08:02").isoformat()}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        bad = self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"preop_end": at(self.day, "06:00").isoformat()}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("preop_end", bad.json())

    def test_last_status_modification_shows_who_and_when(self):
        case = self.make_case()
        self.assertIsNone(self.as_(self.nurse).get(f"{API}cases/{case['id']}/").json()["header"]["last_status_change"])
        self.move(case["id"], "preop")
        last = self.as_(self.nurse).get(f"{API}cases/{case['id']}/").json()["header"]["last_status_change"]
        self.assertTrue(last["at"])

    def test_closed_case_still_takes_notes_but_not_other_header_fields(self):
        case = self.make_case()
        self.move(case["id"], "cancelled", reason="Patient ill")
        url = f"{API}cases/{case['id']}/"
        self.assertEqual(self.as_(self.nurse).patch(url, {"procedure_notes": "post hoc"}, format="json").status_code, 200)
        self.assertEqual(self.as_(self.nurse).patch(url, {"block_id": "X"}, format="json").status_code, 409)

    def test_header_changes_are_in_history(self):
        case = self.make_case()
        self.as_(self.nurse).patch(f"{API}cases/{case['id']}/", {"physical_status": "ASA 2"}, format="json")
        entries = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        fields = {c["field"]: (c["previous"], c["new"]) for e in entries for c in e["changes"]}
        self.assertEqual(fields["physical_status"], ("", "ASA 2"))

    def test_lookups(self):
        r = self.as_(self.nurse).get(API + "lookups/").json()
        self.assertIn("ASA 3", r["physical_statuses"])
        self.assertIn("anesthesiologist", [x["value"] for x in r["participant_roles"]])
        self.assertEqual(r["me"]["id"], self.nurse.pk)
        self.assertEqual(r["me"]["title"], "RN")


class ParticipantTests(SurgeryBase):
    def url(self, case, pid=None):
        base = f"{API}cases/{case['id']}/participants/"
        return base + (f"{pid}/" if pid else "")

    def add(self, case, **body):
        body.setdefault("role", "surgeon_primary")
        body.setdefault("user", self.doctor.pk)
        return self.as_(self.nurse).post(self.url(case), body, format="json")

    def test_add_list_edit_remove(self):
        case = self.make_case()
        r = self.add(case, time_in=at(self.day, "08:02").isoformat())
        self.assertEqual(r.status_code, 201, r.content)
        row = r.json()
        self.assertEqual(row["role_label"], "Surgeon, Primary")
        self.assertTrue(row["display"].endswith("(MD)"))
        self.assertTrue(row["time_in"].startswith("2026-11-03T08:02"))
        self.assertEqual(len(self.as_(self.nurse).get(self.url(case)).json()), 1)
        r = self.as_(self.nurse).patch(self.url(case, row["id"]), {"time_out": at(self.day, "10:38").isoformat(), "comments": "ok"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["time_out"].startswith("2026-11-03T10:38"))
        self.assertEqual(r.json()["comments"], "ok")
        self.assertEqual(self.as_(self.nurse).delete(self.url(case, row["id"])).status_code, 204)
        self.assertEqual(self.as_(self.nurse).get(self.url(case)).json(), [])

    def test_vendor_can_be_a_typed_name(self):
        case = self.make_case()
        r = self.add(case, role="vendor", user=None, name="Stryker rep")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["display"], "Stryker rep")

    def test_needs_a_person_or_a_name(self):
        case = self.make_case()
        r = self.as_(self.nurse).post(self.url(case), {"role": "vendor"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_needs_a_valid_role(self):
        case = self.make_case()
        self.assertEqual(self.add(case, role="janitor").status_code, 400)

    def test_time_out_before_time_in_rejected(self):
        case = self.make_case()
        r = self.add(case, time_in=at(self.day, "10:00").isoformat(), time_out=at(self.day, "09:00").isoformat())
        self.assertEqual(r.status_code, 400)
        self.assertIn("time_out", r.json())

    def test_cannot_add_someone_from_another_organization(self):
        case = self.make_case()
        stranger = make_user("n9", "nurse", self.other_org)
        self.assertEqual(self.add(case, user=stranger.pk).status_code, 400)

    def test_patients_cannot_be_participants(self):
        case = self.make_case()
        self.assertEqual(self.add(case, user=self.patient.user_id).status_code, 400)

    def test_closed_case_locks_participants(self):
        case = self.make_case()
        row = self.add(case).json()
        self.move(case["id"], "cancelled", reason="x")
        self.assertEqual(self.add(case, role="rn_circulator", user=self.nurse.pk).status_code, 409)
        self.assertEqual(self.as_(self.nurse).delete(self.url(case, row["id"])).status_code, 409)

    def test_other_organizations_case_is_not_found(self):
        case = self.make_case()
        stranger = make_user("n8", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(self.url(case)).status_code, 404)

    def test_participant_changes_are_in_history(self):
        case = self.make_case()
        self.add(case)
        entries = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        self.assertIn("participant", [e["action"] for e in entries])

    def test_staff_search_is_scoped_and_filtered(self):
        stranger = make_user("n7", "nurse", self.other_org, first_name="Zed", last_name="Outsider")
        r = self.as_(self.nurse).get(API + "staff/").json()
        ids = [p["id"] for p in r]
        self.assertIn(self.doctor.pk, ids)
        self.assertNotIn(stranger.pk, ids)
        self.assertNotIn(self.patient.user_id, ids)
        last = self.doctor.last_name
        r = self.as_(self.nurse).get(API + f"staff/?q={last}").json()
        self.assertTrue(all(last.lower() in p["name"].lower() for p in r))


class UsageTests(SurgeryBase):
    def card(self, name="TOMASULA, J - AV FISTULA", user=None, **extra):
        body = {"name": name, "procedure_name": "AV FISTULA", "pre_op_notes": "Pre note", "post_op_notes": "Clip 11.5", "items": [
            {"category": "UNSTERILE", "name": "CHUCKS", "quantity": 2, "charge_code": "OOR11665", "department": "SUNY Main OR"},
            {"category": "INSTRUMENT", "name": "SET, DOUBLE BASIN"},
        ], **extra}
        return self.as_(user or self.admin).post(API + "preference-cards/", body, format="json")

    def setUp(self):
        super().setUp()
        self.admin = make_user("adm1", "admin", self.org)

    def test_only_admins_create_cards(self):
        self.assertEqual(self.card(user=self.nurse).status_code, 403)
        r = self.card()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["items"]), 2)
        self.assertEqual(self.card().status_code, 409)  # same name

    def test_cards_are_searchable_and_org_scoped(self):
        self.card()
        stranger = make_user("n6", "nurse", self.other_org)
        self.assertEqual(len(self.as_(self.nurse).get(API + "preference-cards/?q=fistula").json()), 1)
        self.assertEqual(self.as_(self.nurse).get(API + "preference-cards/?q=zzz").json(), [])
        self.assertEqual(self.as_(stranger).get(API + "preference-cards/").json(), [])

    def test_merging_a_card_copies_supplies_and_makes_it_primary(self):
        case = self.make_case()
        card = self.card().json()
        r = self.as_(self.nurse).post(f"{API}cases/{case['id']}/cards/", {"card": card["id"]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["merge_status"], "Primary")
        usage = self.as_(self.nurse).get(f"{API}cases/{case['id']}/usage/").json()
        chucks = next(u for u in usage if u["name"] == "CHUCKS")
        self.assertEqual((chucks["total"], chucks["used"], chucks["category_label"]), (2, 2, "Unsterile"))
        info = self.as_(self.nurse).get(f"{API}cases/{case['id']}/cards/").json()
        self.assertEqual((info["pre_op_notes"], info["post_op_notes"]), ("Pre note", "Clip 11.5"))

    def test_second_card_is_merged_and_shared_supplies_add_up(self):
        case = self.make_case()
        a = self.card().json()
        b = self.card(name="SECOND", post_op_notes="other").json()
        for c in (a, b):
            self.as_(self.nurse).post(f"{API}cases/{case['id']}/cards/", {"card": c["id"]}, format="json")
        usage = self.as_(self.nurse).get(f"{API}cases/{case['id']}/usage/").json()
        self.assertEqual(len(usage), 2)
        self.assertEqual(next(u for u in usage if u["name"] == "CHUCKS")["total"], 4)
        cards = self.as_(self.nurse).get(f"{API}cases/{case['id']}/cards/").json()["cards"]
        self.assertEqual([c["merge_status"] for c in cards], ["Primary", "Merged"])

    def test_same_card_twice_rejected_and_primary_can_move(self):
        case = self.make_case()
        a, b = self.card().json(), self.card(name="SECOND", post_op_notes="other").json()
        url = f"{API}cases/{case['id']}/cards/"
        self.as_(self.nurse).post(url, {"card": a["id"]}, format="json")
        self.assertEqual(self.as_(self.nurse).post(url, {"card": a["id"]}, format="json").status_code, 409)
        link_b = self.as_(self.nurse).post(url, {"card": b["id"]}, format="json").json()
        self.as_(self.nurse).post(f"{url}{link_b['id']}/", format="json")
        info = self.as_(self.nurse).get(url).json()
        self.assertEqual((info["primary"], info["post_op_notes"]), ("SECOND", "other"))

    def test_removing_the_primary_promotes_the_next_card(self):
        case = self.make_case()
        a, b = self.card().json(), self.card(name="SECOND").json()
        url = f"{API}cases/{case['id']}/cards/"
        link_a = self.as_(self.nurse).post(url, {"card": a["id"]}, format="json").json()
        self.as_(self.nurse).post(url, {"card": b["id"]}, format="json")
        self.assertEqual(self.as_(self.nurse).delete(f"{url}{link_a['id']}/").status_code, 204)
        self.assertEqual(self.as_(self.nurse).get(url).json()["primary"], "SECOND")

    def test_add_edit_remove_supply_and_used_is_computed(self):
        case = self.make_case()
        url = f"{API}cases/{case['id']}/usage/"
        r = self.as_(self.nurse).post(url, {"category": "MEDICATIONS", "name": "SALINE", "total": 3}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        uid = r.json()["id"]
        r = self.as_(self.nurse).patch(f"{url}{uid}/", {"hold": 1, "wasted": 1}, format="json")
        self.assertEqual((r.json()["used"], r.status_code), (1, 200))
        self.assertEqual(self.as_(self.nurse).patch(f"{url}{uid}/", {"hold": 3}, format="json").status_code, 400)  # 3 + 1 > 3
        self.assertEqual(self.as_(self.nurse).delete(f"{url}{uid}/").status_code, 204)

    def test_supply_needs_a_name(self):
        case = self.make_case()
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{case['id']}/usage/", {"total": 1}, format="json").status_code, 400)

    def test_closed_case_locks_usage_and_cards(self):
        case = self.make_case()
        card = self.card().json()
        self.move(case["id"], "cancelled", reason="x")
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{case['id']}/usage/", {"name": "A"}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{case['id']}/cards/", {"card": card["id"]}, format="json").status_code, 409)

    def test_other_organizations_card_cannot_be_merged(self):
        case = self.make_case()
        other_admin = make_user("adm2", "admin", self.other_org)
        theirs = self.as_(other_admin).post(API + "preference-cards/", {"name": "X"}, format="json").json()
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{case['id']}/cards/", {"card": theirs["id"]}, format="json").status_code, 400)

    def test_usage_changes_are_in_history(self):
        case = self.make_case()
        self.as_(self.nurse).post(f"{API}cases/{case['id']}/usage/", {"name": "SALINE"}, format="json")
        entries = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        self.assertIn("usage", [e["action"] for e in entries])


class ChargeBase(SurgeryBase):
    def setUp(self):
        super().setUp()
        self.admin = make_user("adm3", "admin", self.org)

    def policy(self, **extra):
        body = {"name": "SUNY OR Time", "policy_type": "case_time", "first_code": "UOORL130", "first_minutes": 30,
                "extra_code": "UOORL115", "extra_minutes": 15, "description": "OR time", **extra}
        return self.as_(self.admin).post(API + "charge-policies/", body, format="json")

    def finished_case(self, mins=156):
        case = self.make_case(start="07:30")
        cid = case["id"]
        self.move(cid, "preop")
        self.move(cid, "or")
        end = at(self.day, "08:02") + timedelta(minutes=mins)
        r = self.as_(self.nurse).patch(f"{API}cases/{cid}/", {"preop_start": at(self.day, "06:49").isoformat(), "patient_in": at(self.day, "08:02").isoformat(), "patient_out": end.isoformat()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.move(cid, "pacu")
        return cid

    def gen(self, cid):
        return self.as_(self.nurse).post(f"{API}cases/{cid}/charges/generate/", format="json")



class ChargeTests(ChargeBase):
    def test_only_admins_manage_policies(self):
        self.assertEqual(self.as_(self.nurse).post(API + "charge-policies/", {"name": "x", "first_code": "A"}, format="json").status_code, 403)
        self.assertEqual(self.policy().status_code, 201)
        self.assertEqual(self.policy().status_code, 409)
        pid = self.as_(self.nurse).get(API + "charge-policies/").json()[0]["id"]
        self.assertEqual(self.as_(self.admin).patch(f"{API}charge-policies/{pid}/", {"first_minutes": 60}, format="json").json()["first_minutes"], 60)

    def test_case_time_charge_uses_first_block_then_extra_blocks(self):
        self.policy()
        cid = self.finished_case(156)  # 156 min: 1st 30, then ceil(126/15) = 9 extra
        r = self.gen(cid)
        self.assertEqual(r.status_code, 200, r.content)
        rows = {c["charge_code"]: c for c in r.json()["charges"]}
        self.assertEqual(rows["UOORL130"]["quantity"], 1)
        self.assertEqual(rows["UOORL115"]["quantity"], 9)
        self.assertEqual(rows["UOORL115"]["policy_type_label"], "Case Time based")
        self.assertEqual(r.json()["charge_status"], "Pending Post")

    def test_short_case_has_no_extra_block(self):
        self.policy()
        r = self.gen(self.finished_case(25))
        self.assertEqual([c["charge_code"] for c in r.json()["charges"]], ["UOORL130"])

    def test_usage_charges_bill_the_used_amount(self):
        cid = self.finished_case()
        url = f"{API}cases/{cid}/usage/"
        a = self.as_(self.nurse).post(url, {"name": "SUTURE", "total": 4, "wasted": 1, "charge_code": "OOR91069"}, format="json").json()
        self.as_(self.nurse).post(url, {"name": "TABLE", "total": 1}, format="json")  # no charge code
        self.as_(self.nurse).post(url, {"name": "UNUSED", "total": 1, "hold": 1, "charge_code": "OOR1"}, format="json")  # used 0
        rows = self.gen(cid).json()["charges"]
        self.assertEqual([(c["charge_code"], c["quantity"], c["policy_type"]) for c in rows], [("OOR91069", 3, "usage")])

    def test_missing_times_gives_a_warning_not_a_charge(self):
        self.policy()
        case = self.make_case()
        self.move(case["id"], "preop")
        r = self.gen(case["id"])
        self.assertEqual(r.json()["charges"], [])
        self.assertTrue(r.json()["warnings"])

    def test_anesthesia_time_uses_the_anesthesiologists(self):
        self.policy(name="Anes", first_code="ANSG0001", extra_code="ANSG0002", time_basis="anesthesia")
        cid = self.finished_case(60)
        self.as_(self.nurse).post(f"{API}cases/{cid}/participants/", {
            "role": "anesthesiologist", "user": self.doctor.pk,
            "time_in": at(self.day, "07:50").isoformat(), "time_out": at(self.day, "09:20").isoformat()}, format="json")
        rows = {c["charge_code"]: c for c in self.gen(cid).json()["charges"]}
        self.assertEqual(rows["ANSG0002"]["quantity"], 4)  # 90 min: ceil(60/15)

    def test_regenerating_replaces_pending_but_keeps_posted_and_manual(self):
        self.policy()
        cid = self.finished_case()
        self.gen(cid)
        manual = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/", {"charge_code": "MISC1", "quantity": 2}, format="json").json()
        posted = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/post/", {"ids": [manual["id"]]}, format="json")
        self.assertEqual(posted.status_code, 200)
        again = self.gen(cid).json()
        codes = [c["charge_code"] for c in again["charges"]]
        self.assertEqual(codes.count("UOORL130"), 1)  # not doubled
        self.assertIn("MISC1", codes)
        self.assertEqual(next(c for c in again["charges"] if c["charge_code"] == "MISC1")["status"], "posted")

    def test_post_all_then_status_is_posted_and_charges_lock(self):
        self.policy()
        cid = self.finished_case()
        self.gen(cid)
        r = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/post/", format="json")
        self.assertEqual(r.json()["charge_status"], "Posted")
        charge = r.json()["charges"][0]
        self.assertEqual(self.as_(self.nurse).patch(f"{API}cases/{cid}/charges/{charge['id']}/", {"quantity": 5}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.nurse).delete(f"{API}cases/{cid}/charges/{charge['id']}/").status_code, 409)
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{cid}/charges/post/", format="json").status_code, 409)

    def test_cannot_post_before_patient_is_out_or_for_cancelled(self):
        self.policy()
        case = self.make_case()
        self.assertEqual(self.gen(case["id"]).status_code, 409)  # not started
        self.move(case["id"], "preop")
        self.move(case["id"], "or")
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{case['id']}/charges/post/", format="json").status_code, 409)
        self.move(case["id"], "cancelled", reason="x")
        self.assertEqual(self.gen(case["id"]).status_code, 409)

    def test_edit_price_and_quantity_and_total(self):
        cid = self.finished_case()
        c = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/", {"charge_code": "MISC1", "quantity": 2, "item_charge": "12.50"}, format="json").json()
        self.assertEqual(c["total_charge"], "25.00")
        r = self.as_(self.nurse).patch(f"{API}cases/{cid}/charges/{c['id']}/", {"quantity": 3}, format="json").json()
        self.assertEqual(r["total_charge"], "37.50")
        self.assertEqual(self.as_(self.nurse).delete(f"{API}cases/{cid}/charges/{c['id']}/").status_code, 204)

    def test_manual_charge_needs_a_code(self):
        cid = self.finished_case()
        self.assertEqual(self.as_(self.nurse).post(f"{API}cases/{cid}/charges/", {"quantity": 1}, format="json").status_code, 400)

    def test_policies_and_charges_are_org_scoped(self):
        self.policy()
        cid = self.finished_case()
        stranger = make_user("n5", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(API + "charge-policies/").json(), [])
        self.assertEqual(self.as_(stranger).get(f"{API}cases/{cid}/charges/").status_code, 404)

    def test_charge_actions_are_in_history(self):
        self.policy()
        cid = self.finished_case()
        self.gen(cid)
        entries = self.as_(self.nurse).get(f"{API}cases/{cid}/history/").json()
        self.assertIn("charge", [e["action"] for e in entries])


class PriceListTests(ChargeBase):
    def price(self, code="UOORL130", value="450.00", user=None):
        return self.as_(user or self.admin).post(API + "charge-prices/", {"charge_code": code, "unit_price": value, "description": "x"}, format="json")

    def test_only_admins_edit_prices_and_codes_are_normalised(self):
        self.assertEqual(self.price(user=self.nurse).status_code, 403)
        r = self.price(code=" uoorl130 - OR TIME ")
        self.assertEqual((r.status_code, r.json()["charge_code"]), (201, "UOORL130"))
        again = self.price(code="UOORL130", value="500")
        self.assertEqual((again.status_code, again.json()["unit_price"]), (200, "500.00"))  # updated, not duplicated
        self.assertEqual(len(self.as_(self.nurse).get(API + "charge-prices/").json()), 1)

    def test_negative_price_rejected(self):
        self.assertEqual(self.price(value="-1").status_code, 400)

    def test_generated_charges_pick_up_prices(self):
        self.policy()
        self.price("UOORL130", "450.00")
        self.price("UOORL115", "100")
        self.price("OOR91069", "7.25")
        cid = self.finished_case(156)
        self.as_(self.nurse).post(f"{API}cases/{cid}/usage/", {"name": "SUTURE", "total": 4, "charge_code": "OOR91069 - SUTURE, PROLENE"}, format="json")
        rows = {c["charge_code"].split(" ")[0]: c for c in self.gen(cid).json()["charges"]}
        self.assertEqual((rows["UOORL130"]["item_charge"], rows["UOORL130"]["total_charge"]), ("450.00", "450.00"))
        self.assertEqual(rows["UOORL115"]["total_charge"], "900.00")  # 9 x 100
        self.assertEqual(rows["OOR91069"]["total_charge"], "29.00")  # 4 x 7.25

    def test_manual_charge_uses_list_price_unless_overridden(self):
        cid = self.finished_case()
        self.price("MISC1", "10")
        a = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/", {"charge_code": "misc1 - thing", "quantity": 2}, format="json").json()
        b = self.as_(self.nurse).post(f"{API}cases/{cid}/charges/", {"charge_code": "MISC1", "item_charge": "3"}, format="json").json()
        self.assertEqual((a["total_charge"], b["item_charge"]), ("20.00", "3.00"))

    def test_prices_are_org_scoped_and_deletable(self):
        pid = self.price().json()["id"]
        stranger = make_user("n4", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(API + "charge-prices/").json(), [])
        self.assertEqual(self.as_(self.nurse).delete(f"{API}charge-prices/{pid}/").status_code, 403)
        self.assertEqual(self.as_(self.admin).delete(f"{API}charge-prices/{pid}/").status_code, 204)
        self.assertEqual(self.as_(self.admin).delete(f"{API}charge-prices/{pid}/").status_code, 404)


class VisitLinkTests(SurgeryBase):
    def visit(self, patient=None, discharged=False, created=None):
        v = Registration.objects.create(patient=patient or self.patient, organization=self.org, scheduled_procedure="Hernia")
        if discharged:
            v.discharge_datetime = timezone.now()
            v.save()
        if created:
            Registration.objects.filter(pk=v.pk).update(created_at=created)
        return v

    def url(self, case, qs=""):
        return f"{API}cases/{case['id']}/visits/{qs}"

    def test_lists_only_this_patients_visits_newest_first(self):
        case = self.make_case()
        old = self.visit(created=at(date(2026, 10, 1), "09:00"))
        new = self.visit()
        self.visit(patient=self.patient2)
        rows = self.as_(self.nurse).get(self.url(case)).json()
        self.assertEqual([r["id"] for r in rows], [new.pk, old.pk])
        self.assertEqual(rows[0]["reason"], "Hernia")

    def test_filters_by_status_and_date_range(self):
        case = self.make_case()
        self.visit(created=at(date(2026, 10, 1), "09:00"))
        done = self.visit(discharged=True, created=at(date(2026, 10, 15), "09:00"))
        recent = self.visit()
        get = lambda qs: [r["id"] for r in self.as_(self.nurse).get(self.url(case, qs)).json()]
        self.assertEqual(get("?status=open").count(done.pk), 0)
        self.assertEqual(get("?status=discharged"), [done.pk])
        self.assertEqual(get("?date_from=2026-10-10&date_to=2026-10-20"), [done.pk])
        self.assertIn(recent.pk, get("?date_from=2026-10-10"))
        self.assertEqual(self.as_(self.nurse).get(self.url(case, "?date_from=nope")).status_code, 400)

    def test_marks_the_linked_visit_and_visits_linked_to_other_cases(self):
        v = self.visit()
        w = self.visit()
        mine = self.make_case(visit=v.pk)
        self.make_case(start="10:00", visit=w.pk)
        rows = {r["id"]: r for r in self.as_(self.nurse).get(self.url(mine)).json()}
        self.assertTrue(rows[v.pk]["linked"])
        self.assertFalse(rows[w.pk]["linked"])
        self.assertEqual(rows[w.pk]["other_case"], 1002)
        self.assertIsNone(rows[v.pk]["other_case"])

    def test_link_and_unlink_through_the_case_update_and_history(self):
        case = self.make_case()
        v = self.visit()
        url = f"{API}cases/{case['id']}/"
        r = self.as_(self.nurse).patch(url, {"visit": v.pk}, format="json")
        self.assertEqual(r.json()["visit"]["id"], v.pk)
        r = self.as_(self.nurse).patch(url, {"visit": None}, format="json")
        self.assertIsNone(r.json()["visit"])
        fields = [c["field"] for e in self.as_(self.nurse).get(url + "history/").json() for c in e["changes"]]
        self.assertEqual(fields.count("visit_id"), 2)

    def test_other_organizations_case_is_not_found(self):
        case = self.make_case()
        stranger = make_user("n3", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(self.url(case)).status_code, 404)


_MEDIA = tempfile.mkdtemp(prefix="surgery-docs-")
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20


@override_settings(MEDIA_ROOT=_MEDIA)
class DocumentTests(SurgeryBase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def upload(self, case, name="consent.pdf", data=PDF, user=None, **extra):
        body = {"file": SimpleUploadedFile(name, data), **extra}
        return self.as_(user or self.nurse).post(f"{API}cases/{case['id']}/documents/", body, format="multipart")

    def test_upload_list_and_download(self):
        case = self.make_case()
        r = self.upload(case, category="consent", title="Signed consent")
        self.assertEqual(r.status_code, 201, r.content)
        doc = r.json()
        self.assertEqual((doc["title"], doc["category_label"], doc["filename"], doc["size"]), ("Signed consent", "Consent", "consent.pdf", len(PDF)))
        self.assertTrue(doc["can_delete"])
        self.assertNotIn("file", doc)  # no storage path or public link is handed out
        self.assertEqual(len(self.as_(self.nurse).get(f"{API}cases/{case['id']}/documents/").json()), 1)
        d = self.as_(self.nurse).get(f"{API}cases/{case['id']}/documents/{doc['id']}/")
        self.assertEqual(d.status_code, 200)
        self.assertEqual(b"".join(d.streaming_content), PDF)
        self.assertIn("attachment", d["Content-Disposition"])
        self.assertEqual(d["X-Content-Type-Options"], "nosniff")

    def test_title_defaults_to_the_file_name(self):
        case = self.make_case()
        self.assertEqual(self.upload(case, name="H and P.png", data=PNG).json()["title"], "H and P")

    def test_only_pdf_png_jpeg(self):
        case = self.make_case()
        self.assertEqual(self.upload(case, name="run.exe", data=b"MZ...").status_code, 400)
        self.assertEqual(self.upload(case, name="page.html", data=b"<script>").status_code, 400)

    def test_contents_must_match_the_extension(self):
        case = self.make_case()
        r = self.upload(case, name="fake.pdf", data=b"<html>not a pdf</html>")
        self.assertEqual(r.status_code, 400)
        self.assertIn("file", r.json())

    def test_empty_and_oversized_files_rejected(self):
        case = self.make_case()
        self.assertEqual(self.upload(case, data=b"").status_code, 400)
        with override_settings():
            from . import models
            old = models.DOCUMENT_MAX_BYTES
            import surgery.serializers as ser
            ser.DOCUMENT_MAX_BYTES = 10
            try:
                self.assertEqual(self.upload(case).status_code, 400)
            finally:
                ser.DOCUMENT_MAX_BYTES = old

    def test_stored_under_a_random_name_not_the_uploaded_one(self):
        from .models import CaseDocument
        case = self.make_case()
        self.upload(case, name="../../evil name.pdf")
        doc = CaseDocument.objects.get()
        self.assertNotIn("evil", doc.file.name)
        self.assertTrue(doc.file.name.startswith(f"surgery_documents/{self.org.pk}/{case['id']}/"))
        self.assertEqual(doc.original_name, "evil name.pdf")

    def test_closed_case_still_accepts_documents(self):
        case = self.make_case()
        self.move(case["id"], "cancelled", reason="x")
        self.assertEqual(self.upload(case).status_code, 201)

    def test_other_organizations_cannot_list_or_download(self):
        case = self.make_case()
        doc = self.upload(case).json()
        stranger = make_user("n2x", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).get(f"{API}cases/{case['id']}/documents/").status_code, 404)
        self.assertEqual(self.as_(stranger).get(f"{API}cases/{case['id']}/documents/{doc['id']}/").status_code, 404)

    def test_only_uploader_or_admin_can_remove_and_the_file_goes_too(self):
        import os
        from .models import CaseDocument
        case = self.make_case()
        admin = make_user("adm9", "admin", self.org)
        doc = self.upload(case).json()
        path = CaseDocument.objects.get().file.path
        self.assertTrue(os.path.exists(path))
        self.assertEqual(self.as_(self.doctor).delete(f"{API}cases/{case['id']}/documents/{doc['id']}/").status_code, 403)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.as_(admin).delete(f"{API}cases/{case['id']}/documents/{doc['id']}/").status_code, 204)
        self.assertFalse(os.path.exists(path))
        self.assertEqual(self.as_(self.nurse).get(f"{API}cases/{case['id']}/documents/").json(), [])

    def test_can_delete_flag_is_for_the_uploader_or_an_admin_only(self):
        case = self.make_case()
        self.upload(case)
        seen = lambda u: self.as_(u).get(f"{API}cases/{case['id']}/documents/").json()[0]["can_delete"]
        self.assertTrue(seen(self.nurse))
        self.assertFalse(seen(self.doctor))
        self.assertTrue(seen(make_user("adm8", "admin", self.org)))

    def test_uploader_can_remove_their_own(self):
        case = self.make_case()
        doc = self.upload(case).json()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.as_(self.nurse).delete(f"{API}cases/{case['id']}/documents/{doc['id']}/").status_code, 204)

    def test_document_changes_are_in_history(self):
        case = self.make_case()
        self.upload(case)
        entries = self.as_(self.nurse).get(f"{API}cases/{case['id']}/history/").json()
        self.assertIn("document", [e["action"] for e in entries])


class SeedCommandTests(SurgeryBase):
    def run_seed(self, *extra, **kw):
        from io import StringIO

        from django.core.management import call_command
        out = StringIO()
        call_command("seed_surgery_demo", "--org", str(self.org.pk), "--date", "2026-11-03", *extra, stdout=out, **kw)
        return out.getvalue()

    @override_settings(DEBUG=True)
    def test_seeds_cases_in_every_status_with_details(self):
        out = self.run_seed()
        self.assertIn("Seeded 9 cases", out)
        cases = SurgeryCase.objects.filter(organization=self.org, comments__startswith="[DEMO]")
        self.assertEqual(cases.count(), 9)
        self.assertEqual({c.status for c in cases}, {"pending", "preop", "or", "pacu", "discharged", "cancelled", "transferred"})
        done = cases.filter(status="discharged").first()
        self.assertTrue(done.participants.exists() and done.usage.exists())
        self.assertTrue(done.charges.filter(status="posted").exists())
        self.assertTrue(done.charges.filter(policy_type="case_time").exists())
        # it all reads back through the real API
        r = self.as_(self.nurse).get(f"{API}cases/?date=2026-11-03").json()
        self.assertEqual(r["count"], 9)
        planner = self.as_(self.nurse).get(f"{API}planner/?date=2026-11-03&facility={self.hospital.pk}").json()
        self.assertTrue(any(b["overlap"] for room in planner["rooms"] for b in room["cases"]))
        # the demo ORs are built in Location Manager, in an operating-room unit
        rooms = SurgeryRoom.objects.filter(facility=self.hospital)
        self.assertEqual(rooms.count(), 3)
        self.assertTrue(all(r.location_room_id and r.location_room.unit.is_surgical for r in rooms))

    @override_settings(DEBUG=True)
    def test_second_run_needs_reset_and_reset_only_removes_demo_cases(self):
        real = self.make_case(start="06:00")
        self.run_seed()
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.run_seed()
        self.run_seed("--reset")
        self.assertEqual(SurgeryCase.objects.filter(comments__startswith="[DEMO]").count(), 9)
        self.assertTrue(SurgeryCase.objects.filter(pk=real["id"]).exists())
        self.assertEqual(ChargePolicy_count(), 2)  # policies and prices are not duplicated

    @override_settings(DEBUG=False)
    def test_refuses_on_a_non_debug_database_without_force(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self.run_seed()
        self.assertEqual(SurgeryCase.objects.filter(comments__startswith="[DEMO]").count(), 0)
        self.run_seed("--force")
        self.assertEqual(SurgeryCase.objects.filter(comments__startswith="[DEMO]").count(), 9)

    @override_settings(DEBUG=True)
    def test_unknown_org_is_a_clear_error(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command("seed_surgery_demo", "--org", "999999")


def ChargePolicy_count():
    from .models import ChargePolicy
    return ChargePolicy.objects.count()


class RoomLocationTests(SurgeryBase):
    """Operating rooms are built on Location Manager rooms in operating-room units."""

    LOC = "/api/locations/"

    def add_room(self, name="OR-3"):
        r = self.as_(self.admin).post(API + "rooms/", {"facility": self.hospital.pk, "name": name}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def surgical_unit(self, name="Main OR"):
        from appointments.models import Unit
        return Unit.objects.create(facility=self.hospital, name=name, care_type="outpatient", is_surgical=True)

    def test_new_room_is_built_in_location_manager(self):
        from appointments.models import Room, Unit
        row = self.add_room("OR-3")
        self.assertEqual(row["unit"], "Operating Rooms")
        self.assertEqual(row["path"], "General Hospital › Operating Rooms › OR-3")
        unit = Unit.objects.get(facility=self.hospital, name="Operating Rooms")
        self.assertTrue(unit.is_surgical)
        self.assertTrue(Room.objects.filter(unit=unit, name="OR-3").exists())
        tree = self.as_(self.nurse).get(self.LOC + "tree/").json()["locations"]
        units = {u["name"]: u for f in tree for u in f["units"]}
        self.assertTrue(units["Operating Rooms"]["is_surgical"])
        self.assertFalse(units["3 West"]["is_surgical"])
        self.assertEqual([r["name"] for r in units["Operating Rooms"]["rooms"]], ["OR-3"])

    def test_link_an_existing_location_room(self):
        from appointments.models import Room
        unit = self.surgical_unit()
        loc = Room.objects.create(unit=unit, name="OR 9")
        options = self.as_(self.nurse).get(API + "room-options/").json()
        self.assertEqual([(o["name"], o["unit"]) for o in options], [("OR 9", "Main OR")])  # not the inpatient room 312
        r = self.as_(self.admin).post(API + "rooms/", {"location_room": loc.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["name"], r.json()["location_room"]), ("OR 9", loc.pk))
        self.assertEqual(self.as_(self.nurse).get(API + "room-options/").json(), [])
        self.assertEqual(self.as_(self.admin).post(API + "rooms/", {"location_room": loc.pk}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.admin).post(API + "rooms/", {"location_room": self.room.pk}, format="json").status_code, 400)

    def test_a_nurse_cannot_add_rooms_or_see_other_clinics_rooms(self):
        self.assertEqual(self.as_(self.nurse).post(API + "rooms/", {"facility": self.hospital.pk, "name": "OR-3"}, format="json").status_code, 403)
        from appointments.models import Room, Unit
        elsewhere = Facility.objects.create(organization=self.other_org, name="Elsewhere Hospital")
        far = Room.objects.create(unit=Unit.objects.create(facility=elsewhere, name="OR", is_surgical=True), name="X1")
        self.assertEqual(self.as_(self.admin).post(API + "rooms/", {"location_room": far.pk}, format="json").status_code, 400)
        self.assertEqual(self.as_(self.admin).get(API + "room-options/").json(), [])

    def test_rename_and_switch_off_in_location_manager_follow_into_surgery(self):
        row = self.add_room("OR-3")
        loc_id = row["location_room"]
        r = self.as_(self.admin).patch(f"{self.LOC}rooms/{loc_id}/", {"name": "OR-3A"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(SurgeryRoom.objects.get(pk=row["id"]).name, "OR-3A")
        r = self.as_(self.admin).patch(f"{self.LOC}rooms/{loc_id}/", {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(SurgeryRoom.objects.get(pk=row["id"]).is_active)
        names = [x["name"] for x in self.as_(self.nurse).get(API + "rooms/").json()]
        self.assertNotIn("OR-3A", names)

    def test_location_manager_refuses_a_name_another_operating_room_already_has(self):
        row = self.add_room("OR-3")
        r = self.as_(self.admin).patch(f"{self.LOC}rooms/{row['location_room']}/", {"name": "or-1"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("operating room", r.json()["detail"])
        self.assertEqual(SurgeryRoom.objects.get(pk=row["id"]).name, "OR-3")

    def test_rename_in_surgery_writes_through_to_location_manager(self):
        from appointments.models import Room
        row = self.add_room("OR-3")
        self.add_room("OR-4")
        r = self.as_(self.admin).patch(f"{API}rooms/{row['id']}/", {"name": "OR-3B", "is_active": False}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        loc = Room.objects.get(pk=row["location_room"])
        self.assertEqual((loc.name, loc.is_active), ("OR-3B", False))
        r = self.as_(self.admin).patch(f"{API}rooms/{row['id']}/", {"name": "OR-4"}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_an_operating_room_cannot_be_deleted_in_location_manager(self):
        row = self.add_room("OR-3")
        r = self.as_(self.admin).delete(f"{self.LOC}rooms/{row['location_room']}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Surgery", r.json()["detail"])
        self.assertTrue(SurgeryRoom.objects.filter(pk=row["id"]).exists())

    def test_surgical_flag_on_create_and_edit(self):
        r = self.as_(self.admin).post(self.LOC + "units/", {"facility": self.hospital.pk, "name": "Perioperative", "is_surgical": True}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        unit_id = r.json()["id"]
        from appointments.models import Unit
        self.assertTrue(Unit.objects.get(pk=unit_id).is_surgical)
        # a room Surgery uses keeps the unit surgical
        loc = self.as_(self.admin).post(self.LOC + "rooms/", {"unit": unit_id, "name": "OR 7"}, format="json").json()["id"]
        self.as_(self.admin).post(API + "rooms/", {"location_room": loc}, format="json")
        r = self.as_(self.admin).patch(f"{self.LOC}units/{unit_id}/", {"is_surgical": False}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Unit.objects.get(pk=unit_id).is_surgical)
        # a unit with nothing linked can be switched either way
        other = self.surgical_unit("Spare OR")
        r = self.as_(self.admin).patch(f"{self.LOC}units/{other.pk}/", {"is_surgical": False}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_registration_and_check_location_refuse_operating_room_units(self):
        from appointments.locations import check_location
        from appointments.models import Room
        unit = self.surgical_unit()
        loc = Room.objects.create(unit=unit, name="OR 9")
        for kwargs in ({"unit": unit}, {"room": loc}):
            self.assertIn("managed in Surgery", check_location(self.org, **kwargs))
            self.assertIsNone(check_location(self.org, allow_surgical=True, **kwargs))
        self.assertIsNone(check_location(self.org, unit=self.west))
        r = self.register(facility=self.hospital.pk, unit=unit.pk)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("managed in Surgery", r.content.decode())

    def test_case_rows_carry_the_room_path(self):
        row = self.add_room("OR-3")
        case = self.make_case(room=row["id"])
        self.assertEqual(case["room"]["unit"], "Operating Rooms")
        self.assertEqual(case["room"]["path"], "General Hospital › Operating Rooms › OR-3")
        legacy = self.make_case(start="11:00")  # an older, unlinked room still reads fine
        self.assertEqual(legacy["room"]["path"], "General Hospital › OR-1")

    def test_backfill_links_existing_rooms_once(self):
        import importlib

        from django.apps import apps

        from appointments.models import Room, Unit
        migration = importlib.import_module("surgery.migrations.0008_link_existing_rooms")
        # a plain unit someone already named "Operating Rooms" is adopted, not duplicated
        existing = Unit.objects.create(facility=self.hospital, name="Operating Rooms", care_type="outpatient")
        migration.link_rooms(apps, None)
        self.or1.refresh_from_db()
        self.or2.refresh_from_db()
        existing.refresh_from_db()
        self.assertTrue(existing.is_surgical)
        self.assertEqual({self.or1.location_room.unit_id, self.or2.location_room.unit_id}, {existing.pk})
        self.assertEqual(Unit.objects.filter(facility=self.hospital, name__iexact="Operating Rooms").count(), 1)
        before = (Room.objects.count(), Unit.objects.count())
        migration.link_rooms(apps, None)
        self.assertEqual((Room.objects.count(), Unit.objects.count()), before)
