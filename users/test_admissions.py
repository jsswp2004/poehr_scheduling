from datetime import timedelta

from django.utils import timezone

from appointments.test_locations import Base, TREE
from appointments.models import Bed, Room, Unit
from users.models import Registration

ADMIT = "/api/users/admissions/admit/"
TRANSFER = "/api/users/admissions/{}/transfer/"
DISCHARGE = "/api/users/admissions/{}/discharge/"
ATTENDING = "/api/users/admissions/{}/attending/"
PATIENTS = "/api/users/patients/"


def names(response):
    return [p["last_name"] for p in response.json()["results"]]


class AdmitTests(Base):
    def admit(self, user=None, patient=None, **extra):
        body = {"patient": (patient or self.patient).pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}
        body.update(extra)
        return self.as_(user or self.nurse).post(ADMIT, body, format="json")

    def test_admit_puts_patient_in_bed_as_acute(self):
        r = self.admit(attending_provider=self.doctor.pk)
        self.assertEqual(r.status_code, 201, r.content)
        visit = Registration.objects.get(pk=r.json()["id"])
        self.assertEqual(visit.care_setting, "acute")
        self.assertEqual(visit.bed, self.bed_a)
        self.assertEqual(visit.attending_provider, self.doctor)
        self.assertIsNotNone(visit.arrival_time)
        self.assertIn("3 West", visit.assigned_location)

    def test_admitted_patient_shows_in_acute_list_not_ambulatory(self):
        self.admit()
        acute = self.as_(self.admin).get(PATIENTS, {"care_setting": "acute"})
        self.assertEqual(names(acute), ["Bcs"])
        self.assertEqual(acute.json()["results"][0]["current_visit"]["bed_name"], "A")
        self.assertNotIn("Bcs", names(self.as_(self.admin).get(PATIENTS, {"care_setting": "ambulatory"})))

    def test_acute_list_can_be_filtered_by_unit(self):
        from appointments.models import Unit

        self.admit()  # patient in 3 West
        other = Unit.objects.create(facility=self.hospital, name="4 East", care_type="inpatient")
        admin = self.as_(self.admin)
        hit = admin.get(PATIENTS, {"care_setting": "acute", "unit": self.west.pk})
        self.assertEqual(names(hit), ["Bcs"])
        self.assertEqual(hit.json()["results"][0]["current_visit"]["unit_name"], "3 West")
        self.assertEqual(hit.json()["results"][0]["current_visit"]["room_name"], "312")
        miss = admin.get(PATIENTS, {"care_setting": "acute", "unit": other.pk})
        self.assertEqual(names(miss), [])
        # no filter, a blank one, or junk leaves the list alone
        for value in ("", "abc", "0x1"):
            self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute", "unit": value})), ["Bcs"])
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute"})), ["Bcs"])

    def test_unit_filter_follows_a_transfer(self):
        from appointments.models import Unit

        r = self.admit()
        east = Unit.objects.create(facility=self.hospital, name="4 East", care_type="inpatient")
        east_room = Room.objects.create(unit=east, name="401")
        east_bed = Bed.objects.create(room=east_room, name="A")
        t = self.as_(self.nurse).post(TRANSFER.format(r.json()["id"]), {"unit": east.pk, "room": east_room.pk, "bed": east_bed.pk}, format="json")
        self.assertEqual(t.status_code, 200, t.content)
        admin = self.as_(self.admin)
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute", "unit": east.pk})), ["Bcs"])
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute", "unit": self.west.pk})), [])

    def test_bed_must_be_free(self):
        self.admit()
        r = self.admit(patient=self.patient2)
        self.assertEqual(r.status_code, 400)
        self.assertIn("occupied", r.json()["detail"])

    def test_blocked_bed_is_refused(self):
        self.bed_b.hold = "blocked"
        self.bed_b.save()
        r = self.admit(bed=self.bed_b.pk)
        self.assertEqual(r.status_code, 400)

    def test_needs_inpatient_unit(self):
        r = self.admit(unit=self.ed.pk, room="", bed="")
        self.assertEqual(r.status_code, 400)
        self.assertIn("not an inpatient unit", r.json()["detail"])

    def test_unit_is_required(self):
        r = self.as_(self.nurse).post(ADMIT, {"patient": self.patient.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_cannot_admit_twice(self):
        self.admit()
        r = self.admit(bed=self.bed_b.pk)
        self.assertEqual(r.status_code, 400)
        self.assertIn("already admitted", r.json()["detail"])

    def test_admit_an_existing_ed_visit(self):
        ed = self.register(admission_type="emergency", unit=self.ed.pk).json()
        self.assertEqual(ed["care_setting"], "emergency")
        r = self.admit(registration=ed["id"])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["id"], ed["id"])
        self.assertEqual(r.json()["care_setting"], "acute")
        self.assertEqual(Registration.objects.filter(patient=self.patient).count(), 1)

    def test_only_front_line_roles_and_own_clinic(self):
        self.assertEqual(self.admit(user=self.patient_user).status_code, 403)
        stranger = self.make_other_org_nurse()
        self.assertEqual(self.admit(user=stranger).status_code, 404)  # patient not found in their clinic

    def make_other_org_nurse(self):
        from appointments.test_locations import make_user

        return make_user("nurse2", "nurse", self.other_org)

    def test_attending_must_be_a_doctor_here(self):
        r = self.admit(attending_provider=self.nurse.pk)
        self.assertEqual(r.status_code, 400)


class TransferAndDischargeTests(Base):
    def setUp(self):
        super().setUp()
        self.visit_id = self.as_(self.nurse).post(
            ADMIT, {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        ).json()["id"]

    def test_transfer_to_another_bed_frees_the_first(self):
        r = self.as_(self.nurse).post(TRANSFER.format(self.visit_id), {"unit": self.west.pk, "room": self.room.pk, "bed": self.bed_b.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Registration.objects.get(pk=self.visit_id).bed, self.bed_b)
        bed_a = [
            b for f in self.as_(self.admin).get(TREE).json()["locations"] for u in f["units"] for rm in u["rooms"] for b in rm["beds"] if b["id"] == self.bed_a.pk
        ][0]
        self.assertEqual(bed_a["status"], "available")

    def test_transfer_into_an_occupied_bed_is_refused(self):
        other = self.as_(self.nurse).post(
            ADMIT, {"patient": self.patient2.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_b.pk}, format="json"
        ).json()["id"]
        r = self.as_(self.nurse).post(TRANSFER.format(other), {"unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_transfer_to_a_unit_without_a_bed_changes_care_setting(self):
        r = self.as_(self.nurse).post(TRANSFER.format(self.visit_id), {"unit": self.ed.pk}, format="json")
        self.assertEqual(r.status_code, 200)
        visit = Registration.objects.get(pk=self.visit_id)
        self.assertEqual((visit.care_setting, visit.bed, visit.room), ("emergency", None, None))

    def test_discharge_frees_the_bed_and_leaves_the_acute_list(self):
        r = self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNotNone(Registration.objects.get(pk=self.visit_id).discharge_datetime)
        self.assertEqual(names(self.as_(self.admin).get(PATIENTS, {"care_setting": "acute"})), [])
        self.assertIn("Bcs", names(self.as_(self.admin).get(PATIENTS, {"care_setting": "ambulatory"})))
        # the bed can be used again
        again = self.as_(self.nurse).post(
            ADMIT, {"patient": self.patient2.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        )
        self.assertEqual(again.status_code, 201, again.content)

    def test_discharge_twice_and_transfer_after_discharge_are_refused(self):
        self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {}, format="json")
        self.assertEqual(self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {}, format="json").status_code, 400)
        r = self.as_(self.nurse).post(TRANSFER.format(self.visit_id), {"unit": self.west.pk, "bed": self.bed_b.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_discharge_time_checks(self):
        future = (timezone.now() + timedelta(days=1)).isoformat()
        self.assertEqual(self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {"discharge_datetime": future}, format="json").status_code, 400)
        past = (timezone.now() - timedelta(days=30)).isoformat()
        self.assertEqual(self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {"discharge_datetime": past}, format="json").status_code, 400)
        self.assertEqual(self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {"discharge_datetime": "nonsense"}, format="json").status_code, 400)

    def test_other_clinic_and_patients_are_refused(self):
        stranger = self.make_other_org_nurse()
        self.assertEqual(self.as_(stranger).post(DISCHARGE.format(self.visit_id), {}, format="json").status_code, 404)
        self.assertEqual(self.as_(self.patient_user).post(DISCHARGE.format(self.visit_id), {}, format="json").status_code, 403)

    def make_other_org_nurse(self):
        from appointments.test_locations import make_user

        return make_user("nurse2", "nurse", self.other_org)


class NewerVisitTests(Base):
    """A newer blank visit must not hide a patient who is still in a bed."""

    def admit(self):
        body = {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}
        return self.as_(self.nurse).post(ADMIT, body, format="json")

    def test_inpatient_stays_on_acute_list_when_a_newer_blank_visit_exists(self):
        self.admit()
        Registration.objects.create(patient=self.patient, organization=self.org, admission_type="scheduled")
        admin = self.as_(self.admin)
        acute = admin.get(PATIENTS, {"care_setting": "acute"})
        self.assertEqual(names(acute), ["Bcs"])
        self.assertEqual(acute.json()["results"][0]["current_visit"]["bed_name"], "A")
        self.assertEqual(acute.json()["results"][0]["current_visit"]["care_setting"], "acute")
        self.assertNotIn("Bcs", names(admin.get(PATIENTS, {"care_setting": "ambulatory"})))
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute", "unit": self.west.pk})), ["Bcs"])

    def test_inpatient_outranks_an_open_ed_visit(self):
        self.admit()
        Registration.objects.create(patient=self.patient, organization=self.org, admission_type="emergency")
        admin = self.as_(self.admin)
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute"})), ["Bcs"])
        self.assertNotIn("Bcs", names(admin.get(PATIENTS, {"care_setting": "emergency"})))

    def test_discharged_inpatient_with_a_newer_blank_visit_is_ambulatory(self):
        r = self.admit()
        self.as_(self.nurse).post(DISCHARGE.format(r.json()["id"]), {}, format="json")
        Registration.objects.create(patient=self.patient, organization=self.org, admission_type="scheduled")
        admin = self.as_(self.admin)
        self.assertEqual(names(admin.get(PATIENTS, {"care_setting": "acute"})), [])
        self.assertIn("Bcs", names(admin.get(PATIENTS, {"care_setting": "ambulatory"})))


class DoctorVisibilityTests(Base):
    """A doctor sees their own panel plus the patients whose open visit they attend."""

    def setUp(self):
        super().setUp()
        from appointments.test_locations import make_user

        self.chen = make_user("chen", "doctor", self.org, first_name="Mei", last_name="Chen")
        body = {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}
        self.visit_id = self.as_(self.nurse).post(ADMIT, body, format="json").json()["id"]  # no attending yet

    def test_a_doctor_who_is_not_attending_does_not_see_the_inpatient(self):
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})), [])

    def test_the_attending_sees_the_inpatient_without_owning_the_panel(self):
        Registration.objects.filter(pk=self.visit_id).update(attending_provider=self.chen)
        r = self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})
        self.assertEqual(names(r), ["Bcs"])
        self.assertEqual(len(r.json()["results"]), 1)  # no duplicates
        self.assertEqual(r.json()["results"][0]["current_visit"]["bed_name"], "A")
        # her own outpatient list is not cluttered with a patient who is in a bed
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "ambulatory"})), [])

    def test_the_panel_doctor_still_sees_their_patient(self):
        self.assertEqual(names(self.as_(self.doctor).get(PATIENTS, {"care_setting": "acute"})), ["Bcs"])

    def test_the_attending_can_open_the_visit_and_its_chart_appointment(self):
        Registration.objects.filter(pk=self.visit_id).update(attending_provider=self.chen)
        visit = Registration.objects.get(pk=self.visit_id)
        visit.ensure_chart_appointment()
        regs = self.as_(self.chen).get("/api/users/registrations/", {"patient": self.patient.pk, "open": 1}).json()
        rows = regs["results"] if isinstance(regs, dict) else regs
        self.assertEqual([r["id"] for r in rows], [self.visit_id])
        # the appointments endpoint is tenant-scoped from the login token, so use a real token here
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import AccessToken

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.chen)}")
        appts = client.get("/api/appointments/", {"patient": self.patient.user.pk})
        self.assertEqual(appts.status_code, 200)
        data = appts.json()
        data = data["results"] if isinstance(data, dict) else data
        self.assertIn(visit.appointment_id, [a["id"] for a in data])

    def test_a_doctor_who_is_not_attending_cannot_see_the_chart_appointment(self):
        Registration.objects.get(pk=self.visit_id).ensure_chart_appointment()
        regs = self.as_(self.chen).get("/api/users/registrations/", {"patient": self.patient.pk}).json()
        rows = regs["results"] if isinstance(regs, dict) else regs
        self.assertEqual(rows, [])

    def test_discharged_visit_no_longer_shows_for_the_attending(self):
        Registration.objects.filter(pk=self.visit_id).update(attending_provider=self.chen)
        self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {}, format="json")
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})), [])
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS)), [])


