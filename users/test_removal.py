from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from appointments.models import Facility, Referral
from appointments.test_locations import Base, make_user
from secure_messaging.models import Thread, ThreadMember
from users.models import CustomUser, UserRightOverride


def url(user, what="removal"):
    return f"/api/users/{user.pk}/{what}/"


class RemovalBase(Base):
    def setUp(self):
        super().setUp()
        self.admin2 = make_user("adm2", "admin", self.org)
        self.outsider = make_user("out", "nurse", self.other_org)
        self.outsider_admin = make_user("outadm", "admin", self.other_org)

    def give_history(self, user):
        """Make this person someone who has acted in the chart (a referral they wrote)."""
        Referral.objects.create(organization=self.org, patient=self.patient_user, referring_provider=user, created_by=user)


class PreviewTests(RemovalBase):
    def test_no_history_means_delete(self):
        r = self.as_(self.admin).get(url(self.nurse))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["action"], "delete")
        self.assertEqual(r.json()["history"], [])

    def test_history_means_deactivate_and_names_it(self):
        self.give_history(self.doctor)
        body = self.as_(self.admin).get(url(self.doctor)).json()
        self.assertEqual(body["action"], "deactivate")
        self.assertIn("referrals", " ".join(body["history"]).lower())

    def test_being_a_patients_provider_is_not_history(self):
        # the patient's "provider" points at the doctor; that alone must not stop a delete
        body = self.as_(self.admin).get(url(self.doctor)).json()
        self.assertEqual(body["action"], "delete")

    def test_secure_messages_count_as_history(self):
        tid = self.as_(self.nurse).post("/api/secure-messages/threads/", {"kind": "direct", "user": self.doctor.pk}, format="json").json()["id"]
        r = self.as_(self.nurse).post(f"/api/secure-messages/threads/{tid}/messages/", {"body": "hi"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.as_(self.admin).get(url(self.nurse)).json()["action"], "deactivate")


class PermissionTests(RemovalBase):
    def test_non_admins_cannot_remove(self):
        for user in (self.doctor, self.nurse, self.registrar):
            self.assertEqual(self.as_(user).post(url(self.admin2)).status_code, 403)
            self.assertEqual(self.as_(user).get(url(self.admin2)).status_code, 403)
        self.assertTrue(CustomUser.objects.filter(pk=self.admin2.pk).exists())

    def test_cannot_remove_yourself(self):
        self.assertEqual(self.as_(self.admin).post(url(self.admin)).status_code, 400)
        self.assertEqual(self.as_(self.sysadmin).post(url(self.sysadmin)).status_code, 400)

    def test_admin_cannot_touch_another_organization(self):
        r = self.as_(self.admin).post(url(self.outsider))
        self.assertEqual(r.status_code, 404)
        self.assertTrue(CustomUser.objects.filter(pk=self.outsider.pk).exists())

    def test_admin_cannot_remove_system_admin(self):
        self.assertEqual(self.as_(self.admin).post(url(self.sysadmin)).status_code, 403)

    def test_system_admin_can_remove_in_any_organization(self):
        self.assertEqual(self.as_(self.sysadmin).post(url(self.outsider)).status_code, 200)
        self.assertEqual(self.as_(self.sysadmin).post(url(self.nurse)).status_code, 200)
        self.assertFalse(CustomUser.objects.filter(pk__in=[self.outsider.pk, self.nurse.pk]).exists())

    def test_patients_are_refused(self):
        self.assertEqual(self.as_(self.admin).post(url(self.patient_user)).status_code, 400)

    def test_last_active_admin_is_protected(self):
        self.assertEqual(self.as_(self.outsider_admin).post(url(self.outsider_admin)).status_code, 400)
        # the only admin of the other org, removed by the system admin, is also protected
        self.assertEqual(self.as_(self.sysadmin).post(url(self.outsider_admin)).status_code, 400)
        # but with a second active admin it is allowed
        self.assertEqual(self.as_(self.admin2).post(url(self.admin)).status_code, 200)

    def test_unknown_user(self):
        self.assertEqual(self.as_(self.admin).post("/api/users/999999/removal/").status_code, 404)


class RemovalTests(RemovalBase):
    def test_no_history_is_deleted(self):
        r = self.as_(self.admin).post(url(self.nurse))
        self.assertEqual(r.json()["result"], "deleted")
        self.assertFalse(CustomUser.objects.filter(pk=self.nurse.pk).exists())

    def test_history_is_deactivated_not_deleted(self):
        self.give_history(self.doctor)
        self.doctor.facilities.add(self.hospital)
        UserRightOverride.objects.create(user=self.doctor, right_code="orders.sign", is_granted=True)
        r = self.as_(self.admin).post(url(self.doctor))
        self.assertEqual(r.json()["result"], "deactivated")
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_active)
        self.assertIsNotNone(self.doctor.removed_at)
        self.assertEqual(self.doctor.removed_by, self.admin)
        self.assertEqual(self.doctor.facilities.count(), 0)
        self.assertFalse(UserRightOverride.objects.filter(user=self.doctor).exists())
        self.assertTrue(Referral.objects.filter(referring_provider=self.doctor).exists())

    def test_removed_person_cannot_log_in_or_use_an_old_token(self):
        self.give_history(self.doctor)
        token = str(AccessToken.for_user(self.doctor))
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(client.get("/api/secure-messages/unread-count/").status_code, 200)
        self.as_(self.admin).post(url(self.doctor))
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertIn(client.get("/api/secure-messages/unread-count/").status_code, (401, 403))
        login = APIClient().post("/api/users/login/", {"username": "doc", "password": "pw-12345-xyz"}, format="json")
        self.assertIn(login.status_code, (400, 401))

    def test_second_removal_of_a_deactivated_person_is_refused(self):
        self.give_history(self.doctor)
        self.as_(self.admin).post(url(self.doctor))
        self.assertEqual(self.as_(self.admin).post(url(self.doctor)).status_code, 400)

    def test_secure_conversations_end_with_a_note_in_groups(self):
        tid = self.as_(self.nurse).post("/api/secure-messages/threads/", {"kind": "direct", "user": self.doctor.pk}, format="json").json()["id"]
        self.as_(self.nurse).post(f"/api/secure-messages/threads/{tid}/messages/", {"body": "hi"}, format="json")
        group = self.as_(self.doctor).post(
            "/api/secure-messages/threads/", {"kind": "group", "title": "Team", "members": [self.nurse.pk, self.registrar.pk]}, format="json"
        )
        self.assertEqual(group.status_code, 201, group.content)
        gid = group.json()["id"]
        self.as_(self.admin).post(url(self.nurse))
        self.assertFalse(ThreadMember.objects.filter(user=self.nurse, left_at__isnull=True).exists())
        last = Thread.objects.get(pk=gid).messages.order_by("-id").first()
        self.assertIn("removed from the organization", last.body)

    def test_team_list_hides_removed_people(self):
        self.give_history(self.doctor)
        self.as_(self.admin).post(url(self.doctor))
        r = self.as_(self.admin).get("/api/users/team/")
        if r.status_code == 200:
            data = r.json()
            ids = [u["id"] for u in (data if isinstance(data, list) else data.get("results", []))]
            self.assertNotIn(self.doctor.pk, ids)


