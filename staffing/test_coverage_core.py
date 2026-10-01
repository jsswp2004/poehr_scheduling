"""
Tests for staffing/coverage_core.py (pure; no database).

    python manage.py test staffing.test_coverage_core
    # or, from the repo root with no Django needed:
    python -m unittest staffing.test_coverage_core
"""
import unittest

from . import hppd
from .coverage_core import (
    AT_RISK, MET, NOT_MET, Need, Person, classify, evaluate, worst,
)


def P(i, role="cna", hours=8.0, pending=False):
    return Person(i, f"S{i}", role, hours, pending)


FIXED4 = Need(mode="fixed", required_staff=4)


class FixedTests(unittest.TestCase):
    def test_short_is_not_met(self):
        c = classify(FIXED4, [P(1), P(2), P(3)])
        self.assertEqual(c.status, NOT_MET)
        self.assertIn("Short 1 staff", c.reasons[0])

    def test_exactly_minimum_is_at_risk_with_buffer_1(self):
        c = classify(FIXED4, [P(i) for i in range(4)], buffer=1)
        self.assertEqual(c.status, AT_RISK)

    def test_spare_staff_is_met(self):
        self.assertEqual(classify(FIXED4, [P(i) for i in range(5)], buffer=1).status, MET)

    def test_buffer_0_exactly_minimum_is_met(self):
        self.assertEqual(classify(FIXED4, [P(i) for i in range(4)], buffer=0).status, MET)

    def test_buffer_2_needs_two_spare(self):
        self.assertEqual(classify(FIXED4, [P(i) for i in range(5)], buffer=2).status, AT_RISK)
        self.assertEqual(classify(FIXED4, [P(i) for i in range(6)], buffer=2).status, MET)

    def test_pending_request_makes_at_risk_even_with_spare(self):
        people = [P(i) for i in range(5)]
        people[0] = P(0, pending=True)
        c = classify(FIXED4, people, buffer=1)
        self.assertEqual(c.status, AT_RISK)
        self.assertIn("Pending", c.reasons[0])

    def test_pending_request_that_would_break_coverage_says_so(self):
        people = [P(i) for i in range(4)]
        people[0] = P(0, pending=True)
        c = classify(FIXED4, people, buffer=0)
        self.assertEqual(c.status, AT_RISK)
        self.assertIn("is approved", c.reasons[0])

    def test_open_callout_is_at_risk_even_if_still_covered(self):
        c = classify(FIXED4, [P(i) for i in range(6)], buffer=1, open_callouts=1)
        self.assertEqual(c.status, AT_RISK)

    def test_duplicate_rows_count_once(self):
        self.assertEqual(evaluate(FIXED4, [P(1), P(1), P(2), P(3)]).heads, 3)


class HppdTests(unittest.TestCase):
    def need(self, census=30, shift="day"):
        r = [s for s in hppd.required_staff_by_shift(census, "8h") if s.shift_type == shift][0]
        return Need("hppd", r.required_staff, r.required_hours, r.staff_by_ratio,
                    r.required_rn, r.shift_hours)

    def test_only_one_rn_is_at_risk(self):
        # census 30 day shift: 36 hrs needed -> 5 heads, ratio 2, 1 RN
        need = self.need()
        people = [P(1, "rn")] + [P(i, "cna") for i in range(2, 6)]
        self.assertTrue(evaluate(need, people).met)
        c = classify(need, people, buffer=1)
        self.assertEqual(c.status, AT_RISK)
        self.assertIn("S1", c.critical_names)

    def test_no_rn_is_not_met(self):
        need = self.need()
        people = [P(i, "cna") for i in range(1, 8)]
        c = classify(need, people)
        self.assertEqual(c.status, NOT_MET)
        self.assertTrue(any("RN" in r for r in c.reasons))

    def test_other_role_does_not_count(self):
        need = self.need()
        people = [P(1, "rn")] + [P(i, "cna") for i in range(2, 5)] + [P(9, "other")]
        self.assertFalse(evaluate(need, people).met)  # 4 counted heads < 5 needed

    def test_two_rns_and_spare_hours_is_met(self):
        need = self.need()
        people = [P(1, "rn"), P(2, "rn")] + [P(i, "cna") for i in range(3, 8)]
        self.assertEqual(classify(need, people, buffer=1).status, MET)

    def test_zero_census_needs_nothing(self):
        need = self.need(census=0)
        self.assertEqual(classify(need, [], buffer=1).status, MET)


class RollupTests(unittest.TestCase):
    def test_worst(self):
        self.assertEqual(worst([MET, AT_RISK, MET]), AT_RISK)
        self.assertEqual(worst([MET, NOT_MET, AT_RISK]), NOT_MET)
        self.assertIsNone(worst([]))


if __name__ == "__main__":
    unittest.main()
