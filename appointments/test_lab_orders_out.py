"""Sending lab orders: message content, which orders are due, pickup and confirmation, cancellations, gating."""

import json
from datetime import date, timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization

from . import lab_hl7, lab_intake, lab_orders_out
from . import orders_workflow as ow
from .models import Appointment, LabInterfaceConnection, LabOutboundMessage, Order, Orderable

User = get_user_model()
URL = "/api/lab-interface/orders/"
ACK = "/api/lab-interface/orders/ack/"


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A", lab_interface_enabled=True)
        self.other = Organization.objects.create(name="Clinic B", lab_interface_enabled=True)
        mk = lambda u, role, org, **kw: User.objects.create_user(
            username=u, email=f"{u}@x.com", password="pw-12345-xyz", role=role, organization=org, **kw)
        self.doctor = mk("doc", "doctor", self.org, first_name="Dana", last_name="Lee", npi="1234567893")
        self.patient = mk("jane", "patient", self.org, first_name="Jane", last_name="Doe")
        prof = self.patient.patient_profile
        prof.date_of_birth, prof.organization, prof.legal_sex, prof.address = date(1980, 1, 15), self.org, "F", "1 Main St"
        prof.save()
        self.mrn = prof.mrn
        self.conn = self.connect(self.org, "Quest", orders=True)
        self.client = APIClient()
        self.bmp = Orderable.objects.create(code="bmp", name="Basic metabolic panel", category="laboratory",
                                            code_system="loinc", external_code="24320-4")
        self.xray = Orderable.objects.create(code="cxr", name="Chest x-ray", category="imaging")

    def connect(self, org, name, orders=False):
        key = f"lab_key_{name}_{org.pk}"
        c = LabInterfaceConnection.objects.create(
            organization=org, name=name, lab_name=name + " Diagnostics", key_hash=lab_intake.hash_key(key),
            key_prefix=key[:8], send_orders=orders)
        c.key = key
        return c

    def order(self, orderable=None, sign=True, **kw):
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor,
                                          title="Visit", appointment_datetime=timezone.now() + timedelta(days=1))
        o = ow.create_draft_order(self.doctor, appt, orderable or self.bmp, **kw)
        if sign:
            ow.sign_order(o, self.doctor)
            o.refresh_from_db()
        return o

    def pull(self, conn=None, **params):
        conn = conn or self.conn
        return self.client.get(URL, params, HTTP_X_INTERFACE_KEY=conn.key)

    def ack(self, body, conn=None, ctype="application/json"):
        conn = conn or self.conn
        data = json.dumps(body) if isinstance(body, dict) else body
        return self.client.post(ACK, data=data, content_type=ctype, HTTP_X_INTERFACE_KEY=conn.key)


