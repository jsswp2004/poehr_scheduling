"""POWER Pharmacy, Phase 1: verification actions, CDS, MAR gating, permissions, organization scoping, the data migration."""

import importlib
from datetime import timedelta
from unittest import mock

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments import order_tasks as ot
from appointments import orders_workflow as ow
from appointments.models import Appointment, MessageThread, Order, Orderable, OrderTask, PatientAllergy
from users.models import Organization

from . import services as svc
from .dangerous_drugs import is_dangerous_drug
from .models import PharmacyIntervention

User = get_user_model()


def mk(username, role, org, first="", last=""):
    return User.objects.create_user(
        username=username, email=f"{username}@example.ph", password="pw-12345-xyz", role=role, organization=org,
        first_name=first, last_name=last,
    )


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Ospital ng Maynila", enabled_modules=["clinical_documentation", "pharmacy"])
        self.other = Organization.objects.create(name="Cebu Doctors Clinic", enabled_modules=["clinical_documentation", "pharmacy"])
        self.doctor = mk("doc", "doctor", self.org, "Jose", "Rizal")
        self.nurse = mk("nurse", "nurse", self.org, "Maria Clara", "Santos")
        self.pharmacist = mk("rph", "pharmacist", self.org, "Andres", "Bonifacio")
        self.tech = mk("tech", "pharmacy_tech", self.org, "Gabriela", "Silang")
        self.admin = mk("adm", "admin", self.org)
        self.foreign_rph = mk("rph2", "pharmacist", self.other)
        self.patient = mk("pat", "patient", self.org, "Juan", "Dela Cruz")
        self.appt = Appointment.all_objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="Admission",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        self.pip = Orderable.objects.create(code="piptazo", name="Piperacillin-tazobactam 4.5 g IV", category="medication")
        self.para = Orderable.objects.create(code="para", name="Paracetamol 500 mg tablet", category="medication",
                                             generic_name="Paracetamol", brand_name="Biogesic")
        self.morphine = Orderable.objects.create(code="mso4", name="Morphine sulfate 2 mg IV", category="medication")
        self.cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")

    def med(self, orderable=None, schedule=None, priority=None, sign=True):
        sched = {"frequency": "q8h", "dose": "4.5 g", "route": "IV", **(schedule or {})}
        o = ow.create_draft_order(self.doctor, self.appt, orderable or self.pip, schedule=sched, priority=priority)
        return ow.sign_order(o, self.doctor, "Reviewed by prescriber") if sign else o

    def api(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def action(self, order, user=None, **body):
        return self.api(user or self.pharmacist).post(f"/api/pharmacy/orders/{order.pk}/action/", body, format="json")


class StatusDefaultTests(Base):
    def test_new_medication_order_waits_for_pharmacy_and_others_stay_blank(self):
        self.assertEqual(self.med(sign=False).pharmacy_status, "pending_verification")
        lab = ow.create_draft_order(self.doctor, self.appt, self.cbc)
        self.assertEqual(lab.pharmacy_status, "")

    def test_data_migration_verifies_existing_signed_medication_orders(self):
        signed = self.med()
        draft = self.med(sign=False)
        lab = ow.create_draft_order(self.doctor, self.appt, self.cbc)
        Order.objects.update(pharmacy_status="")  # as they were before the migration
        mig = importlib.import_module("appointments.migrations.0104_order_pharmacy_verification")
        mig.set_existing_medication_orders(django_apps, None)
        statuses = dict(Order.objects.values_list("pk", "pharmacy_status"))
        self.assertEqual(statuses[signed.pk], "verified")
        self.assertEqual(statuses[draft.pk], "pending_verification")
        self.assertEqual(statuses[lab.pk], "")


class MarGatingTests(Base):
    def test_no_tasks_until_verified_when_pharmacy_is_on(self):
        order = self.med()
        self.assertEqual(order.status, "active")
        self.assertEqual(OrderTask.objects.filter(order=order).count(), 0)
        ot.ensure_tasks(self.org)
        self.assertEqual(OrderTask.objects.filter(order=order).count(), 0)
        self.assertEqual(self.action(order, action="verify").status_code, 200)
        self.assertGreater(OrderTask.objects.filter(order=order).count(), 0)

    def test_never_configured_organization_is_gated_too(self):
        # Decision 1: modules never configured means everything is on, Pharmacy included.
        self.org.enabled_modules = None
        self.org.save()
        order = self.med()
        self.assertEqual(OrderTask.objects.filter(order=order).count(), 0)
        self.assertEqual(self.action(order, action="verify").status_code, 200)
        self.assertGreater(OrderTask.objects.filter(order=order).count(), 0)

    def test_organization_that_chose_modules_without_pharmacy_is_not_gated(self):
        # Nobody there can reach the verification queue (the API is blocked), so orders are given as before.
        self.org.enabled_modules = ["clinical_documentation"]
        self.org.save()
        order = self.med()
        self.assertEqual(order.pharmacy_status, "pending_verification")
        self.assertGreater(OrderTask.objects.filter(order=order).count(), 0)

    def test_orders_verified_by_the_migration_are_not_held(self):
        order = self.med()
        Order.objects.filter(pk=order.pk).update(pharmacy_status="verified")
        order.refresh_from_db()
        self.assertFalse(ot.awaiting_pharmacy(order))
        self.assertGreater(ot.generate_tasks(order), 0)

    def test_prn_dose_blocked_while_pending(self):
        order = self.med(schedule={"frequency": "prn", "prn_reason": "pain"})
        with self.assertRaises(ot.TaskError) as ctx:
            ot.give_prn(order, self.nurse, {"reason": "pain 6/10"})
        self.assertIn("pharmacist", str(ctx.exception))


class VerifyActionTests(Base):
    def test_verify_records_pharmacist(self):
        order = self.med(self.morphine, {"dose": "2 mg"})
        r = self.action(order, action="verify", note="Pain score charted")
        self.assertEqual(r.status_code, 200, r.content)
        order.refresh_from_db()
        self.assertEqual((order.pharmacy_status, order.verified_by_id), ("verified", self.pharmacist.pk))
        self.assertIsNotNone(order.verified_at)
        event = order.events.get(event_type="pharmacy_verified")
        self.assertTrue(event.detail["dangerous_drug"])

    def test_high_severity_allergy_blocks_until_acknowledged(self):
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Penicillin", reaction="Hives", severity="severe")
        order = self.med()  # piperacillin is a penicillin
        r = self.action(order, action="verify")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["alerts"][0]["severity"], "high")
        key = r.json()["unacknowledged"][0]
        r = self.action(order, action="verify", acknowledged_alerts=[key])
        self.assertEqual(r.status_code, 409)  # still needs a reason
        r = self.action(order, action="verify", acknowledged_alerts=[key], reason="Tolerated pip-tazo 2025, ID consult agrees")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(PharmacyIntervention.objects.filter(order=order, type="alert_override").exists())

    def test_verify_with_change_updates_schedule_and_records_intervention(self):
        order = self.med()
        r = self.action(order, action="modify", reason="Renal dose adjustment", new_value={"dose": "2.25 g", "frequency": "q6h"})
        self.assertEqual(r.status_code, 200, r.content)
        order.refresh_from_db()
        self.assertEqual((order.schedule["dose"], order.schedule["frequency"], order.pharmacy_status), ("2.25 g", "q6h", "verified"))
        iv = PharmacyIntervention.objects.get(order=order, type="modify")
        self.assertEqual(iv.original_value, {"dose": "4.5 g", "frequency": "q8h"})
        self.assertEqual(iv.new_value["dose"], "2.25 g")
        self.assertEqual(iv.new_value["frequency"], "q6h")
        self.assertEqual(iv.pharmacist, self.pharmacist)
        # Decision 4: the prescriber is told what changed, in their inbox and on the order
        thread = MessageThread.objects.get(pk=iv.new_value["message_thread"])
        self.assertTrue(thread.participants.filter(user=self.doctor).exists())
        body = thread.messages.first().body
        self.assertIn("Dose: 4.5 g -> 2.25 g", body)
        self.assertIn("Renal dose adjustment", body)
        event = order.events.get(event_type="pharmacy_verified")
        self.assertEqual(event.detail["change"], {"dose": "2.25 g", "frequency": "q6h"})
        api = self.api(self.doctor).get(f"/api/orders/{order.pk}/").json()
        self.assertEqual((api["pharmacy_status"], api["verified_by_name"]), ("verified", "Andres Bonifacio"))
        self.assertEqual(api["schedule"]["dose"], "2.25 g")

    def test_modify_needs_a_real_change_and_a_reason(self):
        order = self.med()
        self.assertEqual(self.action(order, action="modify", reason="x", new_value={"dose": "4.5 g"}).status_code, 400)
        self.assertEqual(self.action(order, action="modify", new_value={"dose": "2.25 g"}).status_code, 400)
        self.assertEqual(self.action(order, action="modify", reason="x", new_value={"frequency": "q5h"}).status_code, 400)

    def test_clarify_messages_prescriber_and_holds(self):
        order = self.med()
        r = self.action(order, action="clarify", reason="Indication missing; confirm dose for weight 48 kg")
        self.assertEqual(r.status_code, 200, r.content)
        order.refresh_from_db()
        self.assertEqual(order.pharmacy_status, "on_hold_clarify")
        thread = MessageThread.objects.get(patient=self.patient)
        self.assertIn("Piperacillin", thread.subject)
        self.assertTrue(thread.participants.filter(user=self.doctor).exists())
        # a clarified order can then be verified
        self.assertEqual(self.action(order, action="verify").status_code, 200)

    def test_reject_needs_reason_cancels_and_messages_prescriber(self):
        order = self.med()
        self.assertEqual(self.action(order, action="reject").status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, "active")  # nothing changed without a reason
        self.assertEqual(self.action(order, action="reject", reason="Duplicate therapy").status_code, 200)
        order.refresh_from_db()
        # Decision 5: cancelled (not discontinued), never given
        self.assertEqual((order.status, order.pharmacy_status), ("cancelled", "rejected"))
        self.assertIsNone(order.discontinued_at)
        self.assertEqual(OrderTask.objects.filter(order=order).count(), 0)
        self.assertEqual(self.action(order, action="verify").status_code, 409)
        iv = PharmacyIntervention.objects.get(order=order, type="reject")
        self.assertEqual(iv.reason, "Duplicate therapy")
        thread = MessageThread.objects.get(pk=iv.new_value["message_thread"])
        self.assertTrue(thread.participants.filter(user=self.doctor).exists())
        self.assertIn("Duplicate therapy", thread.messages.first().body)
        self.assertIn("cancelled", thread.messages.first().body)
        event = order.events.get(event_type="pharmacy_rejected")
        self.assertEqual((event.from_status, event.to_status), ("active", "cancelled"))
        # still listed on the Rejected tab
        rows = self.api(self.pharmacist).get("/api/pharmacy/queue/?status=rejected").json()["results"]
        self.assertEqual([r["id"] for r in rows], [order.pk])

    def test_reject_cancels_tasks_already_laid_out(self):
        order = self.med()
        Order.objects.filter(pk=order.pk).update(pharmacy_status="verified")
        order.refresh_from_db()
        ot.generate_tasks(order)
        Order.objects.filter(pk=order.pk).update(pharmacy_status="on_hold_clarify")
        self.assertEqual(self.action(order, action="reject", reason="Allergy confirmed").status_code, 200)
        self.assertFalse(OrderTask.objects.filter(order=order, status="pending", due_at__gt=timezone.now()).exists())

    def test_non_medication_order_cannot_be_verified(self):
        lab = ow.sign_order(ow.create_draft_order(self.doctor, self.appt, self.cbc), self.doctor)
        self.assertEqual(self.action(lab, action="verify").status_code, 404)


