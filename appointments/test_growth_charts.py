import datetime as dt

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import CustomUser, Organization, Patient

from . import growth_engine as g
from .models import Appointment, FlowsheetTemplate, VitalSignsFlowsheet


class EngineTests(SimpleTestCase):
    def test_who_male_birth_weight_median_is_z_zero(self):
        lms = g.lms_at("who_weight_for_age", "male", 0)
        self.assertAlmostEqual(g.z_score(lms[1], lms), 0.0, places=6)
        self.assertAlmostEqual(lms[1], 3.3464, places=3)

    def test_cdc_male_24_month_weight_p95(self):
        lms = g.lms_at("cdc_weight_for_age", "male", 24.5)
        p95 = g.value_at_z(g.Z_95, lms)
        self.assertAlmostEqual(p95, 15.19, delta=0.2)

    def test_z_and_value_round_trip(self):
        lms = g.lms_at("cdc_stature_for_age", "female", 60)
        for z in (-2.5, -1, 0, 1.3, 2.2):
            self.assertAlmostEqual(g.z_score(g.value_at_z(z, lms), lms), z, places=6)

    def test_percentile_and_labels(self):
        self.assertAlmostEqual(g.percentile_of(0), 50.0, places=3)
        self.assertEqual(g.ordinal(2), "2nd")
        self.assertEqual(g.ordinal(11), "11th")
        self.assertEqual(g.ordinal(23), "23rd")

    def test_gestation_and_correction(self):
        self.assertEqual(g.correction_days(None, None), 0)
        self.assertEqual(g.correction_days(40, 0), 0)
        self.assertEqual(g.correction_days(36, 0), 28)
        self.assertEqual(g.correction_days(36, 3), 25)
        self.assertEqual(g.correction_days(41, 0), 0)

    def test_corrected_age_only_under_24_months(self):
        self.assertEqual(g.plot_age_days(100, 28, True), 72)
        self.assertEqual(g.plot_age_days(100, 28, False), 100)
        self.assertEqual(g.plot_age_days(900, 28, True), 900)

    def test_build_charts_picks_who_then_cdc(self):
        dob = dt.date(2025, 1, 1)
        rows = [{"date": dt.date(2025, 7, 1), "weight_kg": 8.0, "height_cm": 68.0, "head_cm": 43.0}]
        info, charts = g.build_charts("male", dob, dt.date(2025, 7, 1), rows)
        self.assertEqual({c["key"] for c in charts}, set(g.WHO_SET))
        info, charts = g.build_charts("male", dob, dt.date(2028, 1, 1), rows)
        self.assertEqual({c["key"] for c in charts}, set(g.CDC_SET))

    def test_low_weight_is_flagged_and_normal_is_not(self):
        dob = dt.date(2025, 1, 1)
        low = [{"date": dt.date(2025, 7, 1), "weight_kg": 5.0, "height_cm": None, "head_cm": None}]
        _info, charts = g.build_charts("male", dob, dt.date(2025, 7, 1), low)
        wfa = next(c for c in charts if c["key"] == "who_weight_for_age")
        self.assertTrue(wfa["flagged"])
        self.assertLess(wfa["latest"]["z"], -2)
        ok = [{"date": dt.date(2025, 7, 1), "weight_kg": 7.9, "height_cm": None, "head_cm": None}]
        _info, charts = g.build_charts("male", dob, dt.date(2025, 7, 1), ok)
        self.assertFalse(next(c for c in charts if c["key"] == "who_weight_for_age")["flagged"])

    def test_preterm_point_moves_left_when_corrected(self):
        dob = dt.date(2025, 1, 1)
        rows = [{"date": dt.date(2025, 5, 1), "weight_kg": 5.0, "height_cm": None, "head_cm": None}]
        info, c1 = g.build_charts("female", dob, dt.date(2025, 5, 1), rows, 32, 0, True)
        _i, c2 = g.build_charts("female", dob, dt.date(2025, 5, 1), rows, 32, 0, False)
        self.assertTrue(info["preterm"])
        p1 = next(c for c in c1 if c["key"] == "who_weight_for_age")["points"][0]
        p2 = next(c for c in c2 if c["key"] == "who_weight_for_age")["points"][0]
        self.assertLess(p1["plot_months"], p2["plot_months"])
        self.assertEqual(p1["chrono_months"], p2["chrono_months"])


class ApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="A")
        self.other = Organization.objects.create(name="B")
        self.nurse = self.user("nurse1", "nurse", self.org)
        self.front = self.user("front1", "registrar", self.org)
        self.stranger = self.user("nurse2", "nurse", self.other)
        self.doctor = self.user("doc1", "doctor", self.org)
        self.dob = timezone.localdate() - dt.timedelta(days=200)
        self.patient = self.user("baby", "patient", self.org, dob=self.dob, sex="M")
        self.client = APIClient()
        self.client.force_authenticate(self.nurse)

    def user(self, username, role, org, dob=None, sex=""):
        u = CustomUser.objects.create_user(username=username, password="x", role=role, organization=org)
        if dob:
            profile, _ = Patient.objects.get_or_create(user=u)
            profile.date_of_birth, profile.legal_sex, profile.organization = dob, sex, org
            profile.save()
        return CustomUser.objects.get(pk=u.pk)

    def url(self, patient=None, query=""):
        return f"/api/growth-charts/patient/{(patient or self.patient).pk}/{query}"

    def sheet(self, readings):
        """readings: [(days_after_birth, {row: value})]"""
        template, _ = FlowsheetTemplate.objects.get_or_create(code="vital_signs", defaults={"name": "Vital Signs"})
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Well", appointment_datetime=timezone.now())
        columns, data = [], {}
        for n, (day, values) in enumerate(readings):
            cid = f"c{n}"
            when = dt.datetime.combine(self.dob + dt.timedelta(days=day), dt.time(10, 0), tzinfo=dt.timezone.utc)
            columns.append({"id": cid, "timestamp": when.isoformat()})
            for row, value in values.items():
                data.setdefault(row, {})[cid] = value
        VitalSignsFlowsheet.objects.create(organization=self.org, template=template, appointment=appt, patient=self.patient, columns=columns, data=data)

    def test_reads_flowsheet_and_plots(self):
        self.sheet([(60, {"weight_lb": "11.5", "height_in": "23.5"}), (180, {"weight_lb": "17", "height_in": "27", "head_circumference_cm": "43"})])
        r = self.client.get(self.url())
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["problem"], "")
        by = {c["key"]: c for c in body["charts"]}
        self.assertEqual(len(by["who_weight_for_age"]["points"]), 2)
        self.assertEqual(len(by["who_head_circumference"]["points"]), 1)
        self.assertAlmostEqual(by["who_weight_for_age"]["points"][0]["weight_kg"], 5.216, places=2)
        self.assertAlmostEqual(by["who_length_for_age"]["points"][1]["height_cm"], 68.58, places=2)

    def test_implausible_values_are_left_off_and_counted(self):
        self.sheet([(60, {"weight_lb": "1150", "height_in": "23.5"})])
        body = self.client.get(self.url()).json()
        self.assertEqual(body["skipped"], 1)
        by = {c["key"]: c for c in body["charts"]}
        self.assertEqual(by["who_weight_for_age"]["points"], [])
        self.assertEqual(len(by["who_length_for_age"]["points"]), 1)

    def test_problems_are_reported_not_errors(self):
        no_dob = self.user("nodob", "patient", self.org)
        body = self.client.get(self.url(no_dob)).json()
        self.assertEqual(body["problem"], "no_dob")
        no_sex = self.user("nosex", "patient", self.org, dob=self.dob, sex="")
        self.assertEqual(self.client.get(self.url(no_sex)).json()["problem"], "no_sex")
        adult = self.user("adult", "patient", self.org, dob=dt.date(1980, 1, 1), sex="F")
        self.assertEqual(self.client.get(self.url(adult)).json()["problem"], "too_old")
        future = self.user("future", "patient", self.org, dob=timezone.localdate() + dt.timedelta(days=5), sex="F")
        self.assertEqual(self.client.get(self.url(future)).json()["problem"], "future_dob")

    def test_other_organization_gets_404(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(self.url()).status_code, 404)

    def test_needs_flowsheet_right(self):
        self.client.force_authenticate(self.front)
        self.assertEqual(self.client.get(self.url()).status_code, 403)

    def test_corrected_toggle_and_birth_details(self):
        profile = Patient.objects.get(user=self.patient)
        profile.gestational_age_weeks, profile.gestational_age_days, profile.birth_weight_g = 32, 0, 1600
        profile.save()
        self.sheet([(120, {"weight_lb": "10"})])
        on = self.client.get(self.url()).json()
        off = self.client.get(self.url(query="?corrected=0")).json()
        self.assertTrue(on["info"]["preterm"])
        self.assertTrue(on["info"]["corrected_applied"])
        self.assertFalse(off["info"]["corrected_applied"])
        self.assertEqual(on["info"]["correction_weeks"], 8.0)
        self.assertEqual(on["patient"]["birth_weight_g"], 1600)
        a = next(c for c in on["charts"] if c["key"] == "who_weight_for_age")["points"][0]
        b = next(c for c in off["charts"] if c["key"] == "who_weight_for_age")["points"][0]
        self.assertLess(a["plot_months"], b["plot_months"])

    def test_head_circumference_row_is_added_by_migration(self):
        from .models import FlowsheetRowDefinition
        template = FlowsheetTemplate.objects.filter(code="vital_signs").first()
        if template is not None:
            self.assertTrue(FlowsheetRowDefinition.objects.filter(template=template, key="head_circumference_cm").exists())
