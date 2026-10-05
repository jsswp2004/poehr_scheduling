"""End to end: the pretend lab against the real endpoints, and what it leaves in the database."""

from io import StringIO

from django.core.management import call_command

from . import lab_simulator as sim
from .models import LabInboundMessage, LabOutboundMessage, LabReport
from .test_lab_orders_out import Base


class SimulatorTests(Base):
    def transport(self, conn=None):
        conn = conn or self.conn
        return sim.ClientTransport(self.client, conn.key)

    def run_one(self, scenario, order=None):
        order = order or self.order()
        report = sim.run(self.transport(), [scenario])
        self.assertTrue(report.passed, [c for c in report.checks if not c.ok])
        return order, report

    def test_the_order_message_is_one_a_lab_can_read(self):
        o = self.order()
        m = self.pull().json()["messages"][0]
        lab = sim.read_order(m)
        self.assertEqual((lab.placer, lab.mrn, lab.last, lab.first, lab.dob, lab.action), (o.placer_order_number, self.mrn, "Doe", "Jane", "19800115", "NW"))
        self.assertEqual(lab.code, "24320-4")

    def test_a_message_missing_the_mrn_is_reported_not_crashed(self):
        with self.assertRaises(ValueError):
            sim.read_order({"control_id": "X", "body": "MSH|^~\\&|A\rPID|1||^^^POWER^MR||Doe^Jane\rORC|NW|ORD-1\rOBR|1|ORD-1\r"})

    def test_normal(self):
        order, report = self.run_one("normal")
        rep = LabReport.objects.get()
        self.assertEqual((rep.order, rep.patient, rep.status, rep.review_status), (order, self.patient, "final", "unreviewed"))
        order.refresh_from_db()
        self.assertEqual((order.status, order.interface_status), ("completed", "acknowledged"))
        self.assertEqual(LabOutboundMessage.objects.get().status, "acknowledged")

    def test_abnormal_and_critical_are_flagged(self):
        self.run_one("abnormal")
        flags = {i.test_name: i.abnormal_flag for i in LabReport.objects.get().items.all()}
        self.assertEqual(flags, {"Potassium": "H", "Sodium": ""})
        LabReport.objects.all().delete()
        self.run_one("critical")
        self.assertEqual(LabReport.objects.get().items.get(test_name="Potassium").abnormal_flag, "HH")

    def test_prelim_then_final_is_one_report(self):
        self.run_one("prelim_final")
        self.assertEqual(LabReport.objects.count(), 1)
        self.assertEqual(LabReport.objects.get().status, "final")

    def test_correction_changes_the_value_and_resets_review(self):
        order = self.order()
        t = self.transport()
        # first leg: normal flow up to the final report
        report = sim.run(t, ["correction"])
        self.assertTrue(report.passed, [c for c in report.checks if not c.ok])
        rep = LabReport.objects.get()
        self.assertEqual(rep.status, "corrected")
        self.assertEqual(str(rep.items.get(test_name="Potassium").value), "4.9")

    def test_cancel_marks_entered_in_error(self):
        self.run_one("cancel")
        self.assertEqual(LabReport.objects.get().status, "entered_in_error")

    def test_duplicate_is_filed_once(self):
        self.run_one("duplicate")
        self.assertEqual(LabReport.objects.count(), 1)
        self.assertEqual(LabInboundMessage.objects.count(), 1)

    def test_unknown_patient_and_dob_mismatch_are_held_for_staff(self):
        self.run_one("unknown_patient")
        self.assertEqual(LabReport.objects.count(), 0)
        self.assertEqual(LabInboundMessage.objects.get().status, "unmatched")
        LabInboundMessage.objects.all().delete()
        self.run_one("dob_mismatch")
        self.assertEqual(LabReport.objects.count(), 0)
        self.assertEqual(LabInboundMessage.objects.get().status, "unmatched")

    def test_a_different_last_name_is_held_even_when_order_mrn_and_dob_match(self):
        self.run_one("name_mismatch")
        self.assertEqual(LabReport.objects.count(), 0)
        self.assertIn("last name", LabInboundMessage.objects.get().detail)

    def test_fhir_result(self):
        self.run_one("fhir")
        self.assertEqual(LabReport.objects.get().source, "interface")

    def test_bad_key_scenario(self):
        report = sim.run(self.transport(), ["bad_key"])
        self.assertTrue(report.passed)
        self.assertEqual(report.checks[0].step, "send with wrong key")

    def test_several_orders_cycle_through_scenarios(self):
        for _ in range(3):
            self.order()
        report = sim.run(self.transport(), ["normal", "abnormal", "critical"])
        self.assertTrue(report.passed, [c for c in report.checks if not c.ok])
        self.assertEqual(report.pulled, 3)
        self.assertEqual(LabReport.objects.count(), 3)

    def test_no_orders_waiting_is_a_failed_check_with_a_clear_message(self):
        report = sim.run(self.transport(), ["normal"])
        self.assertFalse(report.passed)
        self.assertIn("Sign a lab order", report.checks[-1].detail)

    def test_a_server_that_misbehaves_fails_the_check(self):
        class Wrong(sim.ClientTransport):
            def request(self, method, path, body=None, content_type="text/plain", key=None):
                if path.endswith("/hl7/"):
                    return 200, "MSH|^~\\&|P\rMSA|AE|X|Try later\r"
                return super().request(method, path, body, content_type, key)

        self.order()
        report = sim.run(Wrong(self.client, self.conn.key), ["normal"])
        self.assertFalse(report.passed)

    def test_command_lists_and_seeds(self):
        out = StringIO()
        call_command("lab_simulator", "--list", stdout=out)
        self.assertIn("critical", out.getvalue())
        call_command("lab_simulator", "--seed", str(self.org.pk), "--count", "2", stdout=out)
        from .models import Order

        seeded = Order.objects.filter(patient__username=f"zztest-sim-{self.org.pk}")
        self.assertEqual((seeded.count(), set(seeded.values_list("status", flat=True))), (2, {"active"}))
        report = sim.run(self.transport(), ["normal", "abnormal"])
        self.assertTrue(report.passed, [c for c in report.checks if not c.ok])