class PermissionTests(Base):
    def test_who_may_read_and_act(self):
        order = self.med()
        for user, code in ((self.pharmacist, 200), (self.tech, 200), (self.admin, 200), (self.nurse, 403), (self.doctor, 403)):
            self.assertEqual(self.api(user).get("/api/pharmacy/queue/").status_code, code, user.role)
        self.assertEqual(self.action(order, self.tech, action="verify").status_code, 403)
        self.assertEqual(self.action(order, self.nurse, action="verify").status_code, 403)
        self.assertEqual(self.action(order, self.admin, action="verify").status_code, 200)

    def test_other_organization_cannot_see_or_act(self):
        order = self.med()
        rows = self.api(self.foreign_rph).get("/api/pharmacy/queue/").json()["results"]
        self.assertEqual(rows, [])
        self.assertEqual(self.action(order, self.foreign_rph, action="verify").status_code, 404)
        self.assertEqual(self.api(self.foreign_rph).get(f"/api/pharmacy/med-profile/{self.patient.pk}/").status_code, 404)

    def test_module_switched_off_blocks_the_api(self):
        self.org.enabled_modules = ["clinical_documentation"]
        self.org.save()
        self.assertEqual(self.api(self.pharmacist).get("/api/pharmacy/queue/").status_code, 403)