class RestoreTests(RemovalBase):
    def removed_doctor(self):
        self.give_history(self.doctor)
        self.as_(self.admin).post(url(self.doctor))

    def test_admin_restores(self):
        self.removed_doctor()
        self.assertEqual(self.as_(self.admin).post(url(self.doctor, "restore")).status_code, 200)
        self.doctor.refresh_from_db()
        self.assertTrue(self.doctor.is_active)
        self.assertIsNone(self.doctor.removed_at)
        self.assertIsNone(self.doctor.removed_by)

    def test_system_admin_restores_in_any_organization(self):
        self.give_history(self.doctor)
        self.as_(self.sysadmin).post(url(self.doctor))
        self.assertEqual(self.as_(self.sysadmin).post(url(self.doctor, "restore")).status_code, 200)

    def test_others_cannot_restore(self):
        self.removed_doctor()
        self.assertEqual(self.as_(self.nurse).post(url(self.doctor, "restore")).status_code, 403)
        self.assertEqual(self.as_(self.outsider_admin).post(url(self.doctor, "restore")).status_code, 404)

    def test_active_or_otherwise_deactivated_accounts_are_not_restorable(self):
        self.assertEqual(self.as_(self.admin).post(url(self.nurse, "restore")).status_code, 400)
        CustomUser.objects.filter(pk=self.nurse.pk).update(is_active=False)
        self.assertEqual(self.as_(self.admin).post(url(self.nurse, "restore")).status_code, 400)


