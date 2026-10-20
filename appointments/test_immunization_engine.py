"""
Vaccine Manager recommendation engine: pure logic, no database. Every rule used here is a made-up test rule,
not a clinical schedule.
"""

import datetime
from unittest import TestCase

from . import immunization_engine as E
from .immunization_engine import RecordSpec, RuleSpec, recommend

D = datetime.date
TODAY = D(2026, 10, 19)


def one(rules, records=(), dob=D(1971, 3, 14), sex="female", as_of=TODAY):
    out = recommend(dob, sex, as_of, list(rules), list(records))
    return out[0] if out else None


def rule(code="x", **kw):
    return RuleSpec(item_code=code, item_name=code.upper(), **kw)


class DateMathTests(TestCase):
    def test_add_months_clamps_to_month_end(self):
        self.assertEqual(E.add_months(D(2026, 1, 31), 1), D(2026, 2, 28))
        self.assertEqual(E.add_months(D(2024, 2, 29), 12), D(2025, 2, 28))
        self.assertEqual(E.add_months(D(2026, 11, 15), 3), D(2027, 2, 15))

    def test_age_in_months_counts_whole_months(self):
        self.assertEqual(E.age_in_months(D(2026, 6, 12), D(2026, 10, 11)), 3)
        self.assertEqual(E.age_in_months(D(2026, 6, 12), D(2026, 10, 12)), 4)
        self.assertEqual(E.age_in_months(D(1971, 3, 14), D(2026, 10, 19)), 55 * 12 + 7)


class SingleDoseTests(TestCase):
    def test_never_done_adult_is_due(self):
        rec = one([rule("hepc", min_age_months=216)])
        self.assertEqual(rec.status, E.DUE)

    def test_never_done_becomes_overdue_only_when_the_rule_says_so(self):
        self.assertEqual(one([rule("fit", min_age_months=540)]).status, E.DUE)
        self.assertEqual(one([rule("fit", min_age_months=540, overdue_after_days=365)]).status, E.OVERDUE)

    def test_once_only_item_is_done_after_one_dose(self):
        rec = one([rule("hepc", min_age_months=216)], [RecordSpec("hepc", given_on=D(2020, 1, 1))])
        self.assertEqual(rec.status, E.DONE)
        self.assertEqual(rec.last_done, D(2020, 1, 1))

    def test_not_yet_eligible_is_future_with_the_start_date(self):
        rec = one([rule("dxa", min_age_months=780)])
        self.assertEqual(rec.status, E.FUTURE)
        self.assertEqual(rec.next_due, D(2036, 3, 14))

    def test_past_the_age_range_is_aged_out(self):
        rec = one([rule("mam", min_age_months=480, max_age_months=888)], dob=D(1940, 1, 1))
        self.assertEqual(rec.status, E.AGED_OUT)

    def test_future_dated_records_are_ignored(self):
        rec = one([rule("hepc", min_age_months=216)], [RecordSpec("hepc", given_on=D(2027, 1, 1))])
        self.assertEqual(rec.status, E.DUE)


