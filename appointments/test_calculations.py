"""
Tests for calculated items (appointments/calculations.py).

calc_vectors.json holds the cases both engines must agree on; the same file
(copied to frontend/src/utils/__tests__/calcVectors.json) is run against the
JavaScript twin by calculations.test.js.
"""

import json
from pathlib import Path

from django.test import SimpleTestCase

from . import calculations as calc

HERE = Path(__file__).resolve().parent
VECTORS = json.loads((HERE / "calc_vectors.json").read_text(encoding="utf-8"))

PHQ_KEYS = [f"phq9_q{i}" for i in range(1, 10)]
EARLIER = {k: {"field_type": "dropdown", "numeric_options": True, "label": k} for k in PHQ_KEYS}


class SharedVectorTests(SimpleTestCase):
    def test_every_vector(self):
        for vec in VECTORS:
            with self.subTest(vec["name"]):
                got = calc.compute_calc(vec["calc"], dict(vec["values"]))
                self.assertEqual(got["value"], vec["expect"]["value"])
                self.assertEqual(got["interpretation"], vec["expect"]["interpretation"])
                self.assertEqual(got["alerts"], vec["expect"]["alerts"])

    def test_js_copy_of_vectors_is_identical(self):
        js_copy = HERE.parent / "frontend" / "src" / "utils" / "__tests__" / "calcVectors.json"
        if js_copy.exists():  # the frontend folder isn't present in every deploy
            self.assertEqual(json.loads(js_copy.read_text(encoding="utf-8")), VECTORS)


class ApplyCalculationsTests(SimpleTestCase):
    ITEMS = [{"key": k, "field_type": "dropdown"} for k in PHQ_KEYS] + [
        {
            "key": "phq9_total",
            "field_type": "calculated",
            "calc": {
                "operation": "sum",
                "sources": PHQ_KEYS,
                "decimals": 0,
                "bands": [{"min": 0, "max": 4, "label": "None-minimal"}, {"min": 5, "max": 27, "label": "Elevated"}],
            },
        },
        {
            "key": "double_total",
            "field_type": "calculated",
            "calc": {"operation": "formula", "formula": "phq9_total * 2", "sources": ["phq9_total"], "decimals": 0},
        },
    ]

    def test_stores_value_and_interpretation_and_chains(self):
        values = {k: "1" for k in PHQ_KEYS}
        calc.apply_calculations(self.ITEMS, values)
        self.assertEqual(values["phq9_total"], "9")
        self.assertEqual(values["phq9_total" + calc.INTERPRETATION_SUFFIX], "Elevated")
        self.assertEqual(values["double_total"], "18")

    def test_overwrites_a_client_supplied_value(self):
        values = {k: "1" for k in PHQ_KEYS}
        values["phq9_total"] = "99"
        calc.apply_calculations(self.ITEMS, values)
        self.assertEqual(values["phq9_total"], "9")

    def test_removes_result_when_an_answer_is_cleared(self):
        values = {k: "1" for k in PHQ_KEYS}
        calc.apply_calculations(self.ITEMS, values)
        values["phq9_q3"] = ""
        calc.apply_calculations(self.ITEMS, values)
        self.assertNotIn("phq9_total", values)
        self.assertNotIn("phq9_total" + calc.INTERPRETATION_SUFFIX, values)
        self.assertNotIn("double_total", values)


