import copy
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .immunization_schedule_loader import ScheduleFormatError, load_schedule, validate_document
from .models import ImmunizationItem, ImmunizationRule, ImmunizationSchedule, VaccineProduct

SCHEDULE_DIR = Path(__file__).parent / "immunization_schedules"


def small_doc():
    return {
        "schedule": {"name": "Test schedule", "population": "adult", "source": "Test source", "edition": "2025"},
        "items": [{"code": "flu", "name": "Influenza", "cvx": ["140"]}],
        "rules": [{"item": "flu", "min_age_months": 228, "dose_count": 1, "recurrence_months": 12}],
    }


class ValidateDocumentTests(TestCase):
    def test_valid_document_is_cleaned(self):
        clean = validate_document(small_doc())
        self.assertEqual(clean["rules"][0]["near_due_days"], 60)
        self.assertEqual(clean["items"][0]["kind"], "vaccine")

    def test_source_and_edition_are_required(self):
        doc = small_doc()
        doc["schedule"]["edition"] = ""
        with self.assertRaisesRegex(ScheduleFormatError, "source and schedule.edition"):
            validate_document(doc)

    def test_unknown_fields_are_rejected(self):
        doc = small_doc()
        doc["rules"][0]["min_age"] = 3
        with self.assertRaisesRegex(ScheduleFormatError, r"rules\[0\].*min_age"):
            validate_document(doc)

    def test_rule_must_name_a_listed_item(self):
        doc = small_doc()
        doc["rules"][0]["item"] = "nope"
        with self.assertRaisesRegex(ScheduleFormatError, "not in the items list"):
            validate_document(doc)

    def test_age_range_and_dose_lists_are_checked(self):
        doc = small_doc()
        doc["rules"][0]["max_age_months"] = 10
        with self.assertRaisesRegex(ScheduleFormatError, "below min_age_months"):
            validate_document(doc)
        doc = small_doc()
        doc["rules"][0]["dose_min_intervals_days"] = [0, 28]
        with self.assertRaisesRegex(ScheduleFormatError, "longer than dose_count"):
            validate_document(doc)

    def test_vaccine_item_needs_a_cvx_code(self):
        doc = small_doc()
        doc["items"][0]["cvx"] = []
        with self.assertRaisesRegex(ScheduleFormatError, "CVX"):
            validate_document(doc)

    def test_triggers_only_on_risk_schedules(self):
        doc = small_doc()
        doc["schedule"]["triggers"] = [{"code_prefix": "E11"}]
        with self.assertRaisesRegex(ScheduleFormatError, "risk schedule"):
            validate_document(doc)

    def test_negative_numbers_and_booleans_are_rejected(self):
        doc = small_doc()
        doc["rules"][0]["min_age_months"] = -1
        with self.assertRaises(ScheduleFormatError):
            validate_document(doc)
        doc["rules"][0]["min_age_months"] = True
        with self.assertRaises(ScheduleFormatError):
            validate_document(doc)


