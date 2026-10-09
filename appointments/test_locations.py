from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from .models import Bed, Facility, Room, Unit

User = get_user_model()
TREE = "/api/locations/tree/"
ITEM = "/api/locations/{}/"
ITEM_ID = "/api/locations/{}/{}/"
REGS = "/api/users/registrations/"
HEADER = "/api/patient-header/{}/"


def make_user(username, role, org, **extra):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra
    )


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside")
        self.other_org = Organization.objects.create(name="Elsewhere")
        self.admin = make_user("adm", "admin", self.org)
        self.sysadmin = make_user("sys", "system_admin", None)
        self.doctor = make_user("doc", "doctor", self.org, first_name="Jeffrey", last_name="Lee")
        self.nurse = make_user("nurse", "nurse", self.org)
        self.registrar = make_user("reg", "registrar", self.org)
        self.patient_user = make_user("pat", "patient", self.org, first_name="Test", last_name="Bcs")
        self.patient_user.provider = self.doctor
        self.patient_user.save()
        self.patient = Patient.objects.get(user=self.patient_user)
        self.patient.organization = self.org
        self.patient.save()
        self.patient_user2 = make_user("pat2", "patient", self.org, first_name="Ann", last_name="Lee")
        self.patient2 = Patient.objects.get(user=self.patient_user2)
        self.client = APIClient()

        # a small tree: hospital > 3 West (inpatient) > room 312 > beds A and B; ED; Cardiology clinic
        self.hospital = Facility.objects.create(organization=self.org, name="General Hospital", kind="hospital")
        self.west = Unit.objects.create(facility=self.hospital, name="3 West", care_type="inpatient")
        self.ed = Unit.objects.create(facility=self.hospital, name="ED", care_type="emergency")
        self.cardio = Unit.objects.create(facility=self.hospital, name="Cardiology", care_type="outpatient")
        self.room = Room.objects.create(unit=self.west, name="312")
        self.bed_a = Bed.objects.create(room=self.room, name="A")
        self.bed_b = Bed.objects.create(room=self.room, name="B")

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def register(self, user=None, patient=None, **extra):
        body = {"patient": (patient or self.patient).pk, "organization": self.org.pk, "admission_type": "scheduled"}
        body.update(extra)
        return self.as_(user or self.registrar).post(REGS, body, format="json")


class TreeTests(Base):
    def test_any_staff_can_read_the_tree_and_only_admins_edit(self):
        for user, can_edit in ((self.admin, True), (self.doctor, False), (self.registrar, False)):
            r = self.as_(user).get(TREE)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["can_edit"], can_edit)
        self.assertEqual(self.as_(self.patient_user).get(TREE).status_code, 403)

    def test_tree_shape(self):
        data = self.as_(self.admin).get(TREE).json()
        hospital = data["locations"][0]
        self.assertEqual(hospital["name"], "General Hospital")
        units = {u["name"]: u for u in hospital["units"]}
        self.assertEqual(units["3 West"]["care_type"], "inpatient")
        self.assertEqual(units["3 West"]["care_setting"], "acute")
        self.assertEqual(units["ED"]["care_setting"], "emergency")
        self.assertEqual(units["Cardiology"]["care_setting"], "ambulatory")
        beds = units["3 West"]["rooms"][0]["beds"]
        self.assertEqual([b["name"] for b in beds], ["A", "B"])
        self.assertEqual({b["status"] for b in beds}, {"available"})
        self.assertEqual(units["3 West"]["bed_count"], 2)
        self.assertEqual(units["3 West"]["occupied_count"], 0)

    def test_an_occupied_bed_shows_who_the_attending_is(self):
        self.assertEqual(self.register(bed=self.bed_a.pk, attending_provider=self.doctor.pk).status_code, 201)
        self.assertEqual(self.register(bed=self.bed_b.pk, patient=self.patient2).status_code, 201)
        beds = {b["name"]: b for b in self.as_(self.admin).get(TREE).json()["locations"][0]["units"][0]["rooms"][0]["beds"]}
        self.assertEqual((beds["A"]["attending_provider"], beds["A"]["attending_provider_name"]), (self.doctor.pk, "Dr. Jeffrey Lee"))
        self.assertEqual((beds["B"]["attending_provider"], beds["B"]["attending_provider_name"]), (None, ""))

    def test_other_clinics_never_see_this_tree(self):
        outsider = make_user("out", "doctor", self.other_org)
        self.assertEqual(self.as_(outsider).get(TREE).json()["locations"], [])

    def test_active_only_hides_switched_off_things(self):
        self.cardio.is_active = False
        self.cardio.save()
        full = self.as_(self.admin).get(TREE).json()["locations"][0]["units"]
        active = self.as_(self.admin).get(TREE, {"active": "1"}).json()["locations"][0]["units"]
        self.assertIn("Cardiology", [u["name"] for u in full])
        self.assertNotIn("Cardiology", [u["name"] for u in active])


