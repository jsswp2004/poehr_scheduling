from datetime import date, timedelta

from django.utils import timezone

from appointments.chart_tabs import resolve
from appointments.models import LabReport
from appointments.test_locations import Base
from users.board_config import default_view_config
from users.ed_board import age_text
from users.models import Registration
from users.test_ed_board import EdBoardBase

FOLLOW_UP = "/api/users/ed-board/follow-up/"
BOARD = "/api/users/ed-board/"
VIEWS = "/api/users/status-views/"
ONE = "/api/users/status-views/{}/"


class FollowUpBase(EdBoardBase):
    def discharged(self, hours_ago=5, patient=None):
        """An ED visit that ended `hours_ago` hours ago."""
        visit_id = self.er_visit(patient=patient)
        when = timezone.now() - timedelta(hours=hours_ago)
        Registration.objects.filter(pk=visit_id).update(discharge_datetime=when, arrival_time=when - timedelta(hours=3))
        return visit_id, when

    def result(self, visit_id, when, title="CBC", status="final", review="unreviewed", user=None):
        return LabReport.objects.create(
            organization=self.org,
            patient=(user or self.patient_user),
            title=title,
            status=status,
            resulted_at=when,
            review_status=review,
            visit_id=visit_id,
        )

    def follow_up(self, user=None, **params):
        return self.as_(user or self.nurse).get(FOLLOW_UP, params)

    def row_for(self, data, visit_id):
        return next(r["visit"] for r in data["rows"] if r["visit"]["registration"] == visit_id)