class LoadScheduleTests(TestCase):
    def setUp(self):
        VaccineProduct.objects.create(cvx_code="140", short_name="Influenza, split virus, trivalent, PF")
        self.user = get_user_model().objects.create_user(username="reviewer", password="x")

    def test_loads_as_draft_and_links_products(self):
        result = load_schedule(small_doc(), user=self.user)
        schedule = result["schedule"]
        self.assertEqual(schedule.status, "draft")
        self.assertIsNone(schedule.approved_by)
        item = ImmunizationItem.objects.get(code="flu", organization__isnull=True)
        self.assertEqual([p.cvx_code for p in item.products.all()], ["140"])
        self.assertEqual(schedule.rules.count(), 1)

    def test_missing_cvx_stops_the_load_and_saves_nothing(self):
        doc = small_doc()
        doc["items"][0]["cvx"] = ["140", "999"]
        with self.assertRaisesRegex(ScheduleFormatError, "999"):
            load_schedule(doc)
        self.assertFalse(ImmunizationSchedule.objects.exists())

    def test_empty_catalog_hint(self):
        VaccineProduct.objects.all().delete()
        with self.assertRaisesRegex(ScheduleFormatError, "import_cvx"):
            load_schedule(small_doc())

    def test_reload_replaces_rules_bumps_version_and_clears_approval(self):
        first = load_schedule(small_doc(), user=self.user, approve_as=self.user)["schedule"]
        self.assertEqual(first.status, "approved")
        self.assertEqual(first.approved_by, self.user)
        doc = small_doc()
        doc["rules"][0]["recurrence_months"] = 6
        again = load_schedule(doc, user=self.user)
        schedule = again["schedule"]
        self.assertFalse(again["created"])
        self.assertEqual(schedule.pk, first.pk)
        self.assertEqual(schedule.version, 2)
        self.assertEqual(schedule.status, "draft")
        self.assertIsNone(schedule.approved_by)
        self.assertEqual(ImmunizationRule.objects.filter(schedule=schedule).count(), 1)
        self.assertEqual(schedule.rules.get().recurrence_months, 6)

    def test_risk_schedule_triggers_load(self):
        doc = small_doc()
        doc["schedule"].update({"is_risk_group": True, "name": "Risk", "triggers": [{"code_prefix": "E11"}]})
        schedule = load_schedule(doc)["schedule"]
        self.assertEqual(list(schedule.triggers.values_list("code_prefix", flat=True)), ["E11"])


class ShippedScheduleFileTests(TestCase):
    """Every schedule file shipped in immunization_schedules/ must validate and load."""

    def test_each_shipped_file_loads(self):
        files = sorted(SCHEDULE_DIR.glob("*.json"))
        self.assertTrue(files)
        for path in files:
            with self.subTest(path.name):
                doc = json.loads(path.read_text(encoding="utf-8"))
                for item in doc["items"]:
                    for code in item["cvx"]:
                        VaccineProduct.objects.get_or_create(cvx_code=code, defaults={"short_name": f"CVX {code}"})
                result = load_schedule(copy.deepcopy(doc))
                self.assertEqual(result["schedule"].status, "draft")
                self.assertTrue(result["schedule"].source)
                self.assertTrue(result["schedule"].edition)
                self.assertEqual(result["rules"], len(doc["rules"]))

    def test_adult_file_spot_checks(self):
        doc = json.loads((SCHEDULE_DIR / "cdc_adult_2025.json").read_text(encoding="utf-8"))
        rules = [r for r in doc["rules"] if r["item"] == "zoster_rzv"]
        self.assertEqual(rules[0]["min_age_months"], 600)
        self.assertEqual(rules[0]["dose_count"], 2)
        td = next(r for r in doc["rules"] if r["item"] == "td_tdap")
        self.assertEqual(td["recurrence_months"], 120)


class CommandTests(TestCase):
    def test_dry_run_checks_without_saving(self):
        call_command("load_immunization_schedule", str(SCHEDULE_DIR / "cdc_adult_2025.json"), "--dry-run")
        self.assertFalse(ImmunizationSchedule.objects.exists())

    def test_unreadable_file_is_a_clear_error(self):
        with self.assertRaises(CommandError):
            call_command("load_immunization_schedule", "no_such_file.json")

    def test_unknown_approver_is_a_clear_error(self):
        with self.assertRaisesRegex(CommandError, "no user named"):
            call_command("load_immunization_schedule", str(SCHEDULE_DIR / "cdc_adult_2025.json"), "--approve-as", "ghost")