class BuildTests(Base):
    def test_build_the_whole_tree_through_the_api(self):
        c = self.as_(self.admin)
        f = c.post(ITEM.format("facilities"), {"name": "Downtown Clinic", "kind": "clinic"}, format="json")
        self.assertEqual(f.status_code, 201, f.content)
        u = c.post(ITEM.format("units"), {"facility": f.json()["id"], "name": "Pediatrics", "care_type": "outpatient"}, format="json")
        self.assertEqual(u.status_code, 201, u.content)
        r = c.post(ITEM.format("rooms"), {"unit": u.json()["id"], "name": "Exam 1"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        b = c.post(ITEM.format("beds"), {"room": r.json()["id"], "name": "Bay 1"}, format="json")
        self.assertEqual(b.status_code, 201, b.content)
        self.assertTrue(Bed.objects.filter(name="Bay 1", room__name="Exam 1").exists())
        self.assertEqual(Facility.objects.get(name="Downtown Clinic").organization, self.org)

    def test_bulk_rooms_with_beds(self):
        r = self.as_(self.admin).post(
            ITEM.format("rooms"),
            {"unit": self.west.pk, "names": ["301", "302", "303"], "bed_names": ["A", "B"]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["ids"]), 3)
        self.assertEqual(Bed.objects.filter(room__name="302").count(), 2)
        again = self.as_(self.admin).post(ITEM.format("rooms"), {"unit": self.west.pk, "names": ["303"]}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertIn("already has room 303", again.json()["detail"])

    def test_bulk_rejects_duplicates_in_the_list_and_nothing_is_saved(self):
        r = self.as_(self.admin).post(ITEM.format("rooms"), {"unit": self.west.pk, "names": ["401", "401"]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Room.objects.filter(name="401").exists())

    def test_only_admins_can_build(self):
        for user in (self.doctor, self.nurse, self.registrar):
            r = self.as_(user).post(ITEM.format("facilities"), {"name": "Nope"}, format="json")
            self.assertEqual(r.status_code, 403)
        self.assertFalse(Facility.objects.filter(name="Nope").exists())

    def test_names_and_types_are_checked(self):
        c = self.as_(self.admin)
        self.assertEqual(c.post(ITEM.format("facilities"), {"name": "  "}, format="json").status_code, 400)
        self.assertEqual(c.post(ITEM.format("facilities"), {"name": "general hospital"}, format="json").status_code, 400)
        self.assertEqual(c.post(ITEM.format("units"), {"facility": self.hospital.pk, "name": "X", "care_type": "spa"}, format="json").status_code, 400)
        self.assertEqual(c.post(ITEM.format("units"), {"facility": self.hospital.pk, "name": "3 west"}, format="json").status_code, 400)
        self.assertEqual(c.post(ITEM.format("facilities"), {"name": "Y", "kind": "castle"}, format="json").status_code, 400)

    def test_cannot_build_inside_another_clinics_location(self):
        other = Facility.objects.create(organization=self.other_org, name="Theirs")
        r = self.as_(self.admin).post(ITEM.format("units"), {"facility": other.pk, "name": "Hack"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Unit.objects.filter(name="Hack").exists())
        self.assertEqual(self.as_(self.admin).patch(ITEM_ID.format("facilities", other.pk), {"name": "Mine now"}, format="json").status_code, 404)

    def test_system_admin_can_build_for_a_named_clinic(self):
        r = self.as_(self.sysadmin).post(ITEM.format("facilities"), {"name": "New Place", "organization": self.other_org.pk}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Facility.objects.get(name="New Place").organization, self.other_org)

    def test_rename_and_change_type(self):
        c = self.as_(self.admin)
        self.assertEqual(c.patch(ITEM_ID.format("units", self.cardio.pk), {"name": "Heart Clinic", "care_type": "inpatient"}, format="json").status_code, 200)
        self.cardio.refresh_from_db()
        self.assertEqual((self.cardio.name, self.cardio.care_type), ("Heart Clinic", "inpatient"))
        clash = c.patch(ITEM_ID.format("units", self.cardio.pk), {"name": "ed"}, format="json")
        self.assertEqual(clash.status_code, 400)

    def test_switch_off_and_on(self):
        c = self.as_(self.admin)
        self.assertEqual(c.patch(ITEM_ID.format("rooms", self.room.pk), {"is_active": False}, format="json").status_code, 200)
        self.room.refresh_from_db()
        self.assertFalse(self.room.is_active)
        c.patch(ITEM_ID.format("rooms", self.room.pk), {"is_active": True}, format="json")
        self.room.refresh_from_db()
        self.assertTrue(self.room.is_active)


class DeleteTests(Base):
    def test_cannot_delete_something_with_things_inside(self):
        for kind, obj in (("facilities", self.hospital), ("units", self.west), ("rooms", self.room)):
            r = self.as_(self.admin).delete(ITEM_ID.format(kind, obj.pk))
            self.assertEqual(r.status_code, 400, kind)

    def test_empty_unused_things_can_be_deleted(self):
        bed = Bed.objects.create(room=self.room, name="C")
        self.assertEqual(self.as_(self.admin).delete(ITEM_ID.format("beds", bed.pk)).status_code, 204)
        self.assertFalse(Bed.objects.filter(pk=bed.pk).exists())

    def test_cannot_delete_a_bed_used_for_a_visit(self):
        self.assertEqual(self.register(bed=self.bed_a.pk).status_code, 201)
        r = self.as_(self.admin).delete(ITEM_ID.format("beds", self.bed_a.pk))
        self.assertEqual(r.status_code, 400)
        self.assertIn("Switch it off", r.json()["detail"])

    def test_cannot_delete_a_unit_used_by_an_appointment(self):
        from .models import Appointment

        Appointment.all_objects.create(
            organization=self.org, patient=self.patient_user, title="Visit", appointment_datetime=timezone.now(), provider=self.doctor, unit=self.cardio
        )
        self.assertEqual(self.as_(self.admin).delete(ITEM_ID.format("units", self.cardio.pk)).status_code, 400)

    def test_only_admins_delete(self):
        bed = Bed.objects.create(room=self.room, name="C")
        self.assertEqual(self.as_(self.nurse).delete(ITEM_ID.format("beds", bed.pk)).status_code, 403)


class RegistrationLocationTests(Base):
    def test_registering_into_a_bed_fills_the_path_and_care_setting(self):
        r = self.register(bed=self.bed_a.pk)
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["room"], self.room.pk)
        self.assertEqual(body["unit"], self.west.pk)
        self.assertEqual(body["facility"], self.hospital.pk)
        self.assertEqual(body["care_setting"], "acute")
        self.assertEqual(body["location_path"], "General Hospital › 3 West › 312 › A")
        reg = Registration.objects.get(pk=body["id"])
        self.assertEqual(reg.assigned_location, "General Hospital › 3 West › 312 › A")

    def test_unit_alone_sets_the_care_setting_from_its_type(self):
        self.assertEqual(self.register(unit=self.ed.pk).json()["care_setting"], "emergency")
        self.assertEqual(self.register(unit=self.cardio.pk).json()["care_setting"], "ambulatory")
        self.assertEqual(self.register(unit=self.west.pk).json()["care_setting"], "acute")

    def test_unit_type_beats_the_admission_type_guess(self):
        # a "direct" admission used to count as acute; the place it happened decides now
        r = self.register(unit=self.cardio.pk, admission_type="direct")
        self.assertEqual(r.json()["care_setting"], "ambulatory")

    def test_without_a_location_the_old_rule_still_applies(self):
        self.assertEqual(self.register(admission_type="emergency").json()["care_setting"], "emergency")
        self.assertEqual(self.register(admission_type="scheduled").json()["care_setting"], "ambulatory")

    def test_an_occupied_bed_cannot_be_given_to_a_second_patient(self):
        self.assertEqual(self.register(bed=self.bed_a.pk).status_code, 201)
        r = self.register(patient=self.patient2, bed=self.bed_a.pk)
        self.assertEqual(r.status_code, 400)
        self.assertIn("already occupied by Bcs, Test", str(r.json()))

    def test_a_discharged_bed_is_free_again(self):
        first = self.register(bed=self.bed_a.pk).json()["id"]
        self.assertEqual(self.as_(self.registrar).patch(f"{REGS}{first}/", {"discharge_datetime": timezone.now().isoformat()}, format="json").status_code, 200)
        self.assertEqual(self.register(patient=self.patient2, bed=self.bed_a.pk).status_code, 201)

    def test_a_blocked_or_inactive_bed_cannot_be_used(self):
        self.bed_a.hold = "blocked"
        self.bed_a.save()
        self.assertEqual(self.register(bed=self.bed_a.pk).status_code, 400)
        self.bed_b.is_active = False
        self.bed_b.save()
        self.assertEqual(self.register(bed=self.bed_b.pk).status_code, 400)

    def test_inactive_unit_cannot_be_used(self):
        self.cardio.is_active = False
        self.cardio.save()
        self.assertEqual(self.register(unit=self.cardio.pk).status_code, 400)

    def test_another_clinics_location_is_refused(self):
        theirs = Unit.objects.create(facility=Facility.objects.create(organization=self.other_org, name="T"), name="U")
        r = self.register(unit=theirs.pk)
        self.assertEqual(r.status_code, 400)
        self.assertIn("different clinic", str(r.json()))

    def test_a_bed_that_is_not_in_the_chosen_room_is_refused(self):
        other_room = Room.objects.create(unit=self.west, name="313")
        r = self.register(room=other_room.pk, bed=self.bed_a.pk)
        # the more specific bed wins and is used on its own; stale parents sent along are ignored
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["room"], self.room.pk)

    def test_editing_an_old_visit_does_not_trip_on_its_place(self):
        old = Registration.objects.create(patient=self.patient, organization=self.org, assigned_location="3 West, Rm 312")
        self.bed_a.is_active = False
        self.bed_a.save()
        r = self.as_(self.registrar).patch(f"{REGS}{old.pk}/", {"reason_for_visit": "Follow up"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["location_path"], "3 West, Rm 312")  # older typed text still shows

    def test_moving_a_patient_to_another_bed(self):
        first = self.register(bed=self.bed_a.pk).json()["id"]
        r = self.as_(self.registrar).patch(f"{REGS}{first}/", {"bed": self.bed_b.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["location_path"].endswith("312 › B"), True)
        # bed A is free again
        self.assertEqual(self.register(patient=self.patient2, bed=self.bed_a.pk).status_code, 201)

    def test_moving_to_the_same_bed_is_not_a_clash(self):
        first = self.register(bed=self.bed_a.pk).json()["id"]
        r = self.as_(self.registrar).patch(f"{REGS}{first}/", {"bed": self.bed_a.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)


class BedStatusTests(Base):
    def beds(self):
        tree = self.as_(self.admin).get(TREE).json()["locations"][0]["units"]
        west = [u for u in tree if u["name"] == "3 West"][0]
        return {b["name"]: b for b in west["rooms"][0]["beds"]}, west

    def test_occupied_then_available_after_discharge(self):
        reg = self.register(bed=self.bed_a.pk).json()["id"]
        beds, west = self.beds()
        self.assertEqual(beds["A"]["status"], "occupied")
        self.assertEqual(beds["A"]["occupant"], "Bcs, Test")
        self.assertEqual(beds["B"]["status"], "available")
        self.assertEqual((west["bed_count"], west["occupied_count"]), (2, 1))
        self.as_(self.registrar).patch(f"{REGS}{reg}/", {"discharge_datetime": timezone.now().isoformat()}, format="json")
        beds, west = self.beds()
        self.assertEqual(beds["A"]["status"], "available")
        self.assertEqual(west["occupied_count"], 0)

    def test_block_and_clean_a_free_bed(self):
        c = self.as_(self.admin)
        c.patch(ITEM_ID.format("beds", self.bed_b.pk), {"hold": "blocked", "hold_reason": "Broken rail"}, format="json")
        beds, _ = self.beds()
        self.assertEqual((beds["B"]["status"], beds["B"]["hold_reason"]), ("blocked", "Broken rail"))
        c.patch(ITEM_ID.format("beds", self.bed_b.pk), {"hold": "cleaning"}, format="json")
        self.assertEqual(self.beds()[0]["B"]["status"], "cleaning")
        c.patch(ITEM_ID.format("beds", self.bed_b.pk), {"hold": ""}, format="json")
        beds, _ = self.beds()
        self.assertEqual((beds["B"]["status"], beds["B"]["hold_reason"]), ("available", ""))

    def test_cannot_block_or_switch_off_where_a_patient_is(self):
        self.register(bed=self.bed_a.pk)
        c = self.as_(self.admin)
        self.assertEqual(c.patch(ITEM_ID.format("beds", self.bed_a.pk), {"hold": "blocked"}, format="json").status_code, 400)
        self.assertEqual(c.patch(ITEM_ID.format("beds", self.bed_a.pk), {"is_active": False}, format="json").status_code, 400)
        r = c.patch(ITEM_ID.format("units", self.west.pk), {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("still admitted", r.json()["detail"])
        self.assertEqual(c.patch(ITEM_ID.format("rooms", self.room.pk), {"is_active": False}, format="json").status_code, 400)
        self.assertEqual(c.patch(ITEM_ID.format("facilities", self.hospital.pk), {"is_active": False}, format="json").status_code, 400)

    def test_an_empty_unit_can_be_switched_off(self):
        self.assertEqual(self.as_(self.admin).patch(ITEM_ID.format("units", self.ed.pk), {"is_active": False}, format="json").status_code, 200)


class AppointmentLocationTests(Base):
    BODY = lambda self, **extra: {
        "patient": self.patient_user.pk,
        "title": "Checkup",
        "appointment_datetime": (timezone.now() + timedelta(days=2)).isoformat(),
        "provider": self.doctor.pk,
        "organization": self.org.pk,
        **extra,
    }

    def test_appointment_with_a_clinic_unit(self):
        r = self.as_(self.doctor).post("/api/appointments/", self.BODY(unit=self.cardio.pk), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["unit"], self.cardio.pk)
        self.assertEqual(r.json()["unit_name"], "General Hospital › Cardiology")

    def test_appointment_without_a_unit_still_works(self):
        r = self.as_(self.doctor).post("/api/appointments/", self.BODY(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()["unit_name"])

    def test_appointment_refuses_another_clinics_or_inactive_unit(self):
        theirs = Unit.objects.create(facility=Facility.objects.create(organization=self.other_org, name="T"), name="U")
        r = self.as_(self.doctor).post("/api/appointments/", self.BODY(unit=theirs.pk), format="json")
        self.assertEqual(r.status_code, 400)
        self.cardio.is_active = False
        self.cardio.save()
        r = self.as_(self.doctor).post("/api/appointments/", self.BODY(unit=self.cardio.pk), format="json")
        self.assertEqual(r.status_code, 400)


class HeaderLocationTests(Base):
    def header_location(self):
        self.as_(self.doctor)
        items = {i["key"]: i for i in self.client.get(HEADER.format(self.patient_user.pk)).json()["items"]}
        return items["location"]["value"]

    def test_header_shows_the_full_path(self):
        self.register(bed=self.bed_a.pk)
        self.assertEqual(self.header_location(), "General Hospital › 3 West › 312 › A")

    def test_header_follows_a_rename(self):
        self.register(bed=self.bed_a.pk)
        self.west.name = "3 West Tower"
        self.west.save()
        self.assertEqual(self.header_location(), "General Hospital › 3 West Tower › 312 › A")

    def test_header_falls_back_to_older_text_then_the_clinic_name(self):
        self.assertEqual(self.header_location(), "Riverside")
        Registration.objects.create(patient=self.patient, organization=self.org, assigned_location="3 West, Rm 312, Bed B")
        self.assertEqual(self.header_location(), "3 West, Rm 312, Bed B")


class BedHoldTests(Base):
    HOLD = "/api/locations/beds/{}/hold/"

    def test_nurse_can_mark_a_bed_for_cleaning_and_free_it_again(self):
        r = self.as_(self.nurse).post(self.HOLD.format(self.bed_a.pk), {"hold": "cleaning"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.bed_a.refresh_from_db()
        self.assertEqual(self.bed_a.hold, "cleaning")
        r = self.as_(self.nurse).post(self.HOLD.format(self.bed_a.pk), {"hold": "", "hold_reason": "ignored"}, format="json")
        self.bed_a.refresh_from_db()
        self.assertEqual((self.bed_a.hold, self.bed_a.hold_reason), ("", ""))

    def test_block_keeps_a_reason(self):
        self.as_(self.registrar).post(self.HOLD.format(self.bed_a.pk), {"hold": "blocked", "hold_reason": "Broken rail"}, format="json")
        self.bed_a.refresh_from_db()
        self.assertEqual((self.bed_a.hold, self.bed_a.hold_reason), ("blocked", "Broken rail"))

    def test_cannot_block_an_occupied_bed(self):
        self.as_(self.nurse).post(
            "/api/users/admissions/admit/", {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        )
        r = self.as_(self.nurse).post(self.HOLD.format(self.bed_a.pk), {"hold": "blocked"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_bad_value_other_clinic_and_patients(self):
        self.assertEqual(self.as_(self.nurse).post(self.HOLD.format(self.bed_a.pk), {"hold": "broken"}, format="json").status_code, 400)
        from .test_locations import make_user

        stranger = make_user("nurse9", "nurse", self.other_org)
        self.assertEqual(self.as_(stranger).post(self.HOLD.format(self.bed_a.pk), {"hold": "blocked"}, format="json").status_code, 404)
        self.assertEqual(self.as_(self.patient_user).post(self.HOLD.format(self.bed_a.pk), {"hold": "blocked"}, format="json").status_code, 403)

    def test_tree_tells_who_is_in_the_bed(self):
        self.as_(self.nurse).post(
            "/api/users/admissions/admit/", {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        )
        beds = [b for f in self.as_(self.nurse).get(TREE).json()["locations"] for u in f["units"] for r in u["rooms"] for b in r["beds"]]
        bed = [b for b in beds if b["id"] == self.bed_a.pk][0]
        self.assertEqual(bed["patient"], self.patient.pk)
        self.assertEqual(bed["patient_user_id"], self.patient_user.pk)
        self.assertTrue(bed["registration"])

    def test_discharge_can_mark_the_bed_for_cleaning(self):
        visit = self.as_(self.nurse).post(
            "/api/users/admissions/admit/", {"patient": self.patient.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}, format="json"
        ).json()["id"]
        r = self.as_(self.nurse).post(f"/api/users/admissions/{visit}/discharge/", {"bed_needs_cleaning": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.bed_a.refresh_from_db()
        self.assertEqual(self.bed_a.hold, "cleaning")
