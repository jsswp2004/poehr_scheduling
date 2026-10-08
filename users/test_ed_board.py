from datetime import date, timedelta

from django.utils import timezone

from appointments.models import Bed, Room, Unit
from appointments.test_locations import Base, make_user
from users.models import Registration

BOARD = "/api/users/ed-board/"
EDIT = "/api/users/admissions/{}/board/"
TRANSFER = "/api/users/admissions/{}/transfer/"
DISCHARGE = "/api/users/admissions/{}/discharge/"


class EdBoardBase(Base):
    def setUp(self):
        super().setUp()
        self.ed_room = Room.objects.create(unit=self.ed, name="ED1")
        self.ed_bed_a = Bed.objects.create(room=self.ed_room, name="A")
        self.ed_bed_b = Bed.objects.create(room=self.ed_room, name="B")
        self.ed_bed_c = Bed.objects.create(room=self.ed_room, name="C")
        self.resident = make_user("resident1", "doctor", self.org, first_name="Dana", last_name="Park")

    def er_visit(self, patient=None, bed=None, **extra):
        body = {"patient": (patient or self.patient).pk, "organization": self.org.pk, "admission_type": "emergency",
                "reason_for_visit": "Chest pain", "presenting_problem": "CP"}
        if bed is not None:
            body.update({"unit": self.ed.pk, "room": self.ed_room.pk, "bed": bed.pk})
        body.update(extra)
        r = self.as_(self.registrar).post("/api/users/registrations/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def board(self, user=None, **params):
        return self.as_(user or self.nurse).get(BOARD, params)


class BoardTests(EdBoardBase):
    def test_lists_departments_and_every_bed_with_ready_status(self):
        data = self.board().json()
        self.assertEqual([d["name"] for d in data["departments"]], ["ED"])
        self.assertEqual(data["unit"], self.ed.pk)
        rows = [r for r in data["rows"] if r["type"] == "bed"]
        self.assertEqual([r["loc"] for r in rows], ["ED1-A", "ED1-B", "ED1-C"])
        self.assertTrue(all(r["bed_status"] == "available" and r["visit"] is None for r in rows))
        self.assertIn({"value": "wtbs", "code": "WTBS", "label": "Waiting to be seen"}, data["statuses"])

    def test_occupied_bed_shows_the_patient(self):
        self.patient.date_of_birth = date.today().replace(year=date.today().year - 28)
        self.patient.legal_sex = "F"
        self.patient.save()
        self.er_visit(bed=self.ed_bed_b)
        row = [r for r in self.board().json()["rows"] if r["loc"] == "ED1-B"][0]
        self.assertEqual(row["bed_status"], "occupied")
        v = row["visit"]
        self.assertEqual((v["name"], v["age"], v["sex"], v["reason"], v["complaint"]), ("BCS, Test", 28, "F", "Chest pain", "CP"))
        self.assertEqual(v["user_id"], self.patient_user.pk)
        self.assertTrue(v["visit_number"])

    def test_patients_without_a_bed_are_waiting(self):
        self.er_visit()
        data = self.board().json()
        waiting = [r for r in data["rows"] if r["type"] == "waiting"]
        self.assertEqual(len(waiting), 1)
        self.assertEqual(waiting[0]["visit"]["name"], "BCS, Test")
        self.assertIsNone(waiting[0]["bed"])

    def test_blocked_and_cleaning_beds_show_their_status(self):
        self.ed_bed_a.hold = "blocked"
        self.ed_bed_a.hold_reason = "Broken rail"
        self.ed_bed_a.save()
        self.ed_bed_c.hold = "cleaning"
        self.ed_bed_c.save()
        rows = {r["loc"]: r for r in self.board().json()["rows"]}
        self.assertEqual((rows["ED1-A"]["bed_status"], rows["ED1-A"]["hold_reason"]), ("blocked", "Broken rail"))
        self.assertEqual(rows["ED1-C"]["bed_status"], "cleaning")

    def test_discharged_visits_leave_the_board_and_inpatients_never_appear(self):
        vid = self.er_visit(bed=self.ed_bed_a)
        self.as_(self.nurse).post(DISCHARGE.format(vid), {}, format="json")
        rows = self.board().json()["rows"]
        self.assertTrue(all(r["visit"] is None for r in rows))
        self.as_(self.nurse).post(
            "/api/users/admissions/admit/", {"patient": self.patient2.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        )
        self.assertTrue(all(r["visit"] is None for r in self.board().json()["rows"]))

    def test_staff_lists_are_this_clinics_nurses_and_doctors(self):
        make_user("nurse_other", "nurse", self.other_org)
        staff = self.board().json()["staff"]
        self.assertEqual([n["id"] for n in staff["nurses"]], [self.nurse.pk])
        self.assertEqual(sorted(d["id"] for d in staff["doctors"]), sorted([self.doctor.pk, self.resident.pk]))

    def test_unknown_department_and_no_departments(self):
        self.assertEqual(self.board(unit=self.west.pk).status_code, 404)
        self.ed.is_active = False
        self.ed.save()
        data = self.board().json()
        self.assertEqual((data["departments"], data["unit"], data["rows"]), ([], None, []))

    def test_permissions_and_clinic_scope(self):
        self.assertEqual(self.board(user=self.patient_user).status_code, 403)
        stranger = make_user("nurse9", "nurse", self.other_org)
        self.er_visit(bed=self.ed_bed_a)
        data = self.board(user=stranger).json()
        self.assertEqual(data["departments"], [])

    def test_two_departments_pick_by_unit(self):
        ed2 = Unit.objects.create(facility=self.hospital, name="Fast Track", care_type="emergency")
        data = self.board().json()
        self.assertEqual({d["name"] for d in data["departments"]}, {"ED", "Fast Track"})
        self.assertEqual(self.board(unit=ed2.pk).json()["rows"], [])


class EditTests(EdBoardBase):
    def setUp(self):
        super().setUp()
        self.vid = self.er_visit(bed=self.ed_bed_a)

    def edit(self, body, user=None, vid=None):
        return self.as_(user or self.nurse).patch(EDIT.format(vid or self.vid), body, format="json")

    def test_sets_every_board_field(self):
        r = self.edit({"esi": 2, "ed_status": "tip", "assigned_nurse": self.nurse.pk, "attending_provider": self.doctor.pk,
                       "resident": self.resident.pk, "comments": "Awaiting CT", "registration_complete": True,
                       "reason": "Chest pain", "complaint": "CP x2 hours"})
        self.assertEqual(r.status_code, 200, r.content)
        v = Registration.objects.get(pk=self.vid)
        self.assertEqual((v.esi, v.ed_status, v.assigned_nurse, v.attending_provider, v.resident_provider, v.board_comments, v.registration_complete),
                         (2, "tip", self.nurse, self.doctor, self.resident, "Awaiting CT", True))
        self.assertEqual((v.reason_for_visit, v.presenting_problem), ("Chest pain", "CP x2 hours"))
        row = r.json()
        self.assertEqual(row["resident"], {"id": self.resident.pk, "name": "Park, Dana"})
        self.assertEqual((row["reason"], row["complaint"]), ("Chest pain", "CP x2 hours"))
        self.assertEqual((row["esi"], row["ed_status"], row["rn"]["id"], row["md"]["id"]), (2, "tip", self.nurse.pk, self.doctor.pk))

    def test_resident_must_be_a_doctor_of_this_clinic_and_can_be_cleared(self):
        outsider = make_user("outdoc", "doctor", self.other_org)
        for bad in (self.nurse.pk, outsider.pk, 999999):
            self.assertEqual(self.edit({"resident": bad}).status_code, 400, bad)
        self.assertEqual(self.edit({"resident": self.resident.pk}).status_code, 200)
        self.assertEqual(self.edit({"resident": ""}).json()["resident"], None)
        self.assertIsNone(Registration.objects.get(pk=self.vid).resident_provider)

    def test_an_old_typed_resident_name_still_shows_until_one_is_picked(self):
        Registration.objects.filter(pk=self.vid).update(resident="Dr. Patel")
        row = self.edit({"esi": 3}).json()
        self.assertEqual((row["resident"], row["resident_text"]), (None, "Dr. Patel"))
        row = self.edit({"resident": self.resident.pk}).json()
        self.assertEqual((row["resident"]["id"], row["resident_text"]), (self.resident.pk, ""))

    def test_blank_clears_a_field(self):
        self.edit({"esi": 3, "assigned_nurse": self.nurse.pk, "ed_status": "tip"})
        self.edit({"esi": "", "assigned_nurse": None, "ed_status": ""})
        v = Registration.objects.get(pk=self.vid)
        self.assertEqual((v.esi, v.assigned_nurse, v.ed_status), (None, None, ""))

    def test_rejects_bad_values(self):
        for body in ({"esi": 0}, {"esi": 6}, {"esi": "x"}, {"ed_status": "lunch"}, {"assigned_nurse": self.doctor.pk}, {"attending_provider": self.nurse.pk}):
            self.assertEqual(self.edit(body).status_code, 400, body)

    def test_other_clinic_staff_cannot_be_assigned(self):
        outsider = make_user("nurse9", "nurse", self.other_org)
        self.assertEqual(self.edit({"assigned_nurse": outsider.pk}).status_code, 400)

    def test_only_front_line_staff_in_the_same_clinic(self):
        self.assertEqual(self.edit({"esi": 1}, user=self.patient_user).status_code, 403)
        stranger = make_user("nurse9", "nurse", self.other_org)
        self.assertEqual(self.edit({"esi": 1}, user=stranger).status_code, 404)

    def test_discharged_visit_cannot_be_edited(self):
        self.as_(self.nurse).post(DISCHARGE.format(self.vid), {}, format="json")
        self.assertEqual(self.edit({"esi": 1}).status_code, 400)

    def test_long_text_is_trimmed(self):
        self.edit({"comments": "x" * 600, "reason": "y" * 600, "complaint": "z" * 600})
        v = Registration.objects.get(pk=self.vid)
        self.assertEqual((len(v.board_comments), len(v.reason_for_visit), len(v.presenting_problem)), (300, 500, 500))


class PlaceFromWaitingTests(EdBoardBase):
    def test_waiting_patient_goes_to_a_ready_bed_and_leaves_the_waiting_rows(self):
        vid = self.er_visit()
        r = self.as_(self.nurse).post(TRANSFER.format(vid), {"unit": self.ed.pk, "room": self.ed_room.pk, "bed": self.ed_bed_c.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        rows = self.board().json()["rows"]
        self.assertFalse([r for r in rows if r["type"] == "waiting"])
        self.assertEqual([r for r in rows if r["loc"] == "ED1-C"][0]["visit"]["registration"], vid)


class ChartLinkTests(EdBoardBase):
    def _order(self, appt, name, category, status="active"):
        from appointments.models import Order, Orderable

        code = name.lower().replace(" ", "_")[:60]
        item = Orderable.objects.create(code=code, name=name, category=category)
        return Order.objects.create(
            organization=self.org, appointment=appt, patient=appt.patient, ordering_provider=self.doctor,
            orderable=item, orderable_name=name, orderable_category=category, status=status,
        )

    def test_an_emergency_visit_gets_one_linked_chart_appointment(self):
        vid = self.er_visit(bed=self.ed_bed_a)
        visit = Registration.objects.get(pk=vid)
        self.assertIsNotNone(visit.appointment_id)
        self.assertEqual(visit.appointment.patient_id, self.patient_user.pk)
        self.assertTrue(visit.appointment.title.startswith("ED visit"))
        visit.save()  # saving again must not create another
        self.assertEqual(Registration.objects.get(pk=vid).appointment_id, visit.appointment_id)

    def test_outpatient_visits_get_no_chart_appointment(self):
        r = self.as_(self.registrar).post(
            "/api/users/registrations/",
            {"patient": self.patient.pk, "organization": self.org.pk, "admission_type": "scheduled"}, format="json")
        self.assertIsNone(Registration.objects.get(pk=r.json()["id"]).appointment_id)

    def test_older_emergency_visits_are_linked_when_the_board_loads(self):
        vid = self.er_visit(bed=self.ed_bed_a)
        Registration.objects.filter(pk=vid).update(appointment=None)
        self.board()
        self.assertIsNotNone(Registration.objects.get(pk=vid).appointment_id)

    def test_board_shows_last_vitals_time_and_order_icons(self):
        from appointments.models import FlowsheetTemplate, VitalSignsFlowsheet

        vid = self.er_visit(bed=self.ed_bed_a)
        appt = Registration.objects.get(pk=vid).appointment
        tpl = FlowsheetTemplate.objects.filter(code="vital_signs").first() or FlowsheetTemplate.objects.create(code="vital_signs", name="Vital Signs")
        early = (timezone.now() - timedelta(hours=3)).isoformat()
        late = (timezone.now() - timedelta(minutes=20)).isoformat()
        VitalSignsFlowsheet.objects.create(
            organization=self.org, template=tpl, appointment=appt, patient=self.patient_user,
            columns=[{"id": "c1", "timestamp": late}, {"id": "c2", "timestamp": early}],
        )
        self._order(appt, "Urinalysis", "laboratory")
        self._order(appt, "Troponin I", "laboratory", status="completed")
        self._order(appt, "Chest X-ray", "imaging")
        self._order(appt, "12 lead EKG", "procedure")
        self._order(appt, "Morphine", "medication")
        self._order(appt, "Old draft", "imaging", status="draft")
        v = [r for r in self.board().json()["rows"] if r["loc"] == "ED1-A"][0]["visit"]
        self.assertEqual(v["vitals_last_at"][:16], late[:16])
        self.assertEqual(v["orders"], {"lab": "pending", "urine": "pending", "cardiac": "done", "rad": "pending", "ekg": "pending", "meds": "pending"})

    def test_a_visit_with_nothing_charted_has_empty_chart_fields(self):
        self.er_visit(bed=self.ed_bed_a)
        v = [r for r in self.board().json()["rows"] if r["loc"] == "ED1-A"][0]["visit"]
        self.assertIsNone(v["vitals_last_at"])
        self.assertEqual(v["orders"], {})

    def test_calendar_list_hides_ed_chart_appointments_but_patient_and_detail_still_find_them(self):
        from appointments.models import Appointment
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken

        # appointments are tenant-scoped by the JWT authenticator, so this test logs in with a real token
        jwt = APIClient()
        jwt.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.nurse).access_token}")
        vid = self.er_visit(bed=self.ed_bed_a)
        appt = Registration.objects.get(pk=vid).appointment
        outpatient = Appointment.all_objects.create(
            organization=self.org, patient=self.patient_user, title="Clinic visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )

        def ids(resp):
            data = resp.json()
            data = data["results"] if isinstance(data, dict) else data
            return {a["id"] for a in data}

        listed = ids(jwt.get("/api/appointments/"))
        self.assertIn(outpatient.pk, listed)
        self.assertNotIn(appt.pk, listed)
        # charting panels ask for one patient's visits and still see the ED visit
        self.assertIn(appt.pk, ids(jwt.get("/api/appointments/", {"patient": self.patient_user.pk})))
        self.assertEqual(jwt.get(f"/api/appointments/{appt.pk}/").status_code, 200)

    def test_reminders_skip_emergency_and_inpatient_visits(self):
        from appointments.models import Appointment

        self.er_visit(bed=self.ed_bed_a)
        cands = Appointment.all_objects.exclude(registration__care_setting__in=("emergency", "acute"))
        self.assertFalse(cands.filter(title__startswith="ED visit").exists())


class RegistrationListFilterTests(EdBoardBase):
    def test_open_visits_of_one_patient(self):
        old = self.er_visit(bed=self.ed_bed_a)
        Registration.objects.filter(pk=old).update(discharge_datetime="2026-01-01T00:00:00Z")
        open_a = self.er_visit(bed=self.ed_bed_b)
        open_b = self.er_visit()
        r = self.as_(self.registrar).get("/api/users/registrations/", {"patient": self.patient.pk, "open": 1})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual([x["id"] for x in rows], [open_b, open_a])


class StatusLogicTests(EdBoardBase):
    """STS: orders decide first (DC / ADM), then an assigned MD (TIP), then a patient waiting for a bed (WTBS)."""

    def _order(self, vid, name, category="other", status="active"):
        from appointments.models import Order, Orderable

        appt = Registration.objects.get(pk=vid).appointment
        item = Orderable.objects.create(code=name.lower().replace(" ", "_")[:60], name=name, category=category)
        return Order.objects.create(
            organization=self.org, appointment=appt, patient=appt.patient, ordering_provider=self.doctor,
            orderable=item, orderable_name=name, orderable_category=category, status=status,
        )

    def sts(self, vid):
        for r in self.board().json()["rows"]:
            if r["visit"] and r["visit"]["registration"] == vid:
                return r["visit"]["ed_status"]
        self.fail("visit not on the board")

    def edit(self, vid, body):
        r = self.as_(self.nurse).patch(EDIT.format(vid), body, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_a_patient_waiting_with_no_md_is_wtbs(self):
        vid = self.er_visit()
        self.assertEqual(self.sts(vid), "wtbs")

    def test_a_patient_in_a_bed_with_no_md_has_no_status_yet(self):
        vid = self.er_visit(bed=self.ed_bed_a)
        self.assertEqual(self.sts(vid), "")

    def test_assigning_an_md_changes_the_status_to_tip_at_once(self):
        vid = self.er_visit()
        self.assertEqual(self.sts(vid), "wtbs")
        self.assertEqual(self.edit(vid, {"attending_provider": self.doctor.pk})["ed_status"], "tip")
        self.assertEqual(self.sts(vid), "tip")
        self.assertEqual(self.edit(vid, {"attending_provider": None})["ed_status"], "wtbs")

    def test_an_admit_order_makes_it_adm_and_a_discharge_order_makes_it_dc(self):
        vid = self.er_visit(bed=self.ed_bed_a, attending_provider=self.doctor.pk)
        self.assertEqual(self.sts(vid), "tip")
        admit = self._order(vid, "Admit to inpatient")
        self.assertEqual(self.sts(vid), "admit_pending")
        admit.status = "discontinued"
        admit.save()
        self.assertEqual(self.sts(vid), "tip")
        self._order(vid, "Discharge patient home")
        self.assertEqual(self.sts(vid), "discharge_pending")

    def test_the_latest_of_an_admit_and_a_discharge_order_wins(self):
        from appointments.models import Order

        vid = self.er_visit(bed=self.ed_bed_a, attending_provider=self.doctor.pk)
        first = self._order(vid, "Discharge patient")
        later = self._order(vid, "Admit to telemetry")
        Order.objects.filter(pk=first.pk).update(created_at=timezone.now() - timedelta(hours=2))
        self.assertEqual(self.sts(vid), "admit_pending")
        Order.objects.filter(pk=later.pk).update(created_at=timezone.now() - timedelta(hours=3))
        self.assertEqual(self.sts(vid), "discharge_pending")

    def test_drafts_and_lab_imaging_medication_orders_never_count(self):
        vid = self.er_visit(bed=self.ed_bed_a, attending_provider=self.doctor.pk)
        self._order(vid, "Admit to inpatient", status="draft")
        self._order(vid, "Admission labs", category="laboratory")
        self._order(vid, "Discharge medication reconciliation", category="medication")
        self.assertEqual(self.sts(vid), "tip")

    def test_an_order_beats_a_hand_picked_status_but_dispo_picked_by_hand_beats_tip(self):
        vid = self.er_visit(bed=self.ed_bed_a, attending_provider=self.doctor.pk)
        self.edit(vid, {"ed_status": "dispo"})
        self.assertEqual(self.sts(vid), "dispo")
        self._order(vid, "Admit to inpatient")
        self.assertEqual(self.sts(vid), "admit_pending")

    def test_a_status_the_clinic_removed_is_not_produced(self):
        from users.ed_board import effective_status

        class V:
            ed_status = ""
            attending_provider_id = 5

        self.assertEqual(effective_status(V, "admit", {"tip", "wtbs"}, False), "tip")
        self.assertEqual(effective_status(V, None, {"wtbs"}, False), "")
        V.attending_provider_id = None
        self.assertEqual(effective_status(V, None, {"wtbs"}, True), "wtbs")
        self.assertEqual(effective_status(V, None, {"tip"}, True), "")
