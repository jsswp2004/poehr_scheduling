"""Billing counts for the lab add-on."""

import csv
import io
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization

from . import lab_simulator as sim
from . import lab_usage
from .models import LabInboundMessage, LabOutboundMessage, LabReport
from .test_lab_orders_out import Base

User = get_user_model()


class UsageTests(Base):
    def run_sim(self, scenarios, orders):
        for _ in range(orders):
            self.order()
        report = sim.run(sim.ClientTransport(self.client, self.conn.key), scenarios)
        self.assertTrue(report.passed, [c for c in report.checks if not c.ok])

    def row(self, org=None, month=None):
        rows = lab_usage.usage(month, org or self.org)
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_counts_orders_results_and_held_messages(self):
        self.run_sim(["normal", "abnormal", "unknown_patient", "cancel"], 4)
        r = self.row()
        self.assertEqual(r["month"], timezone.localdate().strftime("%Y-%m"))
        self.assertTrue(r["addon_enabled"])
        self.assertEqual(r["connections_active"], 1)
        self.assertEqual((r["orders_sent"], r["orders_accepted"], r["orders_rejected"], r["cancellations_sent"]), (4, 4, 0, 0))
        self.assertEqual(r["results_messages"], 5)  # normal, abnormal, unknown, cancel final + cancel X
        self.assertEqual(r["results_filed"], 3)  # normal, abnormal, cancel's report (later cancelled, still received)
        self.assertEqual(r["results_held"], 1)

    def test_rejected_and_withdrawn_orders(self):
        a, b = self.order(), self.order()
        msgs = self.pull().json()["messages"]
        self.ack({"control_id": msgs[0]["control_id"], "status": "accepted"})
        self.ack({"control_id": msgs[1]["control_id"], "status": "rejected", "detail": "bad code"})
        from . import orders_workflow as ow

        c = self.order()
        self.pull()
        LabOutboundMessage.objects.filter(order=c).update(status="pending")
        ow.discontinue_order(c, self.doctor, "mistake")
        self.pull()
        r = self.row()
        self.assertEqual((r["orders_sent"], r["orders_accepted"], r["orders_rejected"]), (2, 1, 1))  # withdrawn one is not billed

    def test_cancellations_are_counted(self):
        from . import orders_workflow as ow

        o = self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        self.ack({"control_id": cid, "status": "accepted"})
        ow.discontinue_order(o, self.doctor, "declined")
        self.pull()
        self.assertEqual(self.row()["cancellations_sent"], 1)

    def test_months_are_separate(self):
        self.run_sim(["normal"], 1)
        long_ago = timezone.now() - timedelta(days=70)
        LabReport.objects.update(created_at=long_ago)
        LabInboundMessage.objects.update(received_at=long_ago)
        LabOutboundMessage.objects.update(created_at=long_ago, acknowledged_at=long_ago)
        self.assertEqual(self.row()["results_filed"], 0)
        month = long_ago.astimezone(timezone.get_current_timezone()).strftime("%Y-%m")
        r = self.row(month=month)
        self.assertEqual((r["results_filed"], r["orders_sent"], r["orders_accepted"]), (1, 1, 1))

    def test_base_product_use_is_shown_but_separate(self):
        self.client.force_authenticate(self.doctor)
        self.client.post("/api/lab-reports/", {"patient": self.patient.pk, "title": "Manual",
                         "items": [{"test_name": "Na", "value": "140"}]}, format="json")
        r = self.row()
        self.assertEqual((r["results_entered_manually"], r["results_filed"]), (1, 0))

    def test_clinic_without_addon_or_activity_is_left_out_and_clinics_do_not_mix(self):
        quiet = Organization.objects.create(name="Quiet")
        self.assertEqual(lab_usage.usage(None, quiet), [])
        self.run_sim(["normal"], 1)
        names = [r["organization"] for r in lab_usage.usage()]
        self.assertIn("Clinic A", names)
        other_row = [r for r in lab_usage.usage() if r["organization"] == "Clinic B"][0]  # add-on on, no activity
        self.assertEqual((other_row["results_filed"], other_row["orders_sent"]), (0, 0))

    def test_bad_month(self):
        with self.assertRaises(ValueError):
            lab_usage.usage("October")
        with self.assertRaises(ValueError):
            lab_usage.usage("2026-13")


class UsageApiAndCommandTests(Base):
    URL = "/api/lab-usage/"

    def setUp(self):
        super().setUp()
        self.order()
        self.pull()
        self.admin = User.objects.create_user(username="adm", email="a@x.com", password="pw-12345-xyz", role="admin", organization=self.org)
        self.sysadmin = User.objects.create_user(username="sys", email="s@x.com", password="pw-12345-xyz", role="system_admin")

    def test_clinic_admin_sees_only_their_clinic(self):
        self.client.force_authenticate(self.admin)
        body = self.client.get(self.URL).json()
        self.assertEqual([r["organization"] for r in body["results"]], ["Clinic A"])
        self.assertEqual(body["results"][0]["orders_sent"], 1)
        self.assertEqual(self.client.get(self.URL, {"org": self.other.pk}).json()["results"][0]["organization"], "Clinic A")

    def test_system_admin_sees_all_and_can_narrow(self):
        self.client.force_authenticate(self.sysadmin)
        self.assertEqual({r["organization"] for r in self.client.get(self.URL).json()["results"]}, {"Clinic A", "Clinic B"})
        self.assertEqual([r["organization"] for r in self.client.get(self.URL, {"org": self.org.pk}).json()["results"]], ["Clinic A"])
        self.assertEqual(self.client.get(self.URL, {"org": 99999}).status_code, 404)

    def test_other_roles_and_anonymous_are_refused(self):
        for user in (self.doctor, self.patient):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.URL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.URL).status_code, (401, 403))

    def test_bad_month_is_400_and_csv_export(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.URL, {"month": "nope"}).status_code, 400)
        r = self.client.get(self.URL, {"export": "csv"})
        self.assertEqual(r["Content-Type"].split(";")[0], "text/csv")
        rows = list(csv.DictReader(io.StringIO(r.content.decode())))
        self.assertEqual((rows[0]["organization"], rows[0]["orders_sent"]), ("Clinic A", "1"))

    def test_command_table_csv_and_errors(self):
        out = StringIO()
        call_command("lab_usage", "--org", str(self.org.pk), stdout=out)
        self.assertIn("Clinic A", out.getvalue())
        self.assertIn("1 sent", out.getvalue())
        out = StringIO()
        call_command("lab_usage", "--csv", stdout=out)
        self.assertTrue(out.getvalue().startswith("organization_id,organization,month"))
        with self.assertRaises(CommandError):
            call_command("lab_usage", "--month", "bad", stdout=StringIO())
        with self.assertRaises(CommandError):
            call_command("lab_usage", "--org", "99999", stdout=StringIO())