class SeriesTests(TestCase):
    ZOSTER = dict(min_age_months=600, dose_count=2, dose_min_intervals_days=(0, 56), near_due_days=30)

    def test_first_dose_is_due(self):
        rec = one([rule("zos", **self.ZOSTER)])
        self.assertEqual((rec.status, rec.dose_number), (E.DUE, 1))
        self.assertEqual(rec.doses, ["due", "later"])
        self.assertIn("Dose 1 of 2", rec.why)

    def test_second_dose_waits_for_the_minimum_interval(self):
        rec = one([rule("zos", **self.ZOSTER)], [RecordSpec("zos", given_on=TODAY - datetime.timedelta(days=10))])
        self.assertEqual(rec.next_due, TODAY - datetime.timedelta(days=10) + datetime.timedelta(days=56))
        self.assertEqual(rec.status, E.FUTURE)  # 46 days away, outside the 30-day near-due window
        self.assertEqual(rec.doses, ["given", "later"])

    def test_second_dose_is_near_due_inside_the_window(self):
        rec = one([rule("zos", **self.ZOSTER)], [RecordSpec("zos", given_on=TODAY - datetime.timedelta(days=40))])
        self.assertEqual(rec.status, E.NEAR_DUE)

    def test_second_dose_due_after_the_interval(self):
        rec = one([rule("zos", **self.ZOSTER)], [RecordSpec("zos", given_on=D(2026, 6, 1))])
        self.assertEqual((rec.status, rec.dose_number), (E.DUE, 2))
        self.assertEqual(rec.doses, ["given", "due"])

    def test_complete_series_is_done(self):
        recs = [RecordSpec("zos", given_on=D(2026, 1, 1)), RecordSpec("zos", given_on=D(2026, 5, 1))]
        rec = one([rule("zos", **self.ZOSTER)], recs)
        self.assertEqual(rec.status, E.DONE)
        self.assertEqual(rec.doses, ["given", "given"])
        self.assertEqual(rec.last_done, D(2026, 5, 1))

    def test_infant_dose_two_at_four_months(self):
        dtap = dict(
            dose_count=5,
            dose_min_ages_months=(2, 4, 6, 15, 48),
            dose_min_intervals_days=(0, 28, 28, 180, 180),
            near_due_days=14,
        )
        dob = D(2026, 6, 12)
        rec = one([rule("dtap", **dtap)], [RecordSpec("dtap", given_on=D(2026, 8, 14))], dob=dob, sex="male")
        self.assertEqual((rec.status, rec.dose_number), (E.DUE, 2))
        self.assertEqual(rec.doses, ["given", "due", "later", "later", "later"])

    def test_infant_dose_two_not_due_before_four_months(self):
        dtap = dict(dose_count=5, dose_min_ages_months=(2, 4, 6, 15, 48), dose_min_intervals_days=(0, 28, 28, 180, 180))
        dob = D(2026, 8, 20)  # 2 months old
        rec = one([rule("dtap", **dtap)], [RecordSpec("dtap", given_on=D(2026, 10, 19))], dob=dob, sex="male")
        self.assertEqual(rec.status, E.FUTURE)
        self.assertEqual(rec.next_due, D(2026, 12, 20))  # the 4-month age, later than 28 days after dose 1 (11/16)


class RecurrenceTests(TestCase):
    FLU = dict(min_age_months=6, recurrence_months=12, near_due_days=60, overdue_after_days=30)

    def test_recent_dose_is_up_to_date(self):
        rec = one([rule("flu", **self.FLU)], [RecordSpec("flu", given_on=D(2026, 9, 1))])
        self.assertEqual(rec.status, E.DONE)
        self.assertEqual(rec.next_due, D(2027, 9, 1))

    def test_dose_a_year_ago_is_near_due(self):
        rec = one([rule("flu", **self.FLU)], [RecordSpec("flu", given_on=D(2025, 12, 1))])
        self.assertEqual(rec.status, E.NEAR_DUE)

    def test_just_past_due_is_due_not_overdue(self):
        rec = one([rule("flu", **self.FLU)], [RecordSpec("flu", given_on=D(2025, 10, 18))])
        self.assertEqual(rec.status, E.DUE)

    def test_long_past_due_is_overdue(self):
        rec = one([rule("flu", **self.FLU)], [RecordSpec("flu", given_on=D(2014, 6, 12))])
        self.assertEqual(rec.status, E.OVERDUE)

    def test_never_given_is_due_when_the_rule_has_no_overdue_limit(self):
        flu = dict(self.FLU, overdue_after_days=None)
        self.assertEqual(one([rule("flu", **flu)]).status, E.DUE)

    def test_never_given_is_overdue_when_the_rule_sets_a_limit_and_it_has_passed(self):
        # lateness is measured from the date the item first applied (the minimum age)
        self.assertEqual(one([rule("flu", **self.FLU)]).status, E.OVERDUE)

    def test_no_next_dose_beyond_the_age_range(self):
        r = rule("mam", min_age_months=480, max_age_months=888, recurrence_months=24)
        # age 73: still in range today, but the next screening (2028) would fall after age 74
        rec = one([r], [RecordSpec("mam", given_on=D(2026, 6, 1))], dob=D(1953, 6, 1))
        self.assertEqual(rec.status, E.DONE)
        self.assertIsNone(rec.next_due)


class SexAndRuleChoiceTests(TestCase):
    PAP = dict(min_age_months=252, max_age_months=780, sex="female", recurrence_months=36)

    def test_female_only_rule_does_not_apply_to_a_man(self):
        self.assertIsNone(one([rule("pap", **self.PAP)], sex="male"))

    def test_unknown_sex_needs_review_not_a_guess(self):
        rec = one([rule("pap", **self.PAP)], sex="")
        self.assertEqual(rec.status, E.REVIEW)
        self.assertIn("Sex is not recorded", rec.why)

    def test_most_specific_rule_for_the_age_wins(self):
        child = rule("hepb", min_age_months=0, max_age_months=215, dose_count=3, why_text="Child series.")
        adult = rule("hepb", min_age_months=216, max_age_months=719, dose_count=2, why_text="Adult series.")
        self.assertEqual(one([child, adult], dob=D(2026, 6, 12)).dose_count, 3)
        self.assertEqual(one([child, adult], dob=D(1971, 3, 14)).dose_count, 2)


