import datetime

from appointments.test_locations import Base

PATIENTS = "/api/users/patients/"


def last_names(response):
    return sorted(p["last_name"] for p in response.json()["results"])


class PatientSearchTests(Base):
    """The Register page searches by name, MRN, date of birth and phone."""

    def setUp(self):
        super().setUp()
        self.patient.phone_number = "3015550142"
        self.patient.date_of_birth = datetime.date(1972, 3, 14)
        self.patient.save()
        self.patient2.phone_number = "2405550119"
        self.patient2.date_of_birth = datetime.date(1988, 11, 2)
        self.patient2.save()

    def find(self, **params):
        response = self.as_(self.nurse).get(PATIENTS, params)
        self.assertEqual(response.status_code, 200, response.content)
        return last_names(response)

    def test_phone_digits_find_the_patient(self):
        self.assertEqual(self.find(search="3015550142"), ["Bcs"])

    def test_part_of_a_phone_number_finds_the_patient(self):
        self.assertEqual(self.find(search="5550119"), ["Lee"])

    def test_a_phone_number_nobody_has_finds_nothing(self):
        self.assertEqual(self.find(search="9999999999"), [])

    def test_date_of_birth_filter(self):
        self.assertEqual(self.find(dob="1972-03-14"), ["Bcs"])
        self.assertEqual(self.find(dob="1988-11-02"), ["Lee"])
        self.assertEqual(self.find(dob="2000-01-01"), [])

    def test_last_name_and_date_of_birth_together_for_the_duplicate_check(self):
        self.assertEqual(self.find(search="Bcs", dob="1972-03-14"), ["Bcs"])
        self.assertEqual(self.find(search="Bcs", dob="1988-11-02"), [])

    def test_the_second_page_continues_the_list(self):
        first = self.as_(self.nurse).get(PATIENTS, {"page_size": 1, "page": 1}).json()
        second = self.as_(self.nurse).get(PATIENTS, {"page_size": 1, "page": 2}).json()
        self.assertTrue(first["next"])
        self.assertNotEqual(first["results"][0]["id"], second["results"][0]["id"])