class FollowUpBoardTests(FollowUpBase):
    def test_lists_discharged_visits_with_the_discharge_time(self):
        visit_id, when = self.discharged(hours_ago=5)
        data = self.follow_up().json()
        self.assertEqual(data["unit"], self.ed.pk)
        self.assertEqual(data["total"], 1)
        row = self.row_for(data, visit_id)
        self.assertTrue(row["discharged_at"].startswith(when.astimezone(timezone.get_current_timezone()).strftime("%Y-%m-%dT%H:%M")) or row["discharged_at"][:10] in (when.date().isoformat(), (when + timedelta(days=1)).date().isoformat()))
        self.assertEqual(data["rows"][0]["type"], "followup")

    def test_open_visits_are_not_on_the_follow_up_board(self):
        self.er_visit()
        self.assertEqual(self.follow_up().json()["rows"], [])

    def test_look_back_window(self):
        old_id, _ = self.discharged(hours_ago=24 * 10)
        recent_id, _ = self.discharged(hours_ago=3)
        seven = self.follow_up(days=7).json()
        self.assertEqual([r["visit"]["registration"] for r in seven["rows"]], [recent_id])
        fourteen = self.follow_up(days=14).json()
        self.assertEqual({r["visit"]["registration"] for r in fourteen["rows"]}, {old_id, recent_id})
        self.assertEqual(seven["days"], 7)
        # nonsense falls back to the default, and the window never passes 30 days
        self.assertEqual(self.follow_up(days="soon").json()["days"], 7)
        self.assertEqual(self.follow_up(days=999).json()["days"], 30)

    def test_a_result_after_discharge_flags_the_visit(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when + timedelta(hours=1), title="Troponin")
        self.result(visit_id, when + timedelta(hours=2), title="Urine culture")
        data = self.follow_up().json()
        flag = self.row_for(data, visit_id)["new_results"]
        self.assertEqual(flag, {"state": "new", "count": 2, "tests": ["Troponin", "Urine culture"]})
        self.assertEqual(data["needs_review"], 1)

    def test_a_result_before_discharge_does_not_flag(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when - timedelta(hours=1))
        data = self.follow_up().json()
        self.assertEqual(self.row_for(data, visit_id)["new_results"]["state"], "none")
        self.assertEqual(data["needs_review"], 0)

    def test_entered_in_error_never_counts(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when + timedelta(hours=1), status="entered_in_error")
        self.assertEqual(self.row_for(self.follow_up().json(), visit_id)["new_results"]["state"], "none")

    def test_corrected_and_preliminary_results_count(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when + timedelta(hours=1), title="Culture", status="preliminary")
        self.result(visit_id, when + timedelta(hours=2), title="CBC", status="corrected")
        self.assertEqual(self.row_for(self.follow_up().json(), visit_id)["new_results"]["count"], 2)

    def test_reviewing_clears_the_flag(self):
        visit_id, when = self.discharged(hours_ago=5)
        report = self.result(visit_id, when + timedelta(hours=1))
        self.assertEqual(self.follow_up().json()["needs_review"], 1)
        report.review_status = "reviewed"
        report.save()
        data = self.follow_up().json()
        self.assertEqual(self.row_for(data, visit_id)["new_results"], {"state": "reviewed", "count": 0, "tests": []})
        self.assertEqual(data["needs_review"], 0)

    def test_one_unreviewed_result_keeps_the_flag_on(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when + timedelta(hours=1), title="CBC", review="reviewed")
        self.result(visit_id, when + timedelta(hours=2), title="Culture")
        flag = self.row_for(self.follow_up().json(), visit_id)["new_results"]
        self.assertEqual((flag["state"], flag["count"], flag["tests"]), ("new", 1, ["Culture"]))

    def test_only_results_for_this_visit_count(self):
        visit_id, when = self.discharged(hours_ago=5)
        LabReport.objects.create(organization=self.org, patient=self.patient_user, title="Other visit", resulted_at=when + timedelta(hours=1))
        self.assertEqual(self.row_for(self.follow_up().json(), visit_id)["new_results"]["state"], "none")

    def test_flagged_patients_come_first_then_the_newest_discharge(self):
        a, _ = self.discharged(hours_ago=2)
        b, when_b = self.discharged(hours_ago=30)
        c, _ = self.discharged(hours_ago=10)
        self.result(b, when_b + timedelta(hours=1))
        order = [r["visit"]["registration"] for r in self.follow_up().json()["rows"]]
        self.assertEqual(order, [b, a, c])

    def test_summary_is_just_the_count(self):
        visit_id, when = self.discharged(hours_ago=5)
        self.result(visit_id, when + timedelta(hours=1))
        self.assertEqual(self.follow_up(summary=1).json(), {"needs_review": 1})

    def test_only_front_line_staff_see_it(self):
        self.assertEqual(self.follow_up(user=self.patient_user).status_code, 403)
        for user in (self.doctor, self.nurse, self.registrar, self.admin):
            self.assertEqual(self.follow_up(user=user).status_code, 200)

    def test_another_clinic_is_not_shown(self):
        visit_id, _ = self.discharged(hours_ago=5)
        Registration.objects.filter(pk=visit_id).update(organization=self.other_org)
        self.patient_user.organization = self.other_org
        self.patient_user.save()
        self.assertEqual(self.follow_up().json()["rows"], [])

    def test_unknown_department_is_404(self):
        self.assertEqual(self.follow_up(unit=999999).status_code, 404)

    def test_the_standard_follow_up_view_is_offered_with_both_new_columns(self):
        data = self.follow_up().json()
        self.assertEqual(data["default_view"], "followup")
        view = data["views"][0]
        self.assertEqual((view["key"], view["kind"], view["builtin"]), ("followup", "follow_up", True))
        shown = [c["key"] for c in view["columns"] if c["visible"]]
        self.assertEqual(shown[:4], ["patient", "age", "discharged", "new_results"])
        self.assertNotIn("loc", shown)

    def test_ages_for_babies_read_in_months_and_days(self):
        today = date(2026, 10, 23)
        self.assertEqual(age_text(date(2023, 10, 23), today), "3 y")
        self.assertEqual(age_text(date(2026, 2, 23), today), "8 mo")
        self.assertEqual(age_text(date(2026, 10, 12), today), "11 d")
        self.assertEqual(age_text(None, today), "")


