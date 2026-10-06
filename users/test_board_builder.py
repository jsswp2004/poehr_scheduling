from appointments.models import Bed, Room
from appointments.test_locations import Base, make_user
from users.board_config import default_view_config
from users.models import Registration, StatusBoardView

VIEWS = "/api/users/status-views/"
ONE = "/api/users/status-views/{}/"
UNDO = "/api/users/status-views/{}/undo/"
SETTINGS = "/api/users/status-views/settings/"
BOARD = "/api/users/ed-board/"
PREF = "/api/users/ed-board/preference/"
EDIT = "/api/users/admissions/{}/board/"


class BuilderBase(Base):
    def setUp(self):
        super().setUp()
        self.room = Room.objects.create(unit=self.ed, name="ED1")
        self.bed = Bed.objects.create(room=self.room, name="A")
        self.nurse2 = make_user("nurse2", "nurse", self.org, first_name="Sam", last_name="Bell")

    def api(self, user=None):
        return self.as_(user or self.admin)

    def make_view(self, name="Nurse view", **extra):
        r = self.api().post(VIEWS, {"name": name, **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def save(self, view, **changes):
        config = {"columns": view["columns"], "rules": view["rules"], "filter": view["filter"]}
        config.update(changes)
        return self.api().patch(ONE.format(view["id"]), {"config": config}, format="json")

    def er_visit(self):
        body = {"patient": self.patient.pk, "organization": self.org.pk, "admission_type": "emergency", "unit": self.ed.pk, "room": self.room.pk, "bed": self.bed.pk}
        r = self.as_(self.registrar).post("/api/users/registrations/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def board(self, user=None, **params):
        return self.as_(user or self.nurse).get(BOARD, params).json()


class AccessTests(BuilderBase):
    def test_only_admins_can_use_the_builder(self):
        for user in (self.nurse, self.doctor, self.registrar):
            self.assertEqual(self.api(user).get(VIEWS).status_code, 403)
            self.assertEqual(self.api(user).post(VIEWS, {"name": "x"}, format="json").status_code, 403)
            self.assertEqual(self.api(user).patch(SETTINGS, {}, format="json").status_code, 403)

    def test_list_returns_views_settings_departments_and_people(self):
        v = self.make_view()
        data = self.api().get(VIEWS).json()
        self.assertEqual([x["name"] for x in data["views"]], ["Nurse view"])
        self.assertEqual(data["views"][0]["id"], v["id"])
        self.assertEqual([d["name"] for d in data["departments"]], ["ED"])
        self.assertEqual(len(data["settings"]["statuses"]), 5)
        self.assertEqual(data["settings"]["vitals_overdue_minutes"], 60)
        self.assertIn("Bell, Sam", [p["name"] for p in data["people"]["nurses"]])

    def test_views_belong_to_one_clinic(self):
        v = self.make_view()
        outsider = make_user("outsider", "admin", self.other_org)
        self.assertEqual(self.api(outsider).patch(ONE.format(v["id"]), {"name": "Mine"}, format="json").status_code, 404)
        self.assertEqual(self.api(outsider).delete(ONE.format(v["id"])).status_code, 404)
        self.assertEqual(self.api(outsider).get(VIEWS).json()["views"], [])


class ViewTests(BuilderBase):
    def test_a_new_view_starts_from_the_built_in_layout_with_your_name(self):
        v = self.make_view("Physician view")
        self.assertEqual((v["name"], v["filter"], v["rules"]), ("Physician view", "all", []))
        self.assertEqual([c["key"] for c in v["columns"]][:3], ["loc", "los", "patient"])
        self.assertEqual(v["author"]["id"], self.admin.pk)

    def test_names_are_required_trimmed_unique_and_can_be_changed(self):
        self.assertEqual(self.api().post(VIEWS, {"name": "  "}, format="json").status_code, 400)
        self.assertEqual(self.api().post(VIEWS, {"name": "x" * 61}, format="json").status_code, 400)
        v = self.make_view("  Triage   desk ")
        self.assertEqual(v["name"], "Triage desk")
        self.assertEqual(self.api().post(VIEWS, {"name": "triage DESK"}, format="json").status_code, 400)
        r = self.api().patch(ONE.format(v["id"]), {"name": "Triage"}, format="json")
        self.assertEqual((r.status_code, r.json()["name"]), (200, "Triage"))
        other = self.make_view("Other")
        self.assertEqual(self.api().patch(ONE.format(other["id"]), {"name": "triage"}, format="json").status_code, 400)
        # keeping its own name is fine
        self.assertEqual(self.api().patch(ONE.format(v["id"]), {"name": "Triage"}, format="json").status_code, 200)

    def test_duplicate_copies_another_views_layout(self):
        v = self.make_view("First")
        cols = v["columns"]
        cols[3]["label"] = "Years"
        self.save(v, columns=cols, filter="waiting")
        copy = self.make_view("Second", from_view=v["id"])
        self.assertEqual(copy["filter"], "waiting")
        self.assertEqual(next(c for c in copy["columns"] if c["key"] == "age")["label"], "Years")

    def test_rename_hide_reorder_resize_filter_are_saved(self):
        v = self.make_view()
        cols = v["columns"]
        cols[3]["label"] = "Years"
        cols[3]["width"] = 55
        cols[6]["visible"] = False
        cols.insert(0, cols.pop(2))
        r = self.save(v, columns=cols, filter="mine")
        self.assertEqual(r.status_code, 200, r.content)
        saved = r.json()
        self.assertEqual(saved["columns"][0]["key"], "patient")
        self.assertEqual(next(c for c in saved["columns"] if c["key"] == "age")["label"], "Years")
        self.assertFalse(next(c for c in saved["columns"] if c["key"] == "esi")["visible"])
        self.assertEqual(saved["filter"], "mine")

    def test_required_columns_stay_visible_and_missing_ones_return_hidden(self):
        v = self.make_view()
        cols = [c for c in v["columns"] if c["key"] not in ("vitals", "actions")]
        for c in cols:
            if c["key"] == "loc":
                c["visible"] = False
        by_key = {c["key"]: c for c in self.save(v, columns=cols).json()["columns"]}
        self.assertTrue(by_key["loc"]["visible"])
        self.assertTrue(by_key["actions"]["visible"])
        self.assertFalse(by_key["vitals"]["visible"])

    def test_bad_layouts_are_refused(self):
        v = self.make_view()

        def bad(text, **changes):
            r = self.save(v, **changes)
            self.assertEqual(r.status_code, 400, r.content)
            self.assertIn(text, r.json()["detail"])

        bad("not a column", columns=v["columns"] + [{"key": "bogus", "label": "X"}])
        bad("twice", columns=v["columns"] + [{"key": "loc", "label": "Again"}])
        bad("between 40 and 600", columns=[dict(v["columns"][0], width=5)] + v["columns"][1:])
        bad("lists all patients", filter="everyone")
        bad("cannot look at", rules=[{"field": "nope", "color": "#ff0000"}])
        bad("#ff0000", rules=[{"field": "esi", "value": "1", "color": "red"}])

    def test_delete_removes_the_view(self):
        v = self.make_view()
        self.assertEqual(self.api().delete(ONE.format(v["id"])).status_code, 204)
        self.assertEqual(StatusBoardView.objects.count(), 0)

    def test_only_one_view_is_the_clinic_default(self):
        a, b = self.make_view("A"), self.make_view("B")
        self.api().patch(ONE.format(a["id"]), {"is_default": True}, format="json")
        r = self.api().patch(ONE.format(b["id"]), {"is_default": True}, format="json")
        self.assertTrue(r.json()["is_default"])
        self.assertEqual(list(StatusBoardView.objects.filter(is_default=True).values_list("name", flat=True)), ["B"])


class UndoTests(BuilderBase):
    def test_undo_puts_back_the_layout_before_the_last_save_and_undo_again_redoes(self):
        v = self.make_view()
        self.assertFalse(v["can_undo"])
        cols = v["columns"]
        cols[3]["label"] = "Years"
        saved = self.save(v, columns=cols).json()
        self.assertTrue(saved["can_undo"])
        r = self.api().post(UNDO.format(v["id"]), {}, format="json")
        self.assertEqual(next(c for c in r.json()["columns"] if c["key"] == "age")["label"], "Age")
        r = self.api().post(UNDO.format(v["id"]), {}, format="json")
        self.assertEqual(next(c for c in r.json()["columns"] if c["key"] == "age")["label"], "Years")

    def test_only_the_last_save_is_kept(self):
        v = self.make_view()
        for label in ("One", "Two", "Three"):
            cols = v["columns"]
            cols[3]["label"] = label
            v = self.save(v, columns=cols).json()
        r = self.api().post(UNDO.format(v["id"]), {}, format="json")
        self.assertEqual(next(c for c in r.json()["columns"] if c["key"] == "age")["label"], "Two")

    def test_saving_without_changes_does_not_disturb_undo(self):
        v = self.make_view()
        cols = v["columns"]
        cols[3]["label"] = "Years"
        v = self.save(v, columns=cols).json()
        self.save(v)  # same layout again
        r = self.api().post(UNDO.format(v["id"]), {}, format="json")
        self.assertEqual(next(c for c in r.json()["columns"] if c["key"] == "age")["label"], "Age")

    def test_nothing_to_undo_on_a_fresh_view(self):
        v = self.make_view()
        self.assertEqual(self.api().post(UNDO.format(v["id"]), {}, format="json").status_code, 400)


class SettingsTests(BuilderBase):
    def patch(self, **body):
        return self.api().patch(SETTINGS, body, format="json")

    def test_statuses_and_vitals_limit_are_saved_and_shared(self):
        r = self.patch(statuses=[{"value": "triage", "code": "TRI", "label": "In triage"}, {"value": "tip", "code": "TIP", "label": "Treatment"}], vitals_overdue_minutes=30)
        self.assertEqual(r.status_code, 200, r.content)
        data = self.board()
        self.assertEqual([s["code"] for s in data["statuses"]], ["TRI", "TIP"])
        self.assertEqual(data["config"]["vitals_overdue_minutes"], 30)

    def test_bad_settings_are_refused(self):
        for body, text in [
            ({"statuses": []}, "between 1 and"),
            ({"statuses": [{"value": "A B", "code": "X", "label": "x"}]}, "status key"),
            ({"statuses": [{"value": "a", "code": "A", "label": "a"}, {"value": "a", "code": "B", "label": "b"}]}, "twice"),
            ({"vitals_overdue_minutes": 2}, "between 5 and 1440"),
            ({"custom_columns": [{"key": "bogus", "label": "X"}]}, "not a valid custom column"),
            ({"custom_columns": [{"key": "c_x", "label": "X", "kind": "weird"}]}, "text, dropdown or checkbox"),
            ({"custom_columns": [{"key": "c_x", "label": "X", "kind": "dropdown", "options": []}]}, "choices"),
        ]:
            r = self.patch(**body)
            self.assertEqual(r.status_code, 400, (body, r.content))
            self.assertIn(text, r.json()["detail"])

    def test_old_statuses_stop_being_accepted_on_the_board(self):
        self.patch(statuses=[{"value": "triage", "code": "TRI", "label": "In triage"}])
        vid = self.er_visit()
        ok = self.as_(self.nurse).patch(EDIT.format(vid), {"ed_status": "triage"}, format="json")
        self.assertEqual((ok.status_code, ok.json()["ed_status"]), (200, "triage"))
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"ed_status": "wtbs"}, format="json").status_code, 400)

    def test_roster_limits_the_dropdowns_per_department_with_a_clinic_default(self):
        self.patch(roster={"default": {"nurses": [self.nurse2.pk], "doctors": None}, "units": {}})
        staff = self.board()["staff"]
        self.assertEqual([n["id"] for n in staff["nurses"]], [self.nurse2.pk])
        self.assertEqual([d["id"] for d in staff["doctors"]], [self.doctor.pk])
        self.patch(roster={"default": {"nurses": [self.nurse2.pk], "doctors": None}, "units": {str(self.ed.pk): {"nurses": [self.nurse.pk], "doctors": [self.doctor.pk]}}})
        self.assertEqual([n["id"] for n in self.board(unit=self.ed.pk)["staff"]["nurses"]], [self.nurse.pk])

    def test_roster_must_be_active_people_of_the_right_role_in_this_clinic(self):
        far = make_user("nurse_far", "nurse", self.other_org)
        for roster in (
            {"default": {"nurses": [far.pk], "doctors": None}},
            {"default": {"nurses": [self.doctor.pk], "doctors": None}},
            {"units": {"999999": {"nurses": [self.nurse.pk], "doctors": None}}},
        ):
            r = self.patch(roster=roster)
            self.assertEqual(r.status_code, 400, r.content)

    def test_leaving_things_out_keeps_what_was_saved(self):
        self.patch(vitals_overdue_minutes=45)
        self.patch(statuses=[{"value": "triage", "code": "TRI", "label": "In triage"}])
        data = self.api().get(VIEWS).json()["settings"]
        self.assertEqual((data["vitals_overdue_minutes"], len(data["statuses"])), (45, 1))


