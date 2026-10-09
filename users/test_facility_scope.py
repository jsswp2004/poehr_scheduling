from django.utils import timezone

from appointments.models import Bed, Facility, Room, Unit
from appointments.test_locations import TREE, Base, make_user
from users.models import Registration

ADMIT = "/api/users/admissions/admit/"
PATIENTS = "/api/users/patients/"
ED_BOARD = "/api/users/ed-board/"
ME = "/api/users/me/"
FACS = "/api/users/{}/facilities/"


def last_names(response):
    return sorted(p["last_name"] for p in response.json()["results"])


class ScopeBase(Base):
    """General Hospital (3 West + ED, from Base) and a second hospital, St. Mary, with 4 East + its own ED."""

    def setUp(self):
        super().setUp()
        self.stmary = Facility.objects.create(organization=self.org, name="St. Mary Hospital", kind="hospital")
        self.east = Unit.objects.create(facility=self.stmary, name="4 East", care_type="inpatient")
        self.east_room = Room.objects.create(unit=self.east, name="401")
        self.east_bed = Bed.objects.create(room=self.east_room, name="A")
        self.ed2 = Unit.objects.create(facility=self.stmary, name="St. Mary ED", care_type="emergency")
        # Bcs is on 3 West (General); Lee is on 4 East (St. Mary)
        self.admit(self.patient, self.west, self.room, self.bed_a)
        self.admit(self.patient2, self.east, self.east_room, self.east_bed)

    def admit(self, patient, unit, room, bed):
        body = {"patient": patient.pk, "unit": unit.pk, "room": room.pk, "bed": bed.pk}
        r = self.as_(self.nurse).post(ADMIT, body, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def assign(self, user, *facilities):
        user.facilities.set(facilities)

    def acute(self, user, **params):
        return self.as_(user).get(PATIENTS, {"care_setting": "acute", **params})


class NoAssignmentTests(ScopeBase):
    def test_without_an_assignment_nothing_changes(self):
        self.assertEqual(last_names(self.acute(self.nurse)), ["Bcs", "Lee"])
        tree = self.as_(self.nurse).get(TREE).json()["locations"]
        self.assertEqual(sorted(f["name"] for f in tree), ["General Hospital", "St. Mary Hospital"])
        self.assertEqual(self.as_(self.nurse).get(ME).json()["facility_ids"], [])


class PatientListTests(ScopeBase):
    def test_a_nurse_sees_only_patients_in_her_facility(self):
        self.assign(self.nurse, self.hospital)
        self.assertEqual(last_names(self.acute(self.nurse)), ["Bcs"])
        self.assign(self.nurse, self.stmary)
        self.assertEqual(last_names(self.acute(self.nurse)), ["Lee"])

    def test_several_facilities_show_all_of_them(self):
        self.assign(self.nurse, self.hospital, self.stmary)
        self.assertEqual(last_names(self.acute(self.nurse)), ["Bcs", "Lee"])

    def test_a_doctor_attending_at_two_hospitals_sees_only_their_own_facility(self):
        Registration.objects.update(attending_provider=self.doctor)
        self.assign(self.doctor, self.stmary)
        self.assertEqual(last_names(self.acute(self.doctor)), ["Lee"])

    def test_the_unit_filter_cannot_reach_another_facility(self):
        self.assign(self.nurse, self.hospital)
        self.assertEqual(last_names(self.acute(self.nurse, unit=self.east.pk)), [])
        self.assertEqual(last_names(self.acute(self.nurse, unit=self.west.pk)), ["Bcs"])

    def test_system_admin_is_never_limited(self):
        self.assign(self.sysadmin, self.hospital)
        self.assertEqual(len(self.acute(self.sysadmin).json()["results"]), 2)

    def test_a_visit_not_placed_in_any_facility_still_shows(self):
        Registration.objects.filter(patient=self.patient2).update(facility=None, unit=None, room=None, bed=None)
        self.assign(self.nurse, self.hospital)
        self.assertEqual(last_names(self.acute(self.nurse)), ["Bcs", "Lee"])

    def test_the_emergency_list_is_limited_too(self):
        for patient, unit in ((self.patient, self.ed), (self.patient2, self.ed2)):
            Registration.objects.filter(patient=patient).update(care_setting="emergency", unit=unit, facility=unit.facility, room=None, bed=None)
        self.assign(self.nurse, self.stmary)
        r = self.as_(self.nurse).get(PATIENTS, {"care_setting": "emergency"})
        self.assertEqual(last_names(r), ["Lee"])

    def test_the_ambulatory_list_is_not_tied_to_a_hospital(self):
        self.assign(self.nurse, self.hospital)
        r = self.as_(self.nurse).get(PATIENTS, {"care_setting": "ambulatory"})
        self.assertEqual(r.status_code, 200)

    def test_a_facility_of_another_organization_never_counts(self):
        other = Facility.objects.create(organization=self.other_org, name="Elsewhere Hospital", kind="hospital")
        self.nurse.facilities.set([other])
        # the only assignment is foreign, so the nurse is limited to nothing rather than everything
        self.assertEqual(last_names(self.acute(self.nurse)), [])


class TreeAndBoardTests(ScopeBase):
    def test_tree_shows_only_assigned_facilities(self):
        self.assign(self.doctor, self.hospital)
        tree = self.as_(self.doctor).get(TREE).json()["locations"]
        self.assertEqual([f["name"] for f in tree], ["General Hospital"])

    def test_tree_for_a_system_admin_choosing_a_clinic_is_whole(self):
        tree = self.as_(self.sysadmin).get(TREE, {"org": self.org.pk}).json()["locations"]
        self.assertEqual(len(tree), 2)

    def test_ed_board_departments_are_limited(self):
        self.assign(self.nurse, self.stmary)
        data = self.as_(self.nurse).get(ED_BOARD).json()
        self.assertEqual([d["name"] for d in data["departments"]], ["St. Mary ED"])
        self.assertEqual(data["unit"], self.ed2.pk)

    def test_ed_board_refuses_a_department_of_another_facility(self):
        self.assign(self.nurse, self.stmary)
        self.assertEqual(self.as_(self.nurse).get(ED_BOARD, {"unit": self.ed.pk}).status_code, 404)


class AssignmentEndpointTests(ScopeBase):
    def put(self, actor, target, ids):
        return self.as_(actor).put(FACS.format(target.pk), {"facility_ids": ids}, format="json")

    def test_admin_assigns_and_clears(self):
        r = self.put(self.admin, self.doctor, [self.hospital.pk])
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["facility_ids"], [self.hospital.pk])
        self.assertTrue(body["restricted"])
        self.assertEqual([f["name"] for f in body["facilities"]], ["General Hospital", "St. Mary Hospital"])
        self.assertEqual(self.as_(self.doctor).get(ME).json()["facility_ids"], [self.hospital.pk])
        cleared = self.put(self.admin, self.doctor, []).json()
        self.assertEqual(cleared["facility_ids"], [])
        self.assertFalse(cleared["restricted"])

    def test_get_lists_the_choices(self):
        body = self.as_(self.admin).get(FACS.format(self.doctor.pk)).json()
        self.assertEqual(body["facility_ids"], [])
        self.assertEqual(len(body["facilities"]), 2)

    def test_a_clinician_cannot_change_anyones_assignment_including_their_own(self):
        for actor in (self.doctor, self.nurse, self.registrar):
            self.assertEqual(self.put(actor, actor, [self.hospital.pk]).status_code, 403)
        self.assertEqual(self.doctor.facilities.count(), 0)

    def test_the_user_patch_route_cannot_set_it(self):
        r = self.as_(self.doctor).patch(f"/api/users/{self.doctor.pk}/", {"facility_ids": [self.hospital.pk]}, format="json")
        self.assertIn(r.status_code, (200, 400, 403))
        self.assertEqual(self.doctor.facilities.count(), 0)

    def test_an_admin_cannot_reach_another_organization(self):
        outsider = make_user("out", "doctor", self.other_org)
        self.assertEqual(self.put(self.admin, outsider, []).status_code, 403)
        self.assertEqual(self.as_(self.admin).get(FACS.format(outsider.pk)).status_code, 403)

    def test_a_facility_from_another_organization_is_refused(self):
        other = Facility.objects.create(organization=self.other_org, name="Elsewhere Hospital", kind="hospital")
        r = self.put(self.admin, self.doctor, [other.pk])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.doctor.facilities.count(), 0)

    def test_bad_input_is_refused(self):
        for bad in ("7", [True], ["x"], [-1], None):
            self.assertEqual(self.put(self.admin, self.doctor, bad).status_code, 400, bad)
        self.assertEqual(self.put(self.admin, self.doctor, [999999]).status_code, 400)

    def test_a_system_admin_may_assign_anyone(self):
        r = self.put(self.sysadmin, self.nurse, [self.stmary.pk])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(last_names(self.acute(self.nurse)), ["Lee"])
