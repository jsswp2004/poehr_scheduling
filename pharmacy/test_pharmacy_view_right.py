"""The 'pharmacy.view' right: who opens the Pharmacy module, and a doctor granted it sees it read-only."""

from users.models import UserRightOverride
from users.rights import RIGHT_CODES, role_default_rights
from users.token_serializers import CustomTokenObtainPairSerializer

from .tests import Base, mk


def grant(user, code="pharmacy.view", on=True):
    UserRightOverride.objects.update_or_create(user=user, right_code=code, defaults={"is_granted": on})


class PharmacyViewRightTests(Base):
    READS = ("/api/pharmacy/patients/", "/api/pharmacy/queue/", "/api/pharmacy/formulary/")

    def test_the_right_and_its_defaults(self):
        self.assertIn("pharmacy.view", RIGHT_CODES)
        for role in ("pharmacist", "pharmacy_tech", "admin", "system_admin"):
            self.assertIn("pharmacy.view", role_default_rights(role) if role != "system_admin" else RIGHT_CODES, role)
        for role in ("doctor", "nurse", "registrar"):
            self.assertNotIn("pharmacy.view", role_default_rights(role), role)

    def test_a_doctor_without_the_right_sees_nothing(self):
        c = self.api(self.doctor)
        for url in self.READS + (f"/api/pharmacy/med-profile/{self.patient.pk}/",):
            self.assertEqual(c.get(url).status_code, 403, url)
        self.assertFalse(CustomTokenObtainPairSerializer.get_token(self.doctor)["pharmacy_view"])

    def test_a_doctor_with_the_right_reads_but_cannot_act(self):
        order = self.med()
        grant(self.doctor)
        self.assertTrue(CustomTokenObtainPairSerializer.get_token(self.doctor)["pharmacy_view"])
        c = self.api(self.doctor)
        for url in self.READS + (f"/api/pharmacy/med-profile/{self.patient.pk}/", f"/api/pharmacy/orders/{order.pk}/"):
            self.assertEqual(c.get(url).status_code, 200, url)
        queue = c.get("/api/pharmacy/queue/").json()
        self.assertEqual(queue["can_verify"], False)
        self.assertEqual(c.get("/api/pharmacy/formulary/").json()["can_edit"], False)
        # every action is still refused
        self.assertEqual(self.action(order, self.doctor, action="verify").status_code, 403)
        self.assertEqual(c.post("/api/pharmacy/formulary/", {"generic_name": "Lagundi leaf"}, format="json").status_code, 403)
        # outpatient filling, prices and discount IDs stay with the pharmacy roles
        for url in ("/api/pharmacy/fills/", "/api/pharmacy/prices/", f"/api/pharmacy/patients/{self.patient.pk}/discount-ids/"):
            self.assertEqual(c.get(url).status_code, 403, url)

    def test_pharmacy_roles_unchanged_and_the_right_can_be_taken_away(self):
        for user in (self.pharmacist, self.tech, self.admin):
            self.assertEqual(self.api(user).get("/api/pharmacy/queue/").status_code, 200, user.role)
        self.assertEqual(self.api(self.pharmacist).get("/api/pharmacy/fills/").status_code, 200)
        grant(self.tech, on=False)  # an administrator removes it for one person
        self.assertEqual(self.api(self.tech).get("/api/pharmacy/queue/").status_code, 403)
        self.assertEqual(self.api(self.tech).get("/api/pharmacy/fills/").status_code, 403)
        self.assertFalse(CustomTokenObtainPairSerializer.get_token(self.tech)["pharmacy_view"])

    def test_a_nurse_granted_the_right_reads_too(self):
        nurse = mk("nurse2", "nurse", self.org)
        grant(nurse)
        self.assertEqual(self.api(nurse).get("/api/pharmacy/queue/").status_code, 200)
        self.assertEqual(self.api(self.nurse).get("/api/pharmacy/queue/").status_code, 403)
