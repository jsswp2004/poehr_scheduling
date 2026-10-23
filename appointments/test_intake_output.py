"""Intake & Output: the arithmetic (no database) and the endpoints."""

from datetime import datetime, timedelta, timezone as tz
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from . import intake_output as io

NOW = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)


def cols(*hours_ago):
    return [{"id": f"c{i}", "timestamp": (NOW - timedelta(hours=h)).isoformat()} for i, h in enumerate(hours_ago)]


def sheet(**rows):
    """sheet(oral_fluids={"c0": 240}) -> data dict."""
    return rows


class MathTests(SimpleTestCase):
    def test_number_rejects_blank_negative_and_junk(self):
        for bad in (None, "", " ", "abc", -5, "-1", float("nan"), True):
            self.assertIsNone(io.number(bad), bad)
        self.assertEqual(io.number("240"), 240.0)
        self.assertEqual(io.number(0), 0.0)

    def test_clean_shows_whole_numbers_without_decimals(self):
        self.assertEqual(io.clean(240.0), 240)
        self.assertEqual(io.clean(7.25), 7.2)
        self.assertIsNone(io.clean(None))

    def test_shift_window_day_and_night(self):
        day = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)
        self.assertEqual([t.hour for t in io.shift_window(day, ["07:00", "19:00"])], [7, 19])
        night = datetime(2026, 10, 15, 22, 0, tzinfo=tz.utc)
        start, end = io.shift_window(night, ["07:00", "19:00"])
        self.assertEqual((start.hour, end.hour, (end - start).total_seconds()), (19, 7, 12 * 3600))
        early = datetime(2026, 10, 15, 3, 0, tzinfo=tz.utc)
        start, end = io.shift_window(early, ["07:00", "19:00"])
        self.assertEqual((start.day, start.hour, end.day, end.hour), (14, 19, 15, 7))

    def test_shift_window_survives_bad_settings(self):
        start, end = io.shift_window(NOW, ["nonsense"])
        self.assertEqual((start.hour, end.hour), (7, 19))

    def test_true_urine_is_drainage_minus_irrigation_never_negative(self):
        data = sheet(urine_catheter={"c0": 500, "c1": 100}, irrigation_in={"c0": 300, "c1": 400})
        self.assertEqual(io.column_values(data, "c0")["urine_true"], 200)
        self.assertEqual(io.column_values(data, "c1")["urine_true"], 0)

    def test_ice_chips_count_half(self):
        self.assertEqual(io.column_values(sheet(ice_chips={"c0": 100}), "c0")["ice_chips"], 50)

    def test_catheter_drainage_and_irrigation_are_not_counted_directly(self):
        values = io.column_values(sheet(urine_catheter={"c0": 500}, irrigation_in={"c0": 300}, oral_fluids={"c0": 100}), "c0")
        self.assertEqual(io.intake_output_of(values), (100, 200))

    def test_blank_side_stays_none(self):
        self.assertEqual(io.intake_output_of({"oral_fluids": 240}), (240, None))
        self.assertEqual(io.net_of(240, None), 240)
        self.assertIsNone(io.net_of(None, None))