class NeedsReviewTests(TestCase):
    PCV = dict(min_age_months=600, review_reason="Depends on age and risk conditions. Confirm.")

    def test_due_item_with_a_review_reason_is_not_called_due(self):
        rec = one([rule("pcv", **self.PCV)])
        self.assertEqual(rec.status, E.REVIEW)
        self.assertEqual(rec.why, "Depends on age and risk conditions. Confirm.")

    def test_review_does_not_hide_a_completed_item(self):
        rec = one([rule("pcv", **self.PCV)], [RecordSpec("pcv", given_on=D(2025, 1, 1))])
        self.assertEqual(rec.status, E.DONE)

    def test_review_does_not_apply_while_not_yet_eligible(self):
        rec = one([rule("pcv", min_age_months=1200, review_reason="Confirm.")])
        self.assertEqual(rec.status, E.FUTURE)


class NotDoneTests(TestCase):
    R = dict(min_age_months=216)

    def nd(self, reason, offer=None, recorded=D(2026, 10, 1)):
        return RecordSpec("x", status="not_done", not_done_reason=reason, offer_again_on=offer, recorded_on=recorded)

    def test_refusal_with_a_future_offer_date_holds_the_item(self):
        rec = one([rule(**self.R)], [self.nd("declined", D(2027, 1, 15))])
        self.assertEqual(rec.status, E.NOT_DONE)
        self.assertEqual(rec.next_due, D(2027, 1, 15))
        self.assertIn("declined", rec.why)
        self.assertIn("01/15/2027", rec.why)

    def test_item_returns_when_the_offer_date_passes(self):
        rec = one([rule(**self.R)], [self.nd("declined", D(2026, 10, 18))])
        self.assertEqual(rec.status, E.DUE)

    def test_refusal_with_no_date_comes_back_after_a_year(self):
        held = one([rule(**self.R)], [self.nd("declined", None, D(2026, 3, 1))])
        back = one([rule(**self.R)], [self.nd("declined", None, D(2025, 10, 1))])
        self.assertEqual(held.status, E.NOT_DONE)
        self.assertEqual(back.status, E.DUE)

    def test_medical_reason_holds_until_the_offer_date(self):
        rec = one([rule(**self.R)], [self.nd("medical")])
        self.assertEqual(rec.status, E.NOT_DONE)

    def test_illness_and_unavailable_do_not_hide_the_item(self):
        for reason in ("illness", "unavailable", "given_elsewhere"):
            self.assertEqual(one([rule(**self.R)], [self.nd(reason)]).status, E.DUE, reason)

    def test_evidence_of_immunity_counts_as_done(self):
        rec = one([rule(**self.R)], [self.nd("immune")])
        self.assertEqual(rec.status, E.DONE)

    def test_a_refusal_older_than_the_last_dose_is_ignored(self):
        flu = dict(min_age_months=6, recurrence_months=12, overdue_after_days=30)
        recs = [self.nd("declined", D(2027, 5, 1), D(2024, 10, 1)), RecordSpec("x", given_on=D(2025, 10, 1))]
        rec = one([rule(**flu)], recs)
        self.assertEqual(rec.status, E.DUE)  # past due again, and the old refusal no longer applies


class WholeListTests(TestCase):
    def test_one_recommendation_per_item_in_rule_order(self):
        rules = [rule("b", min_age_months=0), rule("a", min_age_months=0), rule("b", min_age_months=100)]
        out = recommend(D(1971, 3, 14), "female", TODAY, rules, [])
        self.assertEqual([r.item_code for r in out], ["b", "a"])

    def test_summary_counts_every_status(self):
        rules = [rule("a", min_age_months=0), rule("b", min_age_months=2000)]
        counts = E.summarize(recommend(D(1971, 3, 14), "female", TODAY, rules, []))
        self.assertEqual(counts[E.DUE], 1)
        self.assertEqual(counts[E.FUTURE], 1)
        self.assertEqual(sum(counts.values()), 2)

    def test_status_order_puts_what_needs_attention_first(self):
        order = sorted(E.STATUS_ORDER, key=E.STATUS_ORDER.get)
        self.assertEqual(order[:3], [E.OVERDUE, E.DUE, E.NEAR_DUE])
        self.assertEqual(order[-1], E.AGED_OUT)