class SerializerTests(RemovalBase):
    def test_is_active_cannot_be_flipped_through_a_profile_edit(self):
        self.as_(self.admin).patch(f"/api/users/{self.nurse.pk}/", {"is_active": False}, format="json")
        self.nurse.refresh_from_db()
        self.assertTrue(self.nurse.is_active)

    def test_search_shows_removed_state(self):
        self.give_history(self.doctor)
        self.as_(self.admin).post(url(self.doctor))
        rows = self.as_(self.admin).get("/api/users/search/?q=doc").json()
        rows = rows if isinstance(rows, list) else rows.get("results", [])
        mine = [u for u in rows if u["id"] == self.doctor.pk]
        self.assertTrue(mine and mine[0]["is_active"] is False and mine[0]["removed_at"])


class OldDeleteRouteTests(RemovalBase):
    """The plain DELETE /api/users/<id>/ (used by older screens) follows the same rules."""

    def test_delete_route_deletes_a_person_with_no_history(self):
        r = self.as_(self.admin).delete(f"/api/users/{self.nurse.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(CustomUser.objects.filter(pk=self.nurse.pk).exists())

    def test_delete_route_never_deletes_someone_with_history(self):
        self.give_history(self.doctor)
        r = self.as_(self.admin).delete(f"/api/users/{self.doctor.pk}/")
        self.assertEqual(r.json()["result"], "deactivated")
        self.assertTrue(CustomUser.objects.filter(pk=self.doctor.pk, is_active=False).exists())

    def test_delete_route_keeps_the_guards(self):
        self.assertEqual(self.as_(self.nurse).delete(f"/api/users/{self.admin2.pk}/").status_code, 403)
        self.assertEqual(self.as_(self.admin).delete(f"/api/users/{self.admin.pk}/").status_code, 400)
        self.assertEqual(self.as_(self.admin).delete(f"/api/users/{self.outsider.pk}/").status_code, 404)
        self.assertEqual(self.as_(self.admin).delete("/api/users/999999/").status_code, 404)


class OldDeleteRouteTests(RemovalBase):
    """The plain DELETE /api/users/<id>/ (used by older screens) follows the same rules."""

    def test_delete_route_deletes_a_person_with_no_history(self):
        r = self.as_(self.admin).delete(f"/api/users/{self.nurse.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(CustomUser.objects.filter(pk=self.nurse.pk).exists())

    def test_delete_route_never_deletes_someone_with_history(self):
        self.give_history(self.doctor)
        r = self.as_(self.admin).delete(f"/api/users/{self.doctor.pk}/")
        self.assertEqual(r.json()["result"], "deactivated")
        self.assertTrue(CustomUser.objects.filter(pk=self.doctor.pk, is_active=False).exists())

    def test_delete_route_keeps_the_guards(self):
        self.assertEqual(self.as_(self.nurse).delete(f"/api/users/{self.admin2.pk}/").status_code, 403)
        self.assertEqual(self.as_(self.admin).delete(f"/api/users/{self.admin.pk}/").status_code, 400)
        self.assertEqual(self.as_(self.admin).delete(f"/api/users/{self.outsider.pk}/").status_code, 404)
        self.assertEqual(self.as_(self.admin).delete("/api/users/999999/").status_code, 404)