class ValidateCalcTests(SimpleTestCase):
    def good(self, **overrides):
        base = {
            "operation": "sum",
            "sources": ["phq9_q1", "phq9_q2"],
            "decimals": 0,
            "bands": [{"min": 0, "max": 4, "label": "Low"}, {"min": 5, "max": None, "label": "High"}],
            "alerts": [{"source": "phq9_q2", "min": 1, "message": "Look closer."}],
        }
        base.update(overrides)
        return base

    def test_valid_config_is_cleaned(self):
        cleaned, errors = calc.validate_calc(self.good(), "total", EARLIER)
        self.assertEqual(errors, [])
        self.assertTrue(cleaned["require_all"])
        self.assertEqual(cleaned["bands"][1], {"min": 5, "max": None, "label": "High"})
        self.assertNotIn("formula", cleaned)

    def test_string_numbers_are_accepted_and_tidied(self):
        cleaned, errors = calc.validate_calc(
            self.good(bands=[{"min": "0", "max": "4.0", "label": "Low"}]), "total", EARLIER
        )
        self.assertEqual(errors, [])
        self.assertEqual(cleaned["bands"][0], {"min": 0, "max": 4, "label": "Low"})

    def test_rejects_unknown_operation(self):
        _, errors = calc.validate_calc({"operation": "median", "sources": ["phq9_q1"]}, "t", EARLIER)
        self.assertTrue(errors)

    def test_rejects_source_that_is_not_earlier(self):
        _, errors = calc.validate_calc(self.good(sources=["phq9_q1", "later_item"]), "t", EARLIER)
        self.assertIn("earlier", errors[0])

    def test_rejects_itself_as_source(self):
        earlier = dict(EARLIER)
        _, errors = calc.validate_calc(self.good(sources=["t"]), "t", earlier)
        self.assertTrue(errors)

    def test_rejects_text_source(self):
        earlier = {"note": {"field_type": "text", "numeric_options": None, "label": "note"}}
        _, errors = calc.validate_calc({"operation": "sum", "sources": ["note"]}, "t", earlier)
        self.assertIn("can't be used", errors[0])

    def test_rejects_dropdown_with_non_numeric_options(self):
        earlier = {"q": {"field_type": "dropdown", "numeric_options": False, "label": "q"}}
        _, errors = calc.validate_calc({"operation": "sum", "sources": ["q"]}, "t", earlier)
        self.assertIn("aren't all numbers", errors[0])

    def test_rejects_duplicate_and_empty_sources(self):
        _, errors = calc.validate_calc(self.good(sources=["phq9_q1", "phq9_q1"]), "t", EARLIER)
        self.assertTrue(errors)
        _, errors = calc.validate_calc(self.good(sources=[]), "t", EARLIER)
        self.assertTrue(errors)

    def test_rejects_bad_decimals(self):
        for bad in (-1, 7, 1.5, "2", True):
            _, errors = calc.validate_calc(self.good(decimals=bad), "t", EARLIER)
            self.assertTrue(errors, bad)

    def test_rejects_overlapping_bands(self):
        bands = [{"min": 0, "max": 5, "label": "A"}, {"min": 5, "max": 9, "label": "B"}]
        _, errors = calc.validate_calc(self.good(bands=bands), "t", EARLIER)
        self.assertIn("overlap", errors[0])

    def test_rejects_open_band_overlapping_a_later_band(self):
        bands = [{"min": 0, "max": None, "label": "A"}, {"min": 5, "max": 9, "label": "B"}]
        _, errors = calc.validate_calc(self.good(bands=bands), "t", EARLIER)
        self.assertIn("overlap", errors[0])

    def test_rejects_band_problems(self):
        for band in (
            {"min": 5, "max": 1, "label": "Backwards"},
            {"min": None, "max": None, "label": "Everything"},
            {"min": 0, "max": 1, "label": ""},
            {"min": "x", "max": 1, "label": "NaN"},
        ):
            _, errors = calc.validate_calc(self.good(bands=[band]), "t", EARLIER)
            self.assertTrue(errors, band)

    def test_alert_needs_known_source_message_and_number(self):
        for alert in (
            {"source": "nope", "min": 1, "message": "x"},
            {"source": "phq9_q2", "min": 1, "message": ""},
            {"source": "phq9_q2", "min": "", "message": "x"},
        ):
            _, errors = calc.validate_calc(self.good(alerts=[alert]), "t", EARLIER)
            self.assertTrue(errors, alert)

    def test_formula_sources_come_from_the_formula(self):
        earlier = {
            "weight": {"field_type": "numeric", "numeric_options": None, "label": "w"},
            "height": {"field_type": "numeric", "numeric_options": None, "label": "h"},
        }
        cleaned, errors = calc.validate_calc(
            {"operation": "formula", "formula": "weight / (height * height) * 703", "sources": ["ignored"]},
            "bmi",
            earlier,
        )
        self.assertEqual(errors, [])
        self.assertEqual(cleaned["sources"], ["weight", "height"])

    def test_formula_errors(self):
        earlier = {"a": {"field_type": "numeric", "numeric_options": None, "label": "a"}}
        for text in ("", "a +", "a $ 2", "(a", "a b", "2", "a )", "nope * 2", "a ** 2"):
            _, errors = calc.validate_calc({"operation": "formula", "formula": text}, "t", earlier)
            self.assertTrue(errors, text)

    def test_signature_is_stable_and_empty_for_nothing(self):
        self.assertEqual(calc.calc_signature({}), "")
        a = calc.calc_signature({"b": 1, "a": 2})
        b = calc.calc_signature({"a": 2, "b": 1})
        self.assertEqual(a, b)