class QueueTests(Base):
    def test_stat_first_then_oldest_with_counts(self):
        old = self.med()
        Order.objects.filter(pk=old.pk).update(signed_at=timezone.now() - timedelta(hours=3))
        newer = self.med(self.para, {"dose": "500 mg", "route": "PO", "frequency": "q6h"})
        stat = self.med(self.morphine, {"dose": "2 mg", "frequency": "once"}, priority="stat")
        data = self.api(self.pharmacist).get("/api/pharmacy/queue/").json()
        self.assertEqual([r["id"] for r in data["results"]], [stat.pk, old.pk, newer.pk])
        self.assertEqual(data["counts"]["pending_verification"], 3)
        self.assertGreaterEqual(data["counts"]["past_goal"], 1)
        first = data["results"][0]
        self.assertTrue(first["dangerous_drug"])
        para = next(r for r in data["results"] if r["id"] == newer.pk)
        self.assertEqual(para["drug"]["display"], "Paracetamol (Biogesic)")

    def test_summary_returns_counts_only(self):
        self.med()
        data = self.api(self.pharmacist).get("/api/pharmacy/queue/?summary=1").json()
        self.assertEqual(data, {"counts": {"pending_verification": 1, "on_hold_clarify": 0, "verified": 0, "rejected": 0, "past_goal": 0}})

    def test_search_and_status_filter(self):
        o = self.med()
        self.action(o, action="verify")
        self.med(self.para, {"dose": "500 mg", "route": "PO"})
        c = self.api(self.pharmacist)
        self.assertEqual(len(c.get("/api/pharmacy/queue/?status=verified").json()["results"]), 1)
        self.assertEqual(len(c.get("/api/pharmacy/queue/?q=biogesic").json()["results"]), 1)
        self.assertEqual(len(c.get("/api/pharmacy/queue/?q=dela").json()["results"]), 1)

    def test_patient_list_and_med_profile(self):
        self.med()
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Sulfa")
        rows = self.api(self.tech).get("/api/pharmacy/patients/").json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Dela Cruz, Juan")
        self.assertEqual(rows[0]["counts"]["pending"], 1)
        self.assertEqual(rows[0]["allergies"][0]["substance"], "Sulfa")
        self.assertIsNone(rows[0]["crcl"])  # no weight or creatinine on the chart
        prof = self.api(self.pharmacist).get(f"/api/pharmacy/med-profile/{self.patient.pk}/").json()
        self.assertEqual(len(prof["orders"]), 1)


