from appointments.test_locations import Base, make_user

TEAM = "/api/users/team/"


def names(response):
    return [u["username"] for u in response.json()["results"]]


class TeamListTests(Base):
    """Base gives the organization: adm (admin), doc (doctor Jeffrey Lee), nurse, reg (registrar), and two patients."""

    def setUp(self):
        super().setUp()
        self.recep = make_user("recep", "receptionist", self.org, first_name="Carla", last_name="Mendes", phone_number="2405550134")
        self.elsewhere = make_user("away", "doctor", self.other_org, first_name="Zed", last_name="Away")
        self.doctor.phone_number = "3015550111"
        self.doctor.is_online = True
        self.doctor.sms_consent = True
        self.doctor.save()

    def get(self, user=None, **params):
        response = self.as_(user or self.admin).get(TEAM, params)
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def test_only_staff_of_my_organization(self):
        got = names(self.get())
        self.assertEqual(sorted(got), ["adm", "doc", "nurse", "recep", "reg"])
        self.assertNotIn("away", got)
        self.assertNotIn("pat", got)

    def test_a_nurse_may_not_open_the_team_list(self):
        self.assertEqual(self.as_(self.nurse).get(TEAM).status_code, 403)

    def test_ordered_by_last_name_then_first_name(self):
        self.admin.last_name = "Lee"
        self.admin.first_name = "Adam"
        self.admin.save()
        got = names(self.get())
        self.assertLess(got.index("adm"), got.index("doc"))  # Lee, Adam before Lee, Jeffrey

    def test_search_matches_each_word_against_name_or_email(self):
        self.assertEqual(names(self.get(search="jeffrey lee")), ["doc"])
        self.assertEqual(names(self.get(search="lee jeff")), ["doc"])
        self.assertEqual(names(self.get(search="mendes")), ["recep"])
        self.assertEqual(names(self.get(search="recep@example")), ["recep"])
        self.assertEqual(names(self.get(search="jeffrey mendes")), [])

    def test_search_matches_a_phone_number_in_any_format(self):
        self.assertEqual(names(self.get(search="240-555-0134")), ["recep"])
        self.assertEqual(names(self.get(search="(301) 555-0111")), ["doc"])
        self.assertEqual(names(self.get(search="5550134")), ["recep"])

    def test_role_filter(self):
        self.assertEqual(names(self.get(role="doctor")), ["doc"])
        self.assertEqual(names(self.get(role="nurse")), ["nurse"])
        self.assertEqual(names(self.get(role="registrar")), ["reg"])
        self.assertEqual(names(self.get(role="admin")), ["adm"])
        self.assertEqual(names(self.get(role="other")), ["recep"])
        self.assertEqual(len(names(self.get(role="nonsense"))), 5)  # an unknown role is ignored

    def test_the_admin_group_includes_system_admins(self):
        got = names(self.get(user=self.sysadmin, role="admin"))
        self.assertIn("sys", got)
        self.assertIn("adm", got)

    def test_online_filter(self):
        self.assertEqual(names(self.get(online="1")), ["doc"])
        self.assertEqual(names(self.get(online="1", role="nurse")), [])

    def test_counts_cover_the_search_and_ignore_the_role_filter(self):
        counts = self.get().json()["role_counts"]
        self.assertEqual(counts, {"all": 5, "online": 1, "doctor": 1, "nurse": 1, "registrar": 1, "admin": 1, "other": 1})
        filtered = self.get(role="doctor").json()["role_counts"]
        self.assertEqual(filtered["all"], 5)
        self.assertEqual(filtered["nurse"], 1)
        searched = self.get(search="lee").json()["role_counts"]
        self.assertEqual(searched["all"], 1)
        self.assertEqual(searched["doctor"], 1)
        self.assertEqual(searched["nurse"], 0)

    def test_paging_still_works(self):
        body = self.get(page_size=2).json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["results"]), 2)
        self.assertTrue(body["next"])
        self.assertEqual(body["role_counts"]["all"], 5)


class CanTextTests(Base):
    def setUp(self):
        super().setUp()

    def can_text(self, **fields):
        for key, value in fields.items():
            setattr(self.doctor, key, value)
        self.doctor.save()
        results = self.as_(self.admin).get(TEAM, {"role": "doctor"}).json()["results"]
        return results[0]["can_text"]

    def test_needs_consent_a_phone_and_no_opt_out(self):
        self.assertFalse(self.can_text(sms_consent=False, phone_number="3015550111"))
        self.assertTrue(self.can_text(sms_consent=True, phone_number="3015550111"))
        self.assertFalse(self.can_text(sms_opt_out=True))
        self.assertFalse(self.can_text(sms_opt_out=False, phone_number=""))
        self.assertFalse(self.can_text(phone_number="   "))
        self.assertTrue(self.can_text(phone_number="3015550111"))
