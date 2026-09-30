"""
Unit tests for staffing/hppd.py. Pure Python -- no database or Django needed:

    python -m unittest tests.unit.test_hppd -v      (from the project root)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

from staffing import hppd  # noqa: E402


def by_name(reqs):
    return {r.shift_name: r for r in reqs}


class RequiredStaffTests(unittest.TestCase):
    def test_patterns_shares_sum_to_one(self):
        hppd.validate_patterns()  # raises if not

    def test_8h_40_residents(self):
        # 40 * 3.0 = 120 h/day -> 48 / 42 / 30 h -> 6 / 5.25->6 / 3.75->4
        r = by_name(hppd.required_staff_by_shift(40, "8h"))
        self.assertEqual(r["Day"].required_hours, 48)
        self.assertEqual(r["Evening"].required_hours, 42)
        self.assertEqual(r["Night"].required_hours, 30)
        self.assertEqual(r["Day"].staff_by_hours, 6)
        self.assertEqual(r["Evening"].staff_by_hours, 6)
        self.assertEqual(r["Night"].staff_by_hours, 4)
        # ratio: ceil(40/15) = 3, lower than the hours rule here
        self.assertEqual(r["Day"].staff_by_ratio, 3)
        self.assertEqual([r[n].required_staff for n in ("Day", "Evening", "Night")], [6, 6, 4])

    def test_12h_40_residents(self):
        # 120 h/day -> 60 h per 12h shift -> 5 staff each
        r = by_name(hppd.required_staff_by_shift(40, "12h"))
        self.assertEqual(set(r), {"Day", "Night"})
        self.assertEqual(r["Day"].required_staff, 5)
        self.assertEqual(r["Night"].required_staff, 5)

    def test_daily_total_never_below_minimum(self):
        for census in range(1, 121):
            for key in ("8h", "12h"):
                reqs = hppd.required_staff_by_shift(census, key)
                supplied = sum(q.staff_by_hours * q.shift_hours for q in reqs)
                self.assertGreaterEqual(supplied + 1e-9, census * hppd.HPPD_MINIMUM)

    def test_ratio_can_be_the_stricter_rule(self):
        # 150 residents, 12h: hours rule -> 150*3*0.5/12 = 18.75 -> 19;
        # ratio -> ceil(150/15) = 10. Hours still wins.
        r = by_name(hppd.required_staff_by_shift(150, "12h"))
        self.assertEqual(r["Day"].required_staff, 19)
        # Force ratio to dominate with a low hppd to prove max() is used.
        r2 = by_name(hppd.required_staff_by_shift(150, "12h", hppd=1.0))
        self.assertEqual(r2["Day"].staff_by_hours, 7)   # 150*1*.5/12 = 6.25
        self.assertEqual(r2["Day"].staff_by_ratio, 10)
        self.assertEqual(r2["Day"].required_staff, 10)

    def test_rn_minimum_and_small_census(self):
        r = by_name(hppd.required_staff_by_shift(1, "8h"))
        for shift in r.values():
            self.assertGreaterEqual(shift.required_staff, 1)
            self.assertEqual(shift.required_rn, 1)

    def test_zero_census_requires_nothing(self):
        for shift in hppd.required_staff_by_shift(0, "8h"):
            self.assertEqual(shift.required_staff, 0)
            self.assertEqual(shift.required_rn, 0)
            self.assertEqual(shift.required_hours, 0)

    def test_bad_input(self):
        with self.assertRaises(ValueError):
            hppd.required_staff_by_shift(-1, "8h")
        with self.assertRaises(ValueError):
            hppd.required_staff_by_shift(10, "16h")

    def test_float_noise_does_not_bump_count(self):
        # 40 * 3.0 * 0.40 = 48.00000000000001 in floating point; must still be 6
        r = by_name(hppd.required_staff_by_shift(40, "8h"))
        self.assertEqual(r["Day"].staff_by_hours, 6)


class EvaluateShiftTests(unittest.TestCase):
    def setUp(self):
        self.day = by_name(hppd.required_staff_by_shift(40, "8h"))["Day"]  # 48 h, 6 staff

    def test_compliant(self):
        staff = [("rn", 8), ("lpn", 8)] + [("cna", 8)] * 4   # 48 h, 6 heads, 1 RN
        c = hppd.evaluate_shift(self.day, staff)
        self.assertTrue(c.compliant)
        self.assertEqual((c.hours_scheduled, c.heads_scheduled, c.rn_scheduled), (48, 6, 1))

    def test_short_on_hours(self):
        staff = [("rn", 8), ("lpn", 8)] + [("cna", 8)] * 3   # 40 h
        c = hppd.evaluate_shift(self.day, staff)
        self.assertFalse(c.hours_ok)
        self.assertEqual(c.hours_short, 8)
        self.assertTrue(c.ratio_ok)
        self.assertFalse(c.compliant)

    def test_no_rn_fails_even_if_hours_met(self):
        staff = [("lpn", 8)] * 2 + [("cna", 8)] * 4          # 48 h, no RN
        c = hppd.evaluate_shift(self.day, staff)
        self.assertTrue(c.hours_ok)
        self.assertFalse(c.rn_ok)
        self.assertFalse(c.compliant)

    def test_other_roles_do_not_count(self):
        staff = [("rn", 8), ("other", 8), ("other", 8)]
        c = hppd.evaluate_shift(self.day, staff)
        self.assertEqual(c.heads_scheduled, 1)
        self.assertEqual(c.hours_scheduled, 8)

    def test_12h_person_in_8h_block_counts_by_hours(self):
        # Hours are what is compared, so a longer shift supplies more hours.
        staff = [("rn", 12), ("cna", 12), ("cna", 12), ("cna", 12)]   # 48 h, 4 heads
        c = hppd.evaluate_shift(self.day, staff)
        self.assertTrue(c.hours_ok)
        self.assertTrue(c.ratio_ok)  # ratio needs only 3 heads here


if __name__ == "__main__":
    unittest.main()