class BuildTests(Base):
    def test_hl7_order_content(self):
        o = self.order(priority="stat", indication="Fatigue", diagnosis_codes=[{"code": "R53.83", "description": "Other fatigue"}])
        text = lab_orders_out.build_hl7(o, self.conn, "NW", "OUT-1")
        segs = text.strip("\r").split("\r")
        self.assertEqual([s[:3] for s in segs], ["MSH", "PID", "ORC", "OBR", "TQ1", "DG1", "NTE"])
        self.assertIn("ORM^O01|OUT-1", segs[0])
        self.assertIn(f"{self.mrn}^^^POWER^MR", segs[1])
        self.assertIn("Doe^Jane", segs[1])
        self.assertIn("19800115|F", segs[1])
        self.assertTrue(segs[2].startswith(f"ORC|NW|{o.placer_order_number}"))
        self.assertIn("1234567893^Lee^Dana^^^^^^NPI", segs[2])
        self.assertIn("24320-4^Basic metabolic panel^LN", segs[3])
        self.assertTrue(segs[4].endswith("|S"))
        self.assertIn("R53.83^Other fatigue^I10", segs[5])
        self.assertIn("Indication: Fatigue", segs[6])
        # the message we send is one our own reader understands in the other direction
        lab_hl7.Segment(segs[1], lab_hl7.Delims(segs[0]))

    def test_special_characters_are_escaped(self):
        o = self.order(indication="pain | back & leg ^ ~")
        text = lab_orders_out.build_hl7(o, self.conn, "NW", "OUT-1")
        nte = [s for s in text.split("\r") if s.startswith("NTE")][0]
        self.assertEqual(nte.count("|"), 3)
        self.assertNotIn("&", nte.replace("\\T\\", ""))

    def test_local_code_when_no_external_code_and_provider_without_npi(self):
        self.doctor.npi = ""
        self.doctor.save()
        o = self.order(Orderable.objects.create(code="local_lab", name="Local test", category="laboratory"))
        seg = [s for s in lab_orders_out.build_hl7(o, self.conn, "NW", "X").split("\r") if s.startswith("OBR")][0]
        self.assertIn("local_lab^Local test^L", seg)
        self.assertIn(f"{self.doctor.pk}^Lee^Dana^^^^^^POWER", seg)

    def test_cancel_uses_ca(self):
        o = self.order()
        self.assertIn("ORC|CA|", lab_orders_out.build_hl7(o, self.conn, "CA", "OUT-9"))

    def test_fhir_bundle(self):
        o = self.order(priority="urgent", diagnosis_codes=[{"code": "R53.83", "description": "Other fatigue"}])
        b = json.loads(lab_orders_out.build_fhir(o, self.conn, "NW", "OUT-1"))
        types = [e["resource"]["resourceType"] for e in b["entry"]]
        self.assertEqual(types, ["Patient", "Practitioner", "ServiceRequest"])
        sr = b["entry"][2]["resource"]
        self.assertEqual((sr["status"], sr["intent"], sr["priority"]), ("active", "order", "urgent"))
        self.assertEqual(sr["code"]["coding"][0], {"system": "http://loinc.org", "code": "24320-4", "display": "Basic metabolic panel"})
        self.assertEqual(sr["identifier"][0]["value"], o.placer_order_number)
        self.assertEqual(b["entry"][1]["resource"]["identifier"][0]["system"], "http://hl7.org/fhir/sid/us-npi")
        cancelled = json.loads(lab_orders_out.build_fhir(o, self.conn, "CA", "OUT-2"))
        self.assertEqual(cancelled["entry"][2]["resource"]["status"], "revoked")


class PullTests(Base):
    def test_only_signed_lab_orders_are_offered(self):
        due = self.order()
        self.order(sign=False)  # draft
        self.order(self.xray)  # not a lab order
        body = self.pull().json()
        self.assertEqual([m["order"] for m in body["messages"]], [due.pk])
        m = body["messages"][0]
        self.assertEqual((m["action"], m["placer_order_number"]), ("NW", due.placer_order_number))
        self.assertTrue(m["body"].startswith("MSH|"))
        due.refresh_from_db()
        self.assertEqual(due.interface_status, "sent")
        self.assertIn("interface_sent", [e.event_type for e in due.events.all()])

    def test_unconfirmed_messages_are_offered_again_and_not_duplicated(self):
        due = self.order()
        first = self.pull().json()["messages"]
        second = self.pull().json()["messages"]
        self.assertEqual([m["control_id"] for m in first], [m["control_id"] for m in second])
        self.assertEqual(LabOutboundMessage.objects.count(), 1)
        self.assertEqual(LabOutboundMessage.objects.get().delivery_count, 2)

    def test_confirmed_messages_are_not_offered_again(self):
        due = self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        self.assertEqual(self.ack({"control_id": cid, "status": "accepted"}).status_code, 200)
        self.assertEqual(self.pull().json()["count"], 0)
        due.refresh_from_db()
        self.assertEqual(due.interface_status, "acknowledged")

    def test_hl7_ack_is_accepted(self):
        due = self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        r = self.ack(f"MSH|^~\\&|QUEST|Q|POWER|P|2026||ACK^O01|1|P|2.5.1\rMSA|AA|{cid}\r", ctype="text/plain")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(LabOutboundMessage.objects.get().status, "acknowledged")

    def test_rejection_marks_the_order_with_the_reason(self):
        due = self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        self.ack(f"MSH|^~\\&|Q|Q|P|P|2026||ACK|1|P|2.5.1\rMSA|AR|{cid}|Unknown test code\r", ctype="text/plain")
        due.refresh_from_db()
        self.assertEqual(due.interface_status, "error")
        self.assertIn("Unknown test code", due.interface_message)
        self.assertEqual(self.pull().json()["count"], 0)  # rejected is not retried blindly

    def test_repeat_confirmation_is_harmless_and_unknown_is_404(self):
        self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        self.ack({"control_id": cid, "status": "accepted"})
        self.assertEqual(self.ack({"control_id": cid, "status": "rejected"}).status_code, 200)
        self.assertEqual(LabOutboundMessage.objects.get().status, "acknowledged")
        self.assertEqual(self.ack({"control_id": "NOPE", "status": "accepted"}).status_code, 404)
        self.assertEqual(self.ack({"nonsense": 1}).status_code, 400)

    def test_fhir_format(self):
        self.order()
        m = self.pull(fmt="fhir").json()["messages"][0]
        self.assertEqual(json.loads(m["body"])["resourceType"], "Bundle")
        self.assertEqual(self.pull(fmt="xml").status_code, 400)

    def test_order_stopped_before_pickup_is_withdrawn_not_sent(self):
        o = self.order()
        self.pull()  # creates + delivers
        LabOutboundMessage.objects.update(status="pending")  # as if it had not been picked up
        ow.discontinue_order(o, self.doctor, "Entered by mistake")
        self.assertEqual(self.pull().json()["count"], 0)
        self.assertEqual(LabOutboundMessage.objects.get().status, "cancelled")

    def test_order_stopped_after_the_lab_has_it_sends_a_cancellation(self):
        o = self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        self.ack({"control_id": cid, "status": "accepted"})
        ow.discontinue_order(o, self.doctor, "Patient declined")
        msgs = self.pull().json()["messages"]
        self.assertEqual([m["action"] for m in msgs], ["CA"])
        self.assertIn("ORC|CA|", msgs[0]["body"])
        # asking again does not create a second cancellation
        self.pull()
        self.assertEqual(LabOutboundMessage.objects.filter(action="CA").count(), 1)

    def test_discontinued_order_that_never_went_out_is_not_sent(self):
        o = self.order()
        ow.discontinue_order(o, self.doctor, "Mistake")
        self.assertEqual(self.pull().json()["count"], 0)
        self.assertEqual(LabOutboundMessage.objects.count(), 0)


