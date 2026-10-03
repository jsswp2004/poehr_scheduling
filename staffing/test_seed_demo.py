from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from staffing.models import Staff, StaffShift, StaffTimeOffRequest, Unit
from users.models import Organization


class SeedStaffingDemoTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Seed Test Demo")
        self.real = Staff.objects.create(
            organization=self.org, first_name="Real", last_name="Person", profession="RN", nursing_role="rn"
        )

    def _run(self, *args):
        out = StringIO()
        call_command("seed_staffing_demo", "--org-id", str(self.org.pk), *args, stdout=out)
        return out.getvalue()

    def test_seed_creates_units_staff_shifts_and_time_off(self):
        self._run("--set-location")
        self.assertEqual(Unit.objects.filter(organization=self.org).count(), 2)
        self.assertEqual(Staff.objects.filter(organization=self.org).count(), 37)  # 36 demo + 1 real
        self.assertGreater(StaffShift.objects.filter(organization=self.org).count(), 1000)
        self.assertEqual(StaffTimeOffRequest.objects.filter(organization=self.org).count(), 4)
        self.org.refresh_from_db()
        self.assertEqual(self.org.state, "MD")

    def test_demo_staff_are_safe(self):
        self._run()
        demo = Staff.objects.filter(organization=self.org).exclude(pk=self.real.pk)
        self.assertFalse(demo.exclude(phone_number__isnull=True).exists())
        self.assertFalse(demo.filter(reminders_enabled=True).exists())
        self.assertFalse(demo.exclude(email__endswith="@demo.powerstaffing.test").exists())

    def test_no_double_booking(self):
        self._run()
        seen = set()
        for staff_id, d in StaffShift.objects.filter(organization=self.org).values_list("staff_id", "date"):
            self.assertNotIn((staff_id, d), seen)
            seen.add((staff_id, d))

    def test_rerun_refreshes_and_reset_keeps_real_data(self):
        self._run()
        self._run()
        self.assertEqual(Unit.objects.filter(organization=self.org).count(), 2)
        self.assertEqual(Staff.objects.filter(organization=self.org).count(), 37)
        self._run("--reset")
        self.assertEqual(list(Staff.objects.filter(organization=self.org)), [self.real])
        self.assertEqual(Unit.objects.filter(organization=self.org).count(), 0)

    def test_logins(self):
        out = self._run("--logins", "--password", "Demo-Pass-123!")
        User = get_user_model()
        users = User.objects.filter(organization=self.org)
        self.assertEqual(users.count(), 9)
        self.assertEqual(users.filter(role="admin").count(), 2)
        self.assertEqual(users.filter(role="nurse").count(), 1)
        self.assertEqual(users.filter(role="staff").count(), 6)
        self.assertEqual(Staff.objects.filter(organization=self.org, user__isnull=False).count(), 6)
        self.assertIn("TESTER LOGINS", out)
        self.assertTrue(users.first().check_password("Demo-Pass-123!"))
