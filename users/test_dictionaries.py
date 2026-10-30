from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Dictionary, DictionaryEntry, Organization


def seed_roles():
    d, _ = Dictionary.objects.get_or_create(code="roles", defaults={"name": "Roles"})
    for i, v in enumerate(["patient", "receptionist", "doctor", "nurse", "admin", "registrar", "system_admin", "staff"]):
        DictionaryEntry.objects.get_or_create(dictionary=d, value=v, defaults={"label": v.title(), "behaves_like": v, "is_locked": True, "sort_order": i * 10})
    return d


def make(org, role, name):
    return CustomUser.objects.create_user(username=name, password="pw12345!", role=role, organization=org, email=f"{name}@x.com")


class DictionaryTests(TestCase):
    def setUp(self):
        self.d = seed_roles()
        self.org = Organization.objects.create(name="O", max_users=50, subscription_tier="premium")
        self.sys = make(self.org, "system_admin", "sysd")
        self.adm = make(self.org, "admin", "admd")
        self.c = APIClient()

    def entries(self):
        return [{"value": e.value, "label": e.label, "behaves_like": e.behaves_like, "is_active": e.is_active} for e in self.d.entries.all()]

    def test_everyone_reads_only_sysadmin_edits(self):
        self.c.force_authenticate(self.adm)
        self.assertEqual(self.c.get("/api/users/dictionaries/roles/").status_code, 200)
        self.assertEqual(self.c.patch("/api/users/dictionaries/roles/", {"display_type": "radio"}, format="json").status_code, 403)
        self.assertEqual(self.c.get("/api/users/dictionaries/").status_code, 403)

    def test_add_custom_role_and_display_type(self):
        self.c.force_authenticate(self.sys)
        rows = self.entries() + [{"value": "scheduler", "label": "Scheduler", "behaves_like": "receptionist"}]
        r = self.c.patch("/api/users/dictionaries/roles/", {"display_type": "searchable", "entries": rows}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.d.refresh_from_db()
        self.assertEqual(self.d.display_type, "searchable")
        self.assertTrue(DictionaryEntry.objects.filter(value="scheduler", behaves_like="receptionist").exists())

    def test_locked_entries_protected(self):
        self.c.force_authenticate(self.sys)
        rows = [e for e in self.entries() if e["value"] != "doctor"]
        self.assertEqual(self.c.patch("/api/users/dictionaries/roles/", {"entries": rows}, format="json").status_code, 400)
        rows = self.entries()
        for e in rows:
            if e["value"] == "nurse":
                e["is_active"] = False
        self.assertEqual(self.c.patch("/api/users/dictionaries/roles/", {"entries": rows}, format="json").status_code, 400)

    def test_custom_role_needs_built_in_base(self):
        self.c.force_authenticate(self.sys)
        rows = self.entries() + [{"value": "scheduler", "label": "Scheduler", "behaves_like": "wizard"}]
        self.assertEqual(self.c.patch("/api/users/dictionaries/roles/", {"entries": rows}, format="json").status_code, 400)

    def test_create_profile_with_custom_role_acts_like_base(self):
        DictionaryEntry.objects.create(dictionary=self.d, value="scheduler", label="Scheduler", behaves_like="receptionist")
        self.c.force_authenticate(self.adm)
        r = self.c.post("/api/auth/register/", {"username": "sch1", "password": "Str0ng!pass99", "email": "s@x.com", "role": "scheduler"}, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
        u = CustomUser.objects.get(username="sch1")
        self.assertEqual(u.role, "receptionist")
        self.assertEqual(u.role_entry.value, "scheduler")
        from users.serializers import UserSerializer

        self.assertEqual(UserSerializer(u).data["role_label"], "Scheduler")

    def test_unknown_role_refused(self):
        self.c.force_authenticate(self.adm)
        r = self.c.post("/api/auth/register/", {"username": "x1", "password": "Str0ng!pass99", "email": "x@x.com", "role": "wizard"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_seed_migration_values_match_roles(self):
        import importlib

        mod = importlib.import_module("users.migrations.0051_seed_role_dictionary")
        built_in = {v for v, _ in CustomUser.ROLE_CHOICES} - {"none"}
        self.assertEqual({v for v, _ in mod.BUILT_IN_ROLES}, built_in)


class RosterOnCreateProfileTests(TestCase):
    def setUp(self):
        seed_roles()
        self.c = APIClient()

    def create(self, org, role, name, **extra):
        adm = CustomUser.objects.filter(organization=org, role="admin").first() or make(org, "admin", f"adm{org.id}")
        self.c.force_authenticate(adm)
        body = {"username": name, "password": "Str0ng!pass99", "email": f"{name}@x.com", "first_name": "A", "last_name": "B", "role": role}
        body.update(extra)
        return self.c.post("/api/auth/register/", body, format="json")

    def test_staff_and_nurse_join_roster_with_staffing(self):
        from staffing.models import Staff

        org = Organization.objects.create(name="St", max_users=50, subscription_tier="premium", enabled_modules=["staffing"])
        self.assertIn(self.create(org, "nurse", "n1", job_title="Night RN", nursing_role="rn").status_code, (200, 201))
        s = Staff.objects.get(user__username="n1")
        self.assertEqual((s.profession, s.nursing_role, s.organization_id), ("Night RN", "rn", org.id))
        self.assertIn(self.create(org, "staff", "s1").status_code, (200, 201))
        s2 = Staff.objects.get(user__username="s1")
        self.assertEqual((s2.profession, s2.nursing_role), ("Staff", "other"))

    def test_others_and_orgs_without_staffing_are_left_off(self):
        from staffing.models import Staff

        org = Organization.objects.create(name="St2", max_users=50, subscription_tier="premium", enabled_modules=["staffing"])
        self.create(org, "doctor", "d1")
        self.assertFalse(Staff.objects.filter(user__username="d1").exists())
        org2 = Organization.objects.create(name="NoStaff", max_users=50, subscription_tier="premium", enabled_modules=["scheduling"])
        self.create(org2, "nurse", "n2")
        self.assertFalse(Staff.objects.filter(user__username="n2").exists())