class CustomColumnTests(BuilderBase):
    CUSTOM = [
        {"key": "c_isolation", "label": "Isolation", "kind": "dropdown", "options": ["None", "Contact", "Airborne"]},
        {"key": "c_note", "label": "Tech note", "kind": "text"},
        {"key": "c_belongings", "label": "Belongings", "kind": "checkbox"},
    ]

    def setUp(self):
        super().setUp()
        r = self.api().patch(SETTINGS, {"custom_columns": self.CUSTOM}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_custom_columns_appear_in_every_view_hidden_until_shown(self):
        v = self.make_view()
        by_key = {c["key"]: c for c in v["columns"]}
        self.assertFalse(by_key["c_isolation"]["visible"])
        self.assertEqual((by_key["c_isolation"]["kind"], by_key["c_isolation"]["options"]), ("dropdown", ["None", "Contact", "Airborne"]))
        cols = v["columns"]
        next(c for c in cols if c["key"] == "c_isolation")["visible"] = True
        self.assertTrue(next(c for c in self.save(v, columns=cols).json()["columns"] if c["key"] == "c_isolation")["visible"])

    def test_the_board_view_carries_the_choices(self):
        self.make_view("Iso")
        view = [x for x in self.board()["views"] if x["label"] == "Iso"][0]
        self.assertEqual(next(c for c in view["columns"] if c["key"] == "c_isolation")["options"], ["None", "Contact", "Airborne"])

    def test_values_are_saved_and_shown_and_merge(self):
        vid = self.er_visit()
        r = self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_isolation": "Contact", "c_note": " IV started ", "c_belongings": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["custom"], {"c_isolation": "Contact", "c_note": "IV started", "c_belongings": True})
        row = [x for x in self.board()["rows"] if x["type"] == "bed"][0]
        self.assertEqual(row["visit"]["custom"]["c_isolation"], "Contact")
        r = self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_belongings": False}}, format="json")
        self.assertEqual(r.json()["custom"]["c_isolation"], "Contact")

    def test_unknown_columns_and_bad_choices_are_refused(self):
        vid = self.er_visit()
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_nope": "x"}}, format="json").status_code, 400)
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_isolation": "Lava"}}, format="json").status_code, 400)
        self.assertEqual(Registration.objects.get(pk=vid).board_custom, {})

    def test_a_view_cannot_use_a_custom_column_that_does_not_exist(self):
        v = self.make_view()
        r = self.save(v, columns=v["columns"] + [{"key": "c_ghost", "label": "Ghost"}])
        self.assertEqual(r.status_code, 400)

    def test_rules_may_use_a_custom_column(self):
        v = self.make_view()
        r = self.save(v, rules=[{"field": "c_isolation", "op": "eq", "value": "Contact", "target": "row", "color": "#ffcc80"}])
        self.assertEqual(r.status_code, 200, r.content)

    def test_removing_a_custom_column_removes_it_from_views_and_rules(self):
        v = self.make_view()
        self.save(v, rules=[{"field": "c_isolation", "op": "eq", "value": "Contact", "target": "row", "color": "#ffcc80"}])
        self.api().patch(SETTINGS, {"custom_columns": [c for c in self.CUSTOM if c["key"] != "c_isolation"]}, format="json")
        v = self.api().get(VIEWS).json()["views"][0]
        self.assertNotIn("c_isolation", [c["key"] for c in v["columns"]])
        self.assertEqual(v["rules"], [])


class BoardViewsTests(BuilderBase):
    def test_board_lists_the_built_in_views_then_saved_ones(self):
        self.make_view("Nurse view")
        views = self.board()["views"]
        self.assertEqual([v["key"] for v in views][:3], ["all", "waiting", "mine"])
        self.assertEqual([v["label"] for v in views][3:], ["Nurse view"])
        self.assertEqual([v["builtin"] for v in views], [True, True, True, False])
        self.assertEqual([v["filter"] for v in views][:3], ["all", "waiting", "mine"])

    def test_default_view_comes_from_the_person_then_the_clinic_then_all(self):
        v = self.make_view("Nurse view")
        self.assertEqual(self.board()["default_view"], "all")
        self.api().patch(ONE.format(v["id"]), {"is_default": True}, format="json")
        self.assertEqual(self.board()["default_view"], f"v{v['id']}")
        r = self.as_(self.nurse).patch(PREF, {"view": "waiting"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.board()["default_view"], "waiting")
        # someone else is not affected
        self.assertEqual(self.board(self.doctor)["default_view"], f"v{v['id']}")

    def test_the_remembered_view_is_forgotten_when_that_view_is_deleted(self):
        v = self.make_view("Nurse view")
        self.as_(self.nurse).patch(PREF, {"view": f"v{v['id']}"}, format="json")
        self.assertEqual(self.board()["default_view"], f"v{v['id']}")
        self.api().delete(ONE.format(v["id"]))
        self.assertEqual(self.board()["default_view"], "all")

    def test_preference_only_accepts_real_views_of_this_clinic(self):
        other = make_user("adm2", "admin", self.other_org)
        v = self.api(other).post(VIEWS, {"name": "Theirs"}, format="json").json()
        for key in ("nope", "v999999", f"v{v['id']}", ""):
            self.assertEqual(self.as_(self.nurse).patch(PREF, {"view": key}, format="json").status_code, 404, key)
        self.assertEqual(self.as_(self.patient_user).patch(PREF, {"view": "all"}, format="json").status_code, 403)

    def test_a_view_with_nothing_saved_still_works_without_settings(self):
        data = self.board()
        self.assertEqual([s["code"] for s in data["statuses"]], ["WTBS", "TIP", "DISPO", "ADM", "DC"])
        self.assertEqual(data["config"]["vitals_overdue_minutes"], 60)
        self.assertEqual(len(data["staff"]["nurses"]), 2)