class CdsTests(Base):
    def test_cockcroft_gault(self):
        # (140 - 60) * 70 / (72 * 1.0) = 77.8; female x 0.85 = 66.1
        self.assertEqual(svc.cockcroft_gault(60, 70, 1.0, False), 77.8)
        self.assertEqual(svc.cockcroft_gault(60, 70, 1.0, True), 66.1)
        self.assertIsNone(svc.cockcroft_gault(16, 50, 0.8, False))
        self.assertIsNone(svc.cockcroft_gault(60, None, 1.0, False))

    def test_creatinine_in_umol_is_converted(self):
        self.assertAlmostEqual(float(svc.scr_mg_dl("88.4", "umol/L")), 1.0)
        self.assertAlmostEqual(float(svc.scr_mg_dl("176.8", "µmol/L")), 2.0)
        self.assertAlmostEqual(float(svc.scr_mg_dl("1.2", "mg/dL")), 1.2)

    def test_renal_flag_alert_below_30_for_other_drugs_is_moderate(self):
        order = self.med(self.para, {"dose": "500 mg", "route": "PO"})
        with mock.patch.object(svc, "renal_info", return_value={"renal_flag": True, "crcl": 22.5, "scr_mg_dl": 2.8, "weight_kg": 50}):
            alerts = svc.cds_alerts(order)
        self.assertEqual([a["key"] for a in alerts], ["renal"])
        self.assertEqual(alerts[0]["severity"], "moderate")

    def test_renally_cleared_drug_below_its_threshold_is_high(self):
        # Decision 2: piperacillin's threshold is 40 mL/min
        order = self.med()
        renal = {"renal_flag": False, "crcl": 35.0, "scr_mg_dl": 1.9, "weight_kg": 50}
        with mock.patch.object(svc, "renal_info", return_value=renal):
            alerts = svc.cds_alerts(order)
            self.assertEqual([(a["key"], a["severity"]) for a in alerts], [("renal", "high")])
            self.assertIn("below 40", alerts[0]["message"])
            # and it blocks verification until acknowledged with a reason
            self.assertEqual(self.action(order, action="verify").status_code, 409)
            r = self.action(order, action="verify", acknowledged_alerts=["renal"], reason="Extended infusion per ID protocol")
            self.assertEqual(r.status_code, 200, r.content)
        with mock.patch.object(svc, "renal_info", return_value={**renal, "crcl": 45.0}):
            self.assertEqual(svc.cds_alerts(order), [])

    def test_renal_drug_list_is_configurable(self):
        from .renal_drugs import renal_threshold

        # free-text drugs that match no formulary item use the list (the items decide for themselves)
        self.assertEqual(renal_threshold("Enoxaparin 40 mg SC"), ("enoxaparin", 30.0))
        self.assertEqual(renal_threshold("Ibuprofen 400 mg"), (None, None))
        with override_settings(PHARMACY_RENAL_DRUGS={"ibuprofen": 20}):
            self.assertEqual(renal_threshold("Ibuprofen 400 mg"), ("ibuprofen", 20.0))
            self.assertEqual(renal_threshold("Enoxaparin 40 mg SC"), (None, None))

    def test_dangerous_drug_list_carries_review_note(self):
        from . import dangerous_drugs

        self.assertIn("REVIEW REQUIRED", dangerous_drugs.__doc__)
        self.assertIn("PDEA", dangerous_drugs.__doc__)

    def test_goal_times_default_and_configurable(self):
        stat = self.med(self.morphine, {"dose": "2 mg", "frequency": "once"}, priority="stat")
        routine = self.med()
        self.assertEqual((svc.goal_minutes(stat), svc.goal_minutes(routine)), (15, 60))
        Order.objects.filter(pk=stat.pk).update(signed_at=timezone.now() - timedelta(minutes=20))
        stat.refresh_from_db()
        self.assertTrue(svc.past_goal(stat))
        with override_settings(PHARMACY_VERIFY_GOAL_MINUTES={"stat": 30, "routine": "bad"}):
            self.assertEqual((svc.goal_minutes(stat), svc.goal_minutes(routine)), (30, 60))
            self.assertFalse(svc.past_goal(stat))
            row = next(r for r in self.api(self.pharmacist).get("/api/pharmacy/queue/").json()["results"] if r["id"] == stat.pk)
            self.assertEqual((row["goal_minutes"], row["past_goal"]), (30, False))
        row = next(r for r in self.api(self.pharmacist).get("/api/pharmacy/queue/").json()["results"] if r["id"] == stat.pk)
        self.assertTrue(row["past_goal"])

    def test_dangerous_drug_list(self):
        self.assertTrue(is_dangerous_drug("Morphine sulfate 2 mg IV"))
        self.assertTrue(is_dangerous_drug("Midazolam 1 mg/mL"))
        self.assertFalse(is_dangerous_drug("Tramadol 50 mg capsule"))
        self.assertTrue(is_dangerous_drug("Anything", Orderable(is_dangerous_drug=True)))
        with override_settings(PHARMACY_DANGEROUS_DRUGS=["tramadol"]):
            self.assertTrue(is_dangerous_drug("Tramadol 50 mg capsule"))
            self.assertFalse(is_dangerous_drug("Morphine sulfate 2 mg IV"))

    def test_generic_name_first(self):
        self.assertEqual(svc.drug_names("Paracetamol 500 mg", self.para)["display"], "Paracetamol (Biogesic)")
        self.assertEqual(svc.drug_names("Augmentin 625 mg tablet")["display"], "Amoxicillin (Augmentin)")
        self.assertEqual(svc.drug_names("Cefuroxime 500 mg")["display"], "Cefuroxime 500 mg")
