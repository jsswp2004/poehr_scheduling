from types import SimpleNamespace

from django.test import SimpleTestCase

from staffing.availability_views import role_label


class RoleLabelTests(SimpleTestCase):
    def test_nursing_roles_win(self):
        self.assertEqual(role_label(SimpleNamespace(nursing_role="rn", profession="Nurse")), "RN")
        self.assertEqual(role_label(SimpleNamespace(nursing_role="cna", profession="Aide")), "CNA")

    def test_physician_is_md(self):
        self.assertEqual(role_label(SimpleNamespace(nursing_role="other", profession="Physician")), "MD")

    def test_unknown_profession_passes_through(self):
        self.assertEqual(role_label(SimpleNamespace(nursing_role="other", profession="Pharmacist")), "Pharmacist")