class ShippedSchedulesInEngineTests(TestCase):
    """The shipped files, run through the engine, give sensible answers for a few typical patients."""

    def rules(self, filename):
        import datetime  # noqa: F401  (kept local: only this class needs the engine)
        from .immunization_engine import RuleSpec

        doc = json.loads((SCHEDULE_DIR / filename).read_text(encoding="utf-8"))
        names = {i["code"]: i["name"] for i in doc["items"]}
        out = []
        for rule in doc["rules"]:
            rule = dict(rule)
            code = rule.pop("item")
            rule["dose_min_ages_months"] = tuple(rule.get("dose_min_ages_months", ()))
            rule["dose_min_intervals_days"] = tuple(rule.get("dose_min_intervals_days", ()))
            out.append(RuleSpec(item_code=code, item_name=names[code], **rule))
        return out

    def status(self, recs):
        return {r.item_code: r.status for r in recs}

    def test_four_month_old_with_some_doses(self):
        import datetime as dt
        from .immunization_engine import RecordSpec, recommend

        recs = recommend(
            dt.date(2026, 6, 12), "male", dt.date(2026, 10, 19), self.rules("aap_child_2026.json"),
            [RecordSpec("hepb", "done", 1, dt.date(2026, 6, 12)), RecordSpec("hepb", "done", 2, dt.date(2026, 7, 20)),
             RecordSpec("dtap", "done", 1, dt.date(2026, 8, 20))],
        )
        s = self.status(recs)
        self.assertEqual(s["hepb"], "near_due")
        self.assertEqual(s["dtap"], "due")
        self.assertEqual(s["rotavirus"], "due")
        self.assertEqual(s["rsv_mab"], "review")
        self.assertEqual(s["mmr"], "future")

    def test_adult_rules_use_review_where_age_cannot_decide(self):
        import datetime as dt
        from .immunization_engine import RecordSpec, recommend

        recs = recommend(
            dt.date(1971, 5, 3), "female", dt.date(2026, 10, 19), self.rules("cdc_adult_2025.json"),
            [RecordSpec("td_tdap", "done", 1, dt.date(2020, 1, 1))],
        )
        s = self.status(recs)
        self.assertEqual(s["td_tdap"], "done")
        self.assertEqual(s["zoster_rzv"], "due")
        for code in ("mmr", "varicella", "pneumococcal_conjugate", "hepb", "covid19"):
            self.assertEqual(s[code], "review", code)
        self.assertEqual(s["hpv"], "aged_out")


class ShippedRiskSchedulesTests(TestCase):
    def test_every_risk_file_has_triggers_and_loads_as_a_risk_group(self):
        files = sorted(SCHEDULE_DIR.glob("risk_*.json"))
        self.assertGreaterEqual(len(files), 8)
        for path in files:
            with self.subTest(path.name):
                doc = json.loads(path.read_text(encoding="utf-8"))
                self.assertTrue(doc["schedule"]["is_risk_group"])
                self.assertTrue(doc["schedule"]["triggers"])
                for item in doc["items"]:
                    for code in item["cvx"]:
                        VaccineProduct.objects.get_or_create(cvx_code=code, defaults={"short_name": f"CVX {code}"})
                schedule = load_schedule(doc)["schedule"]
                self.assertTrue(schedule.is_risk_group)
                self.assertEqual(schedule.triggers.count(), len(doc["schedule"]["triggers"]))

    def test_sickle_cell_trait_is_not_a_trigger(self):
        doc = json.loads((SCHEDULE_DIR / "risk_asplenia_adult.json").read_text(encoding="utf-8"))
        prefixes = [t["code_prefix"] for t in doc["schedule"]["triggers"]]
        self.assertNotIn("D57", prefixes)
        self.assertFalse(any("D57.3".startswith(p) for p in prefixes))

    def test_shared_items_have_one_definition_across_files(self):
        seen = {}
        for path in sorted(SCHEDULE_DIR.glob("*.json")):
            for item in json.loads(path.read_text(encoding="utf-8"))["items"]:
                key = (item["name"], item["display_name"], item["sort_order"], tuple(item["cvx"]))
                self.assertEqual(seen.setdefault(item["code"], key), key, f"{item['code']} differs in {path.name}")