class SummaryTests(SimpleTestCase):
    def run_summary(self, hours, data, **kw):
        return io.summarize(cols(*hours), data, NOW, kw.pop("settings", None), kw.pop("weight_kg", None))

    def test_totals_by_period(self):
        # c0 3 h ago (this shift, last 24 h), c1 30 h ago (stay only)
        data = sheet(oral_fluids={"c0": 240, "c1": 500}, urine_voided={"c0": 100, "c1": 50})
        out = self.run_summary([3, 30], data)
        self.assertEqual(out["periods"]["shift"]["intake"], 240)
        self.assertEqual(out["periods"]["day"]["output"], 100)
        self.assertEqual(out["periods"]["stay"]["intake"], 740)
        self.assertEqual(out["periods"]["stay"]["net"], 590)
        self.assertEqual(out["rows"]["oral_fluids"], {"shift": 240, "day": 240, "stay": 740})
        self.assertEqual(out["columns"]["c0"], {"intake": 240, "output": 100, "net": 140, "urine_true": None})

    def test_empty_flowsheet_has_zero_totals_and_no_alerts(self):
        out = io.summarize([], {}, NOW)
        self.assertEqual(out["periods"]["stay"]["net"], 0)
        self.assertEqual(out["alerts"], [])

    def test_bad_values_and_columns_are_ignored(self):
        columns = [{"id": "a", "timestamp": "garbage"}, {"id": "b", "timestamp": (NOW - timedelta(hours=1)).isoformat()}]
        out = io.summarize(columns, sheet(oral_fluids={"a": 999, "b": "x"}), NOW)
        self.assertEqual(out["periods"]["stay"]["intake"], 0)

    def test_positive_balance_alert(self):
        out = self.run_summary([2], sheet(iv_fluids={"c0": 2500}))
        self.assertEqual([a["code"] for a in out["alerts"]], ["positive_balance"])
        self.assertIn("+2,500", out["alerts"][0]["message"])

    def test_positive_balance_alert_can_be_turned_off(self):
        out = self.run_summary([2], sheet(iv_fluids={"c0": 2500}), settings={"positive_balance_24h_ml": None})
        self.assertEqual(out["alerts"], [])

    def test_no_urine_alert_needs_enough_charting_time_and_a_quiet_gap(self):
        data = sheet(urine_voided={"c0": 200}, oral_fluids={"c1": 100})
        quiet = self.run_summary([9, 1], data)  # urine 9 h ago, charting since then, none since
        self.assertIn("no_urine", [a["code"] for a in quiet["alerts"]])
        fresh = self.run_summary([1], sheet(oral_fluids={"c0": 100}))  # only charted an hour ago
        self.assertNotIn("no_urine", [a["code"] for a in fresh["alerts"]])
        recent = self.run_summary([9, 1], sheet(urine_voided={"c0": 200, "c1": 50}))
        self.assertNotIn("no_urine", [a["code"] for a in recent["alerts"]])

    def test_low_urine_rate_alert_uses_weight(self):
        data = sheet(urine_voided={"c0": 100}, oral_fluids={"c1": 10})
        columns = cols(2, 8)
        out = io.summarize(columns, data, NOW, None, weight_kg=80)  # 100 mL / 80 kg / 6 h = 0.21
        self.assertIn("low_urine_rate", [a["code"] for a in out["alerts"]])
        self.assertEqual(out["urine_ml_kg_h"], 0.21)
        none = io.summarize(columns, data, NOW, None, weight_kg=None)
        self.assertNotIn("low_urine_rate", [a["code"] for a in none["alerts"]])
        self.assertIsNone(none["urine_ml_kg_h"])

    def test_low_urine_24h_needs_a_full_day_of_charting(self):
        data = sheet(urine_voided={"c0": 300}, oral_fluids={"c1": 10})
        full = self.run_summary([2, 26], data)
        self.assertIn("low_urine_24h", [a["code"] for a in full["alerts"]])
        part = self.run_summary([2, 10], data)
        self.assertNotIn("low_urine_24h", [a["code"] for a in part["alerts"]])


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


class EndpointTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(name="Clinic")
        other = Organization.objects.create(name="Elsewhere")
        mk = lambda name, role, org=self.org: User.objects.create_user(
            username=name, email=f"{name}@x.com", password="pw-12345-xyz", role=role, organization=org
        )
        self.nurse, self.admin = mk("nur", "nurse"), mk("adm", "admin")
        self.patient, self.stranger = mk("pat", "patient"), mk("far", "patient", other)
        self.body = {
            "patient": self.patient.pk,
            "columns": [{"id": "c0", "timestamp": timezone_now_minus(2)}],
            "data": {"oral_fluids": {"c0": "240"}, "urine_voided": {"c0": "100"}},
        }

    def test_summary_totals(self):
        res = client_for(self.nurse).post("/api/intake-output/summary/", self.body, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        stay = res.json()["periods"]["stay"]
        self.assertEqual((stay["intake"], stay["output"], stay["net"]), (240, 100, 140))
        self.assertIn("settings", res.json())

    def test_summary_refuses_patients_other_clinics_and_bad_bodies(self):
        self.assertEqual(client_for(self.patient).post("/api/intake-output/summary/", self.body, format="json").status_code, 403)
        other = dict(self.body, patient=self.stranger.pk)
        self.assertEqual(client_for(self.nurse).post("/api/intake-output/summary/", other, format="json").status_code, 404)
        bad = dict(self.body, columns="nope")
        self.assertEqual(client_for(self.nurse).post("/api/intake-output/summary/", bad, format="json").status_code, 400)

    def test_settings_default_then_admin_can_change(self):
        api = client_for(self.nurse)
        self.assertEqual(api.get("/api/intake-output/settings/").json()["no_urine_hours"], 6)
        self.assertEqual(api.put("/api/intake-output/settings/", {}, format="json").status_code, 403)
        res = client_for(self.admin).put(
            "/api/intake-output/settings/",
            {"shift_starts": ["06:30", "18:30"], "low_urine_ml_kg_h": "0.4", "no_urine_hours": "", "low_urine_24h_ml": 700, "positive_balance_24h_ml": 1500},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        got = api.get("/api/intake-output/settings/").json()
        self.assertEqual(got["shift_starts"], ["06:30", "18:30"])
        self.assertIsNone(got["no_urine_hours"])
        self.assertEqual(got["low_urine_ml_kg_h"], 0.4)

    def test_settings_rejects_nonsense(self):
        res = client_for(self.admin).put("/api/intake-output/settings/", {"shift_starts": ["25:99"], "no_urine_hours": 500}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("shift_starts", res.json())
        self.assertIn("no_urine_hours", res.json())


def timezone_now_minus(hours):
    from django.utils import timezone

    return (timezone.now() - timedelta(hours=hours)).isoformat()