class GatingTests(Base):
    def test_key_required(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.assertEqual(self.client.get(URL, HTTP_X_INTERFACE_KEY="bad").status_code, 401)
        self.assertEqual(self.client.post(ACK, data="{}", content_type="application/json").status_code, 401)

    def test_add_on_off_gives_403_and_nothing_is_queued(self):
        self.order()
        self.org.lab_interface_enabled = False
        self.org.save()
        self.assertEqual(self.pull().status_code, 403)
        self.assertEqual(LabOutboundMessage.objects.count(), 0)

    def test_results_only_connection_cannot_pull_orders(self):
        results_only = self.connect(self.org, "Labcorp", orders=False)
        self.order()
        self.assertEqual(self.pull(results_only).status_code, 403)

    def test_another_clinics_connection_never_sees_these_orders(self):
        self.order()
        other = self.connect(self.other, "Quest", orders=True)
        self.assertEqual(self.pull(other).json()["count"], 0)

    def test_cannot_confirm_another_connections_message(self):
        self.order()
        cid = self.pull().json()["messages"][0]["control_id"]
        other = self.connect(self.other, "Quest", orders=True)
        self.assertEqual(self.ack({"control_id": cid, "status": "accepted"}, conn=other).status_code, 404)
        self.assertEqual(LabOutboundMessage.objects.get().status, "delivered")

    def test_post_to_pull_and_get_to_ack_not_allowed(self):
        self.assertEqual(self.client.post(URL, HTTP_X_INTERFACE_KEY=self.conn.key).status_code, 405)
        self.assertEqual(self.client.get(ACK, HTTP_X_INTERFACE_KEY=self.conn.key).status_code, 405)


class CommandTests(Base):
    def test_one_ordering_connection_per_clinic(self):
        second = self.connect(self.org, "Labcorp")
        with self.assertRaises(CommandError):
            call_command("lab_connection", "orders", "--id", str(second.pk), "--on", stdout=StringIO())
        call_command("lab_connection", "orders", "--id", str(self.conn.pk), "--off", stdout=StringIO())
        call_command("lab_connection", "orders", "--id", str(second.pk), "--on", stdout=StringIO())
        second.refresh_from_db()
        self.assertTrue(second.send_orders)
        with self.assertRaises(CommandError):
            call_command("lab_connection", "orders", "--id", str(second.pk), stdout=StringIO())
