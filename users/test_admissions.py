from datetime import timedelta

from django.utils import timezone

from appointments.test_locations import Base, TREE
from appointments.models import Bed, Room, Unit
from users.models import Registration

ADMIT = "/api/users/admissions/admit/"
TRANSFER = "/api/users/admissions/{}/transfer/"
DISCHARGE = "/api/users/admissions/{}/discharge/"
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