class FollowUpViewsTests(FollowUpBase):
    def api(self):
        return self.as_(self.admin)

    def make_view(self, name, **extra):
        r = self.api().post(VIEWS, {"name": name, **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_a_follow_up_view_is_made_with_the_two_new_columns(self):
        view = self.make_view("Peds follow-up", kind="follow_up")
        self.assertEqual(view["kind"], "follow_up")
        self.assertEqual(view["follow_up"], {"days": 7})
        keys = [c["key"] for c in view["columns"]]
        self.assertIn("discharged", keys)
        self.assertIn("new_results", keys)
        self.assertEqual({c["key"]: c["visible"] for c in view["columns"]}["loc"], False)

    def test_a_live_view_has_no_follow_up_columns(self):
        view = self.make_view("Nurse view")
        self.assertEqual(view["kind"], "live")
        self.assertNotIn("discharged", [c["key"] for c in view["columns"]])

    def test_unknown_kind_is_refused(self):
        r = self.api().post(VIEWS, {"name": "X", "kind": "weird"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_a_copy_keeps_the_kind(self):
        source = self.make_view("Follow-up A", kind="follow_up")
        copy = self.make_view("Follow-up B", from_view=source["id"])
        self.assertEqual(copy["kind"], "follow_up")

    def test_a_view_cannot_change_its_kind(self):
        view = self.make_view("Follow-up A", kind="follow_up")
        config = {"columns": view["columns"], "kind": "live"}
        r = self.api().patch(ONE.format(view["id"]), {"config": config}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["kind"], "follow_up")

    def test_each_board_lists_only_its_own_views(self):
        live = self.make_view("Nurse view")
        fu = self.make_view("Peds follow-up", kind="follow_up")
        board = self.as_(self.nurse).get(BOARD).json()
        self.assertEqual([v["key"] for v in board["views"]], ["all", "waiting", f"v{live['id']}"])
        follow = self.follow_up().json()
        self.assertEqual([v["key"] for v in follow["views"]], ["followup", f"v{fu['id']}"])

    def test_a_default_follow_up_view_is_what_the_tab_opens_on(self):
        fu = self.make_view("Peds follow-up", kind="follow_up")
        self.api().patch(ONE.format(fu["id"]), {"is_default": True}, format="json")
        self.assertEqual(self.follow_up().json()["default_view"], f"v{fu['id']}")

    def test_the_look_back_is_saved_and_checked(self):
        view = self.make_view("Month", kind="follow_up")
        config = {"columns": view["columns"], "follow_up": {"days": 30}}
        r = self.api().patch(ONE.format(view["id"]), {"config": config}, format="json")
        self.assertEqual(r.json()["follow_up"], {"days": 30})
        for bad in (0, 31, "7", True):
            r = self.api().patch(ONE.format(view["id"]), {"config": {"columns": view["columns"], "follow_up": {"days": bad}}}, format="json")
            self.assertEqual(r.status_code, 400, bad)

    def test_list_offers_the_follow_up_starting_layout(self):
        data = self.api().get(VIEWS).json()
        keys = [c["key"] for c in data["default_follow_up_config"]["columns"]]
        self.assertEqual(data["default_follow_up_config"]["kind"], "follow_up")
        self.assertIn("discharged", keys)
        self.assertNotIn("discharged", [c["key"] for c in default_view_config()["columns"]])


class CriteriaTests(FollowUpBase):
    def api(self):
        return self.as_(self.admin)

    def save(self, view, criteria):
        config = {"columns": view["columns"], "criteria": criteria}
        return self.api().patch(ONE.format(view["id"]), {"config": config}, format="json")

    def view(self):
        r = self.api().post(VIEWS, {"name": "Peds ED"}, format="json")
        self.assertEqual(r.status_code, 201)
        return r.json()

    def test_a_new_view_has_no_conditions(self):
        self.assertEqual(self.view()["criteria"], {"match": "all", "conditions": []})

    def test_age_under_eighteen_is_saved(self):
        view = self.view()
        criteria = {"match": "all", "conditions": [{"field": "age", "op": "lt", "value": 18, "unit": "years"}]}
        r = self.save(view, criteria)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["criteria"], criteria)

    def test_every_kind_of_condition_is_accepted(self):
        view = self.view()
        criteria = {
            "match": "any",
            "conditions": [
                {"field": "age", "op": "lte", "value": 6, "unit": "months"},
                {"field": "esi", "op": "in", "value": [2, 1, 2]},
                {"field": "ed_status", "op": "in", "value": ["wtbs"]},
                {"field": "sex", "op": "in", "value": ["M", "F"]},
                {"field": "md", "op": "in", "value": [self.doctor.pk]},
                {"field": "rn", "op": "in", "value": [self.nurse.pk]},
                {"field": "complaint", "op": "contains", "value": "fever"},
            ],
        }
        r = self.save(view, criteria)
        self.assertEqual(r.status_code, 200, r.content)
        saved = r.json()["criteria"]
        self.assertEqual(saved["match"], "any")
        by_field = {c["field"]: c for c in saved["conditions"]}
        self.assertEqual(by_field["esi"]["value"], [1, 2])
        self.assertEqual(by_field["sex"]["value"], ["F", "M"])

    def test_bad_conditions_are_refused(self):
        view = self.view()
        bad = [
            {"match": "some", "conditions": []},
            {"match": "all", "conditions": [{"field": "shoe_size", "op": "lt", "value": 3}]},
            {"match": "all", "conditions": [{"field": "age", "op": "in", "value": [1]}]},
            {"match": "all", "conditions": [{"field": "age", "op": "lt", "value": -1, "unit": "years"}]},
            {"match": "all", "conditions": [{"field": "age", "op": "lt", "value": 18, "unit": "weeks"}]},
            {"match": "all", "conditions": [{"field": "age", "op": "lt", "value": True, "unit": "years"}]},
            {"match": "all", "conditions": [{"field": "esi", "op": "in", "value": [6]}]},
            {"match": "all", "conditions": [{"field": "esi", "op": "in", "value": []}]},
            {"match": "all", "conditions": [{"field": "sex", "op": "in", "value": ["Q"]}]},
            {"match": "all", "conditions": [{"field": "ed_status", "op": "in", "value": ["nope"]}]},
            {"match": "all", "conditions": [{"field": "md", "op": "in", "value": [self.nurse.pk]}]},
            {"match": "all", "conditions": [{"field": "complaint", "op": "contains", "value": "  "}]},
            {"match": "all", "conditions": [{"field": "esi", "op": "in", "value": [1]}] * 11},
        ]
        for criteria in bad:
            self.assertEqual(self.save(view, criteria).status_code, 400, criteria)

    def test_a_status_the_clinic_later_removes_just_drops_out(self):
        view = self.view()
        criteria = {"match": "all", "conditions": [{"field": "ed_status", "op": "in", "value": ["wtbs"]}, {"field": "esi", "op": "in", "value": [1]}]}
        self.assertEqual(self.save(view, criteria).status_code, 200)
        r = self.api().patch("/api/users/status-views/settings/", {"statuses": [{"value": "tip", "code": "TIP", "label": "Treating"}]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        board = self.as_(self.nurse).get(BOARD).json()
        saved = next(v for v in board["views"] if v["label"] == "Peds ED")
        self.assertEqual([c["field"] for c in saved["criteria"]["conditions"]], ["esi"])

    def test_the_board_sends_age_in_every_unit(self):
        self.patient.date_of_birth = date.today() - timedelta(days=100)
        self.patient.save()
        self.er_visit(bed=self.ed_bed_a)
        row = next(r for r in self.as_(self.nurse).get(BOARD).json()["rows"] if r["loc"] == "ED1-A")
        v = row["visit"]
        self.assertEqual((v["age"], v["age_days"], v["age_months"]), (0, 100, 3))
        self.assertEqual(v["age_text"], "3 mo")


class FollowUpTabTests(Base):
    def test_the_tab_is_only_in_the_emergency_module(self):
        self.assertIn("ed_follow_up", resolve(self.org, self.doctor, "emergency")["tabs"])
        self.assertNotIn("ed_follow_up", resolve(self.org, self.doctor, "ambulatory")["tabs"])
        self.assertNotIn("ed_follow_up", resolve(self.org, self.doctor, "acute")["tabs"])

    def test_every_front_line_role_gets_it(self):
        for user in (self.doctor, self.nurse, self.registrar, self.admin):
            self.assertIn("ed_follow_up", resolve(self.org, user, "emergency")["tabs"])