class ChangeAttendingTests(Base):
    """Setting the attending after admission is what puts the patient on that doctor's list."""

    def setUp(self):
        super().setUp()
        from appointments.test_locations import make_user

        self.chen = make_user("chen", "doctor", self.org, first_name="Mei", last_name="Chen")
        body = {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}
        self.visit_id = self.as_(self.nurse).post(ADMIT, body, format="json").json()["id"]  # no attending yet

    def make_other_org_nurse(self):
        from appointments.test_locations import make_user

        return make_user("nurse2", "nurse", self.other_org)

    def set_attending(self, who, doctor_pk, visit_id=None):
        return self.as_(who).post(ATTENDING.format(visit_id or self.visit_id), {"attending_provider": doctor_pk}, format="json")

    def test_nurse_sets_attending_and_the_doctor_then_sees_the_patient(self):
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})), [])
        r = self.set_attending(self.nurse, self.chen.pk)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["attending_provider"], self.chen.pk)
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})), ["Bcs"])

    def test_changing_attending_moves_the_patient_between_doctors(self):
        self.set_attending(self.nurse, self.chen.pk)
        self.set_attending(self.nurse, self.doctor.pk)
        self.assertEqual(Registration.objects.get(pk=self.visit_id).attending_provider, self.doctor)
        self.assertEqual(names(self.as_(self.chen).get(PATIENTS, {"care_setting": "acute"})), [])

    def test_attending_can_be_cleared(self):
        self.set_attending(self.nurse, self.chen.pk)
        self.assertEqual(self.set_attending(self.nurse, None).status_code, 200)
        self.assertIsNone(Registration.objects.get(pk=self.visit_id).attending_provider)

    def test_the_chart_appointment_follows_the_attending(self):
        visit = Registration.objects.get(pk=self.visit_id)
        visit.ensure_chart_appointment()
        self.set_attending(self.nurse, self.chen.pk)
        self.assertEqual(Registration.objects.get(pk=self.visit_id).appointment.provider, self.chen)

    def test_only_a_doctor_of_the_clinic_can_be_attending(self):
        self.assertEqual(self.set_attending(self.nurse, self.nurse.pk).status_code, 400)
        self.assertEqual(self.set_attending(self.nurse, 999999).status_code, 400)

    def test_patients_and_other_clinics_cannot_change_it(self):
        self.assertEqual(self.set_attending(self.patient_user, self.chen.pk).status_code, 403)
        stranger = self.make_other_org_nurse()
        self.assertEqual(self.set_attending(stranger, self.chen.pk).status_code, 404)

    def test_discharged_visit_is_locked(self):
        self.as_(self.nurse).post(DISCHARGE.format(self.visit_id), {}, format="json")
        self.assertEqual(self.set_attending(self.nurse, self.chen.pk).status_code, 400)
