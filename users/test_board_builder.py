from appointments.models import Bed, Room, Unit
from appointments.test_locations import Base, make_user
from users.board_config import default_config
from users.models import Registration, StatusBoardVersion

SCOPE = "/api/users/status-boards/"
ONE = "/api/users/status-boards/{}/"
PUBLISH = "/api/users/status-boards/{}/publish/"
RESTORE = "/api/users/status-boards/{}/restore/"
BOARD = "/api/users/ed-board/"
EDIT = "/api/users/admissions/{}/board/"


class BuilderBase(Base):
    def setUp(self):
        super().setUp()
        self.room = Room.objects.create(unit=self.ed, name="ED1")
        self.bed = Bed.objects.create(room=self.room, name="A")
        self.nurse2 = make_user("nurse2", "nurse", self.org, first_name="Sam", last_name="Bell")

    def draft(self, unit=None, **extra):
        body = {"unit": unit.pk if unit else None, **extra}
        r = self.as_(self.admin).post(SCOPE, body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def save(self, vid, config, **extra):
        return self.as_(self.admin).patch(ONE.format(vid), {"config": config, **extra}, format="json")

    def publish(self, vid, **extra):
        r = self.as_(self.admin).post(PUBLISH.format(vid), extra, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def er_visit(self):
        body = {"patient": self.patient.pk, "organization": self.org.pk, "admission_type": "emergency", "unit": self.ed.pk, "room": self.room.pk, "bed": self.bed.pk}
        r = self.as_(self.registrar).post("/api/users/registrations/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def board(self, **params):
        return self.as_(self.nurse).get(BOARD, params).json()


class AccessTests(BuilderBase):
    def test_only_admins_can_use_the_builder(self):
        for user in (self.nurse, self.doctor, self.registrar):
            self.assertEqual(self.as_(user).get(SCOPE).status_code, 403)
            self.assertEqual(self.as_(user).post(SCOPE, {}, format="json").status_code, 403)

    def test_a_department_in_another_clinic_is_refused(self):
        r = self.as_(self.admin).get(SCOPE, {"unit": 999999})
        self.assertEqual(r.status_code, 404)

    def test_scope_lists_departments_people_and_the_default(self):
        data = self.as_(self.admin).get(SCOPE).json()
        self.assertEqual([d["name"] for d in data["departments"]], ["ED"])
        self.assertIsNone(data["draft"])
        self.assertIsNone(data["published"])
        self.assertEqual(len(data["default_config"]["columns"]), len(default_config()["columns"]))
        self.assertIn("Bell, Sam", [p["name"] for p in data["people"]["nurses"]])
        self.assertIn("Lee, Jeffrey", [p["name"] for p in data["people"]["doctors"]])


class DraftAndPublishTests(BuilderBase):
    def test_first_draft_starts_from_the_built_in_layout(self):
        d = self.draft()
        self.assertEqual((d["number"], d["status"]), (1, "draft"))
        self.assertEqual([c["key"] for c in d["config"]["columns"]][:3], ["loc", "los", "patient"])
        self.assertEqual(d["author"]["id"], self.admin.pk)

    def test_only_one_draft_per_scope(self):
        self.draft()
        r = self.as_(self.admin).post(SCOPE, {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.draft(unit=self.ed)  # a department has its own scope

    def test_publish_makes_it_live_and_archives_the_previous_one(self):
        d1 = self.draft()
        self.publish(d1["id"], note="First layout")
        d2 = self.draft()
        self.assertEqual(d2["number"], 2)
        self.publish(d2["id"])
        statuses = {v["number"]: v["status"] for v in self.as_(self.admin).get(SCOPE).json()["versions"]}
        self.assertEqual(statuses, {1: "archived", 2: "published"})
        first = StatusBoardVersion.objects.get(pk=d1["id"])
        self.assertEqual((first.note, first.published_by_id), ("First layout", self.admin.pk))

    def test_only_drafts_can_be_edited_or_discarded(self):
        d = self.draft()
        self.publish(d["id"])
        self.assertEqual(self.save(d["id"], default_config()).status_code, 400)
        self.assertEqual(self.as_(self.admin).delete(ONE.format(d["id"])).status_code, 400)
        self.assertEqual(self.as_(self.admin).post(PUBLISH.format(d["id"]), {}, format="json").status_code, 400)

    def test_discarding_a_draft_removes_it(self):
        d = self.draft()
        self.assertEqual(self.as_(self.admin).delete(ONE.format(d["id"])).status_code, 204)
        self.assertIsNone(self.as_(self.admin).get(SCOPE).json()["draft"])

    def test_versions_belong_to_one_clinic(self):
        d = self.draft()
        outsider = make_user("outsider", "admin", self.other_org)
        self.assertEqual(self.as_(outsider).get(ONE.format(d["id"])).status_code, 404)
        self.assertEqual(self.as_(outsider).post(PUBLISH.format(d["id"]), {}, format="json").status_code, 404)


class ValidationTests(BuilderBase):
    def bad(self, mutate, text):
        d = self.as_(self.admin).get(SCOPE).json()["draft"] or self.draft()
        config = default_config()
        mutate(config)
        r = self.save(d["id"], config)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn(text, r.json()["detail"])

    def test_rename_hide_reorder_resize_are_saved(self):
        d = self.draft()
        config = default_config()
        cols = config["columns"]
        cols[3]["label"] = "Years"
        cols[3]["width"] = 55
        cols[6]["visible"] = False
        cols.insert(0, cols.pop(2))  # patient first
        r = self.save(d["id"], config)
        self.assertEqual(r.status_code, 200, r.content)
        saved = r.json()["config"]["columns"]
        self.assertEqual(saved[0]["key"], "patient")
        self.assertEqual(next(c for c in saved if c["key"] == "age")["label"], "Years")
        self.assertFalse(next(c for c in saved if c["key"] == "esi")["visible"])

    def test_columns_that_cannot_be_hidden_stay_visible_and_missing_ones_return_hidden(self):
        d = self.draft()
        config = default_config()
        config["columns"] = [c for c in config["columns"] if c["key"] not in ("vitals", "actions")]
        for c in config["columns"]:
            if c["key"] == "loc":
                c["visible"] = False
        r = self.save(d["id"], config).json()["config"]["columns"]
        by_key = {c["key"]: c for c in r}
        self.assertTrue(by_key["loc"]["visible"])
        self.assertTrue(by_key["actions"]["visible"])
        self.assertFalse(by_key["vitals"]["visible"])

    def test_bad_columns_are_refused(self):
        self.bad(lambda c: c["columns"].append({"key": "bogus", "label": "X"}), "not a column")
        self.bad(lambda c: c["columns"].append({"key": "loc", "label": "Again"}), "twice")
        self.bad(lambda c: c["columns"][1].update(width=5), "between 40 and 600")
        self.bad(lambda c: c["columns"][1].update(label=""), "required")
        self.bad(lambda c: c["columns"].append({"key": "c_x", "label": "X", "kind": "weird"}), "text, dropdown or checkbox")
        self.bad(lambda c: c["columns"].append({"key": "c_x", "label": "X", "kind": "dropdown", "options": []}), "choices")

    def test_status_and_threshold_and_rule_checks(self):
        self.bad(lambda c: c.update(statuses=[]), "between 1 and")
        self.bad(lambda c: c.update(statuses=[{"value": "A B", "code": "X", "label": "x"}]), "status key")
        self.bad(lambda c: c.update(statuses=[{"value": "a", "code": "A", "label": "a"}, {"value": "a", "code": "B", "label": "b"}]), "twice")
        self.bad(lambda c: c.update(vitals_overdue_minutes=2), "between 5 and 1440")
        self.bad(lambda c: c.update(rules=[{"field": "nope", "color": "#ff0000"}]), "cannot look at")
        self.bad(lambda c: c.update(rules=[{"field": "esi", "value": "1", "color": "red"}]), "#ff0000")

    def test_roster_must_be_active_people_of_the_right_role_in_this_clinic(self):
        outsider = make_user("nurse_far", "nurse", self.other_org)
        self.bad(lambda c: c.update(roster={"nurses": [outsider.pk], "doctors": None}), "roster")
        self.bad(lambda c: c.update(roster={"nurses": [self.doctor.pk], "doctors": None}), "roster")
        d = self.as_(self.admin).get(SCOPE).json()["draft"]
        config = default_config()
        config["roster"] = {"nurses": [self.nurse.pk], "doctors": [self.doctor.pk]}
        self.assertEqual(self.save(d["id"], config).status_code, 200)


class BoardUsesPublishedLayoutTests(BuilderBase):
    def test_without_a_published_version_the_board_uses_the_defaults(self):
        data = self.board()
        self.assertIsNone(data["config"]["version"])
        self.assertEqual(data["config"]["vitals_overdue_minutes"], 60)
        self.assertEqual([s["code"] for s in data["statuses"]], ["WTBS", "TIP", "DISPO", "ADM", "DC"])
        self.assertEqual(len(data["staff"]["nurses"]), 2)

    def test_a_draft_does_not_change_the_board_until_it_is_published(self):
        d = self.draft()
        config = default_config()
        config["vitals_overdue_minutes"] = 30
        self.save(d["id"], config)
        self.assertEqual(self.board()["config"]["vitals_overdue_minutes"], 60)
        self.publish(d["id"])
        data = self.board()
        self.assertEqual((data["config"]["vitals_overdue_minutes"], data["config"]["version"]), (30, 1))

    def test_a_department_layout_beats_the_clinic_layout(self):
        clinic = self.draft()
        config = default_config()
        config["vitals_overdue_minutes"] = 45
        self.save(clinic["id"], config)
        self.publish(clinic["id"])
        self.assertEqual(self.board()["config"]["vitals_overdue_minutes"], 45)
        dept = self.draft(unit=self.ed)
        config["vitals_overdue_minutes"] = 20
        self.save(dept["id"], config)
        self.publish(dept["id"])
        self.assertEqual(self.board(unit=self.ed.pk)["config"]["vitals_overdue_minutes"], 20)

    def test_roster_limits_the_staff_dropdowns(self):
        d = self.draft()
        config = default_config()
        config["roster"] = {"nurses": [self.nurse2.pk], "doctors": None}
        self.save(d["id"], config)
        self.publish(d["id"])
        staff = self.board()["staff"]
        self.assertEqual([n["id"] for n in staff["nurses"]], [self.nurse2.pk])
        self.assertEqual([x["id"] for x in staff["doctors"]], [self.doctor.pk])

    def test_custom_statuses_are_accepted_on_the_board_and_old_ones_are_not(self):
        d = self.draft()
        config = default_config()
        config["statuses"] = [{"value": "triage", "code": "TRI", "label": "In triage"}, {"value": "tip", "code": "TIP", "label": "Treatment"}]
        self.save(d["id"], config)
        self.publish(d["id"])
        vid = self.er_visit()
        ok = self.as_(self.nurse).patch(EDIT.format(vid), {"ed_status": "triage"}, format="json")
        self.assertEqual((ok.status_code, ok.json()["ed_status"]), (200, "triage"))
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"ed_status": "wtbs"}, format="json").status_code, 400)


class CustomColumnTests(BuilderBase):
    def publish_custom(self):
        d = self.draft()
        config = default_config()
        config["columns"] += [
            {"key": "c_isolation", "label": "Isolation", "kind": "dropdown", "options": ["None", "Contact", "Airborne"]},
            {"key": "c_note", "label": "Tech note", "kind": "text"},
            {"key": "c_belongings", "label": "Belongings", "kind": "checkbox"},
        ]
        r = self.save(d["id"], config)
        self.assertEqual(r.status_code, 200, r.content)
        self.publish(d["id"])

    def test_values_are_saved_and_shown_on_the_board(self):
        self.publish_custom()
        vid = self.er_visit()
        r = self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_isolation": "Contact", "c_note": " IV started ", "c_belongings": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["custom"], {"c_isolation": "Contact", "c_note": "IV started", "c_belongings": True})
        row = [x for x in self.board()["rows"] if x["type"] == "bed"][0]
        self.assertEqual(row["visit"]["custom"]["c_isolation"], "Contact")
        # changing one value keeps the others
        r = self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_belongings": False}}, format="json")
        self.assertEqual(r.json()["custom"]["c_isolation"], "Contact")

    def test_unknown_columns_and_bad_choices_are_refused(self):
        self.publish_custom()
        vid = self.er_visit()
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_nope": "x"}}, format="json").status_code, 400)
        self.assertEqual(self.as_(self.nurse).patch(EDIT.format(vid), {"custom": {"c_isolation": "Lava"}}, format="json").status_code, 400)
        self.assertEqual(Registration.objects.get(pk=vid).board_custom, {})

    def test_rules_may_use_a_custom_column(self):
        self.publish_custom()
        d = self.draft()
        config = default_config()
        config["columns"].append({"key": "c_isolation", "label": "Isolation", "kind": "dropdown", "options": ["Contact"]})
        config["rules"] = [{"field": "c_isolation", "op": "eq", "value": "Contact", "target": "row", "color": "#ffcc80"}]
        self.assertEqual(self.save(d["id"], config).status_code, 200)


class RestoreTests(BuilderBase):
    def test_restore_copies_an_old_version_into_a_new_draft_and_keeps_history(self):
        d1 = self.draft()
        config = default_config()
        config["vitals_overdue_minutes"] = 15
        self.save(d1["id"], config)
        self.publish(d1["id"], note="Strict")
        d2 = self.draft()
        config["vitals_overdue_minutes"] = 90
        self.save(d2["id"], config)
        self.publish(d2["id"])
        self.assertEqual(self.board()["config"]["vitals_overdue_minutes"], 90)

        r = self.as_(self.admin).post(RESTORE.format(d1["id"]), {}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        restored = r.json()
        self.assertEqual((restored["number"], restored["status"], restored["config"]["vitals_overdue_minutes"]), (3, "draft", 15))
        self.assertIn("Restored from version 1", restored["note"])
        # nothing live changed yet
        self.assertEqual(self.board()["config"]["vitals_overdue_minutes"], 90)
        self.publish(restored["id"])
        self.assertEqual(self.board()["config"]["vitals_overdue_minutes"], 15)
        self.assertEqual(StatusBoardVersion.objects.filter(organization=self.org, unit=None).count(), 3)

    def test_restore_refuses_while_a_draft_is_open(self):
        d1 = self.draft()
        self.publish(d1["id"])
        self.draft()
        self.assertEqual(self.as_(self.admin).post(RESTORE.format(d1["id"]), {}, format="json").status_code, 400)

    def test_a_version_can_be_read_for_comparing(self):
        d = self.draft()
        r = self.as_(self.admin).get(ONE.format(d["id"]))
        self.assertEqual(r.status_code, 200)
        self.assertIn("columns", r.json()["config"])
