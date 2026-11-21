"""POWER Pharmacy, Phase 2: the in-house outpatient fill workflow, final check, labels, dangerous drugs, pricing, partials."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments.models import Pharmacy, PrescriberProfile, Prescription
from users.models import Organization

from . import fills as fx
from .models import FillEvent, PatientDiscountId, PharmacistProfile, PharmacyPrice, PrescriptionFill

User = get_user_model()
NEXT_YEAR = (date.today() + timedelta(days=365)).isoformat()


def mk(username, role, org, first="", last=""):
    return User.objects.create_user(
        username=username, email=f"{username}@example.ph", password="pw-12345-xyz", role=role, organization=org,
        first_name=first, last_name=last,
    )


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Klinika ng Bayan", enabled_modules=["clinical_documentation", "pharmacy"])
        self.other = Organization.objects.create(name="Iloilo Family Clinic", enabled_modules=["clinical_documentation", "pharmacy"])
        self.doctor = mk("doc", "doctor", self.org, "Jose", "Rizal")
        PrescriberProfile.objects.create(user=self.doctor, license_number="0123456")
        self.rph = mk("rph", "pharmacist", self.org, "Andres", "Bonifacio")
        self.rph2 = mk("rph2", "pharmacist", self.org, "Apolinario", "Mabini")
        self.tech = mk("tech", "pharmacy_tech", self.org, "Gabriela", "Silang")
        self.admin = mk("adm", "admin", self.org)
        self.nurse = mk("nurse", "nurse", self.org, "Maria Clara", "Santos")
        self.foreign = mk("rph3", "pharmacist", self.other)
        self.patient = mk("pat", "patient", self.org, "Juan", "Dela Cruz")
        self.lola = mk("lola", "patient", self.org, "Corazon", "Reyes")
        self.inhouse = Pharmacy.objects.create(organization=self.org, name="Botika ng Klinika", address="12 Rizal Ave", city="Quezon City",
                                               phone="(02) 8123 4567", is_in_house=True, fda_lto_number="LTO-3000001234567")
        self.outside = Pharmacy.objects.create(organization=self.org, name="Mercury Drug Cubao", city="Quezon City")
        PharmacyPrice.objects.create(organization=self.org, drug_name="Amoxicillin", unit="capsule", unit_price=Decimal("11.20"))
        PharmacyPrice.objects.create(organization=self.org, drug_name="Metformin", unit="tablet", unit_price=Decimal("5.00"), vat_exempt=True)
        PharmacyPrice.objects.create(organization=self.org, drug_name="Morphine sulfate", unit="tablet", unit_price=Decimal("38.00"))
        PharmacistProfile.objects.create(user=self.rph, prc_license_number="0045678")

    def rx(self, drug="Amoxicillin (Amoxil) 500 mg", patient=None, quantity=21, refills=0, pharmacy=None, **extra):
        values = dict(
            organization=self.org, patient=patient or self.patient, prescriber=self.doctor, created_by=self.doctor,
            drug_name=drug, strength="500 mg", form="capsule", dose="1 capsule", route="PO", frequency="tid",
            sig="Take 1 capsule by mouth three times daily for 7 days.", quantity=Decimal(quantity), quantity_unit="capsules",
            refills=refills, pharmacy=pharmacy or self.inhouse, status="signed", signed_by=self.doctor, signed_at=timezone.now(),
        )
        values.update(extra)
        return Prescription.objects.create(**values)

    def api(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def do(self, fill, action, user=None, **body):
        return self.api(user or self.tech).post(f"/api/pharmacy/fills/{fill.pk}/action/", {"action": action, **body}, format="json")

    def fill_for(self, rx):
        fx.ensure_fills(self.org)
        return PrescriptionFill.objects.filter(prescription=rx).order_by("-id").first()

    def to_ready(self, rx, quantity=None, checker=None):
        fill = self.fill_for(rx)
        self.assertEqual(self.do(fill, "start_entry").status_code, 200)
        body = {"quantity": str(quantity)} if quantity is not None else {}
        self.assertEqual(self.do(fill, "enter", **body).status_code, 200)
        r = self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg", lot_number="A1234", expiry_date=NEXT_YEAR)
        self.assertEqual(r.status_code, 200, r.content)
        r = self.do(fill, "check", checker or self.rph, product_verified=True, strength_verified=True, quantity_verified=True)
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        return fill


class QueueTests(Base):
    def test_signed_in_house_prescriptions_arrive_as_received(self):
        mine = self.rx()
        self.rx(pharmacy=self.outside)  # sent elsewhere: not ours to fill
        self.rx(status="draft")
        data = self.api(self.tech).get("/api/pharmacy/fills/").json()
        self.assertEqual([r["prescription"] for r in data["results"]], [mine.pk])
        self.assertEqual(data["counts"]["received"], 1)
        self.assertEqual(set(data["counts"]), {"received", "data_entry", "filling", "final_check", "ready", "dispensed", "on_hold"})
        row = data["results"][0]
        self.assertEqual(row["drug"]["display"], "Amoxicillin (Amoxil)")  # generic first (RA 6675 / RA 9502)
        self.assertEqual(row["patient"]["name"], "Dela Cruz, Juan")
        # opening the queue again does not duplicate
        self.api(self.tech).get("/api/pharmacy/fills/")
        self.assertEqual(PrescriptionFill.objects.filter(prescription=mine).count(), 1)

    def test_counts_move_with_the_stages(self):
        rx = self.rx()
        fill = self.fill_for(rx)
        self.do(fill, "start_entry")
        counts = self.api(self.tech).get("/api/pharmacy/fills/?summary=1").json()["counts"]
        self.assertEqual((counts["received"], counts["data_entry"]), (0, 1))

    def test_hold_needs_a_reason_and_release_returns_to_the_stage(self):
        fill = self.fill_for(self.rx())
        self.do(fill, "start_entry")
        self.assertEqual(self.do(fill, "hold").status_code, 400)
        self.assertEqual(self.do(fill, "hold", reason="Out of stock; supplier delivery Friday").status_code, 200)
        fill.refresh_from_db()
        self.assertEqual((fill.stage, fill.held_from), ("on_hold", "data_entry"))
        self.assertEqual(self.api(self.tech).get("/api/pharmacy/fills/?stage=on_hold").json()["results"][0]["hold_reason"],
                         "Out of stock; supplier delivery Friday")
        self.assertEqual(self.do(fill, "release").status_code, 200)
        fill.refresh_from_db()
        self.assertEqual(fill.stage, "data_entry")

    def test_cancelled_prescription_puts_its_fill_on_hold(self):
        rx = self.rx()
        fill = self.fill_for(rx)
        Prescription.objects.filter(pk=rx.pk).update(status="cancelled")
        fx.ensure_fills(self.org)
        fill.refresh_from_db()
        self.assertEqual(fill.stage, "on_hold")
        self.assertIn("cancelled", fill.hold_reason)
        self.assertEqual(self.do(fill, "release").status_code, 409)

    def test_permissions_and_scoping(self):
        fill = self.fill_for(self.rx())
        self.assertEqual(self.api(self.nurse).get("/api/pharmacy/fills/").status_code, 403)
        self.assertEqual(self.do(fill, "start_entry", self.nurse).status_code, 403)
        self.assertEqual(self.api(self.foreign).get("/api/pharmacy/fills/").json()["results"], [])
        self.assertEqual(self.do(fill, "start_entry", self.foreign).status_code, 404)


class StageTests(Base):
    def test_each_stage_records_who_and_when(self):
        fill = self.to_ready(self.rx())
        self.assertEqual(fill.stage, "ready")
        self.assertEqual((fill.entered_by, fill.filled_by, fill.checked_by), (self.tech, self.tech, self.rph))
        self.assertTrue(all([fill.entered_at, fill.filled_at, fill.checked_at]))
        self.assertEqual([e.event_type for e in FillEvent.objects.filter(fill=fill)],
                         ["received", "data_entry_started", "data_entered", "filled", "checked"])
        detail = self.api(self.rph).get(f"/api/pharmacy/fills/{fill.pk}/").json()
        self.assertEqual(detail["checked"]["name"], "Bonifacio, Andres")

    def test_only_a_pharmacist_does_the_final_check(self):
        fill = self.fill_for(self.rx())
        self.do(fill, "start_entry")
        self.do(fill, "enter")
        self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg", lot_number="A1", expiry_date=NEXT_YEAR)
        for user in (self.tech, self.admin):
            r = self.do(fill, "check", user, product_verified=True, strength_verified=True, quantity_verified=True)
            self.assertEqual(r.status_code, 403, user.role)

    def test_final_check_needs_product_strength_and_quantity(self):
        fill = self.fill_for(self.rx())
        self.do(fill, "start_entry")
        self.do(fill, "enter")
        self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg", lot_number="A1", expiry_date=NEXT_YEAR)
        r = self.do(fill, "check", self.rph, product_verified=True, strength_verified=True)
        self.assertEqual(r.status_code, 400)
        r = self.do(fill, "check_fail", self.rph)
        self.assertEqual(r.status_code, 400)
        r = self.do(fill, "check_fail", self.rph, reason="Wrong strength picked: 250 mg")
        self.assertEqual(r.status_code, 200)
        fill.refresh_from_db()
        self.assertEqual((fill.stage, fill.check_note), ("filling", "Wrong strength picked: 250 mg"))

    def test_filling_needs_lot_and_unexpired_product(self):
        fill = self.fill_for(self.rx())
        self.do(fill, "start_entry")
        self.do(fill, "enter")
        self.assertEqual(self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg").status_code, 400)
        r = self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg", lot_number="A1", expiry_date="2020-01-01")
        self.assertEqual(r.status_code, 400)
        self.assertIn("expired", r.json()["detail"])

    def test_dispense_records_counseling(self):
        fill = self.to_ready(self.rx())
        self.assertEqual(self.do(fill, "dispense", self.rph).status_code, 400)  # counseling must be recorded
        r = self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=False)
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        self.assertEqual((fill.stage, fill.dispensed_by, fill.counseling_offered, fill.counseling_accepted), ("dispensed", self.rph, True, False))
        self.assertEqual(Prescription.objects.get(pk=fill.prescription_id).status, "sent")

    def test_steps_out_of_order_are_refused(self):
        fill = self.fill_for(self.rx())
        self.assertEqual(self.do(fill, "fill", product_name="x").status_code, 409)
        self.assertEqual(self.do(fill, "dispense", self.rph, counseling_offered=True).status_code, 409)


class LabelTests(Base):
    def test_label_prints_generic_first_and_the_pharmacy_details(self):
        fill = self.to_ready(self.rx())
        label = self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/label/").json()
        self.assertEqual(label["drug_line"], "Amoxicillin (Amoxil) 500 mg capsule")
        self.assertEqual((label["generic_name"], label["brand_name"]), ("Amoxicillin", "Amoxil"))
        self.assertEqual(label["sig"], "Take 1 capsule by mouth three times daily for 7 days.")
        self.assertEqual((label["quantity"], label["quantity_unit"]), ("21", "capsules"))
        self.assertEqual(label["prescriber"], "Rizal, Jose")
        self.assertEqual(label["prescriber_license"], "0123456")
        self.assertEqual(label["pharmacy_name"], "Botika ng Klinika")
        self.assertEqual(label["fda_lto_number"], "LTO-3000001234567")
        self.assertEqual(label["fill_date"], timezone.localdate().isoformat())

    def test_no_label_before_filling(self):
        fill = self.fill_for(self.rx())
        self.assertEqual(self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/label/").status_code, 409)


class DangerousDrugTests(Base):
    def setUp(self):
        super().setUp()
        self.dd = self.rx("Morphine sulfate 10 mg tablet", quantity=10, refills=2)

    def test_dispense_needs_yellow_rx_serial_and_s2_and_a_pharmacist(self):
        fill = self.to_ready(self.dd)
        r = self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn("yellow prescription", r.json()["detail"])
        r = self.do(fill, "dispense", self.tech, counseling_offered=True, yellow_rx_serial="DDB-2026-0001234", s2_number="S2-12345")
        self.assertEqual(r.status_code, 403)
        r = self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=True,
                    yellow_rx_serial="DDB-2026-0001234", s2_number="S2-12345")
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        self.assertEqual((fill.yellow_rx_serial, fill.s2_number), ("DDB-2026-0001234", "S2-12345"))
        event = fill.events.get(event_type="dispensed")
        self.assertEqual((event.detail["yellow_rx_serial"], event.detail["s2_number"]), ("DDB-2026-0001234", "S2-12345"))

    def test_dangerous_drug_is_never_refilled(self):
        fill = self.to_ready(self.dd)
        self.do(fill, "dispense", self.rph, counseling_offered=False, yellow_rx_serial="DDB-1", s2_number="S2-1")
        r = self.api(self.rph).post(f"/api/pharmacy/prescriptions/{self.dd.pk}/refill/")
        self.assertEqual(r.status_code, 409)
        self.assertIn("new prescription", r.json()["detail"])


class RefillTests(Base):
    def test_refill_counts_down_and_stops(self):
        rx = self.rx(refills=1)
        fill = self.to_ready(rx)
        self.do(fill, "dispense", self.rph, counseling_offered=False)
        r = self.api(self.tech).post(f"/api/pharmacy/prescriptions/{rx.pk}/refill/")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["fill_number"], r.json()["is_refill"]), (2, True))
        self.assertEqual(self.api(self.tech).post(f"/api/pharmacy/prescriptions/{rx.pk}/refill/").status_code, 409)  # in progress
        refill = PrescriptionFill.objects.get(pk=r.json()["id"])
        self.do(self.to_ready_existing(refill), "dispense", self.rph, counseling_offered=False)
        r = self.api(self.tech).post(f"/api/pharmacy/prescriptions/{rx.pk}/refill/")
        self.assertEqual(r.status_code, 409)
        self.assertIn("No refills", r.json()["detail"])

    def to_ready_existing(self, fill):
        self.do(fill, "start_entry")
        self.do(fill, "enter")
        self.do(fill, "fill", product_name="Amoxil", product_strength="500 mg", lot_number="B2", expiry_date=NEXT_YEAR)
        self.do(fill, "check", self.rph, product_verified=True, strength_verified=True, quantity_verified=True)
        return fill


class PartialFillTests(Base):
    def test_partial_fill_leaves_a_balance_that_can_be_completed(self):
        rx = self.rx(quantity=30)
        fill = self.to_ready(rx, quantity=12)
        self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=True)
        data = self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/").json()
        self.assertEqual((data["quantity"], data["balance"], data["is_partial"]), ("12", "18", True))
        r = self.api(self.tech).post(f"/api/pharmacy/fills/{fill.pk}/complete-partial/")
        self.assertEqual(r.status_code, 201, r.content)
        rest = PrescriptionFill.objects.get(pk=r.json()["id"])
        self.assertEqual(rest.fill_number, 1)
        self.do(rest, "start_entry")
        self.assertEqual(self.do(rest, "enter", quantity="20").status_code, 400)  # more than is owed
        self.assertEqual(self.do(rest, "enter").status_code, 200)  # defaults to the balance
        rest.refresh_from_db()
        self.assertEqual(rest.quantity, Decimal("18"))
        self.assertEqual(self.api(self.tech).post(f"/api/pharmacy/fills/{fill.pk}/complete-partial/").status_code, 409)


class PricingTests(Base):
    def test_compute_price_regular_and_discounted(self):
        regular = fx.compute_price(Decimal("11.20"), Decimal("21"))
        self.assertEqual((regular["gross"], regular["total"]), (Decimal("235.20"), Decimal("235.20")))
        # senior / PWD: VAT removed (235.20 / 1.12 = 210.00), then 20% off (42.00) -> 168.00
        sc = fx.compute_price(Decimal("11.20"), Decimal("21"), discounted=True)
        self.assertEqual((sc["vat_exempt"], sc["discount"], sc["total"]), (Decimal("25.20"), Decimal("42.00"), Decimal("168.00")))
        # an item that is already VAT-exempt only gets the 20%
        ex = fx.compute_price(Decimal("5.00"), Decimal("60"), vat_exempt_item=True, discounted=True)
        self.assertEqual((ex["vat_exempt"], ex["discount"], ex["total"]), (Decimal("0.00"), Decimal("60.00"), Decimal("240.00")))

    def test_senior_discount_applied_and_id_recorded_on_dispense(self):
        rx = self.rx(patient=self.lola)
        r = self.api(self.tech).post(f"/api/pharmacy/patients/{self.lola.pk}/discount-ids/",
                                     {"kind": "senior", "id_number": "QC-SC-2019-004512", "issued_by": "OSCA Quezon City"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        fill = self.to_ready(rx)
        quote = self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/").json()["quote"]
        self.assertEqual((quote["currency"], quote["total"], quote["discount_kind"]), ("PHP", "168.00", "senior"))
        r = self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=True, discount_kind="senior")
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        self.assertEqual((fill.total_amount, fill.discount_amount, fill.discount_id_number), (Decimal("168.00"), Decimal("42.00"), "QC-SC-2019-004512"))

    def test_no_discount_without_an_id_on_file(self):
        fill = self.to_ready(self.rx())
        r = self.do(fill, "dispense", self.rph, counseling_offered=True, discount_kind="pwd")
        self.assertEqual(r.status_code, 400)
        r = self.do(fill, "dispense", self.rph, counseling_offered=True)
        fill.refresh_from_db()
        self.assertEqual((fill.total_amount, fill.discount_kind), (Decimal("235.20"), ""))

    def test_price_table_is_configurable_by_pharmacist_or_admin(self):
        c = self.api(self.rph)
        r = c.post("/api/pharmacy/prices/", {"drug_name": "Losartan 50 mg", "unit": "tablet", "unit_price": "18.50"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(c.patch(f"/api/pharmacy/prices/{r.json()['id']}/", {"unit_price": "17.75"}, format="json").json()["unit_price"], "17.75")
        self.assertEqual(self.api(self.tech).post("/api/pharmacy/prices/", {"drug_name": "X", "unit_price": "1"}, format="json").status_code, 403)
        self.assertEqual(c.post("/api/pharmacy/prices/", {"drug_name": "X", "unit_price": "abc"}, format="json").status_code, 400)
        names = [p["drug_name"] for p in self.api(self.tech).get("/api/pharmacy/prices/").json()["results"]]
        self.assertIn("Losartan 50 mg", names)

    def test_longest_matching_price_wins(self):
        PharmacyPrice.objects.create(organization=self.org, drug_name="Amoxicillin 500 mg", unit="capsule", unit_price=Decimal("12.00"))
        self.assertEqual(fx.price_for(self.org.pk, self.rx()).unit_price, Decimal("12.00"))


class MedProfileTests(Base):
    def test_dispensing_history_on_the_med_profile(self):
        fill = self.to_ready(self.rx())
        self.do(fill, "dispense", self.rph, counseling_offered=True, counseling_accepted=True)
        prof = self.api(self.rph).get(f"/api/pharmacy/med-profile/{self.patient.pk}/").json()
        self.assertEqual(len(prof["dispensing"]), 1)
        row = prof["dispensing"][0]
        self.assertEqual((row["rx_number"], row["quantity"], row["dispensed"]["name"]), (f"RX-{fill.prescription_id:06d}", "21", "Bonifacio, Andres"))

    def test_in_house_pharmacy_fields_on_the_directory(self):
        r = self.api(self.admin).post("/api/pharmacies/", {"name": "Botika 2", "is_in_house": True, "fda_lto_number": "LTO-30000099"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["is_in_house"], r.json()["fda_lto_number"]), (True, "LTO-30000099"))


class FollowUpTests(Base):
    """Jessie's answers to the Phase 2 questions."""

    def test_1_dangerous_yellow_rx_reaches_the_queue_with_serial_and_s2(self):
        rx = self.rx("Morphine sulfate 10 mg tablet", quantity=10, is_yellow_rx=True, yellow_rx_serial="DDB-2026-0007777", s2_number="S2-24680")
        fill = self.fill_for(rx)
        self.assertEqual((fill.stage, fill.yellow_rx_serial, fill.s2_number), ("received", "DDB-2026-0007777", "S2-24680"))

    def test_2_only_a_pharmacist_dispenses_any_drug(self):
        fill = self.to_ready(self.rx())
        for user in (self.tech, self.admin):
            r = self.do(fill, "dispense", user, counseling_offered=True)
            self.assertEqual(r.status_code, 403, user.role)
            self.assertIn("pharmacist", r.json()["detail"])
        # assistants still do data entry and filling (to_ready above did both as the assistant)
        self.assertEqual((fill.entered_by, fill.filled_by), (self.tech, self.tech))

    def _filled_by(self, user):
        fill = self.fill_for(self.rx())
        self.do(fill, "start_entry", user)
        self.do(fill, "enter", user)
        self.do(fill, "fill", user, product_name="Amoxil", product_strength="500 mg", lot_number="A1", expiry_date=NEXT_YEAR)
        return fill

    def test_3_final_check_by_a_different_pharmacist(self):
        fill = self._filled_by(self.rph)
        checks = dict(product_verified=True, strength_verified=True, quantity_verified=True)
        r = self.do(fill, "check", self.rph, **checks)
        self.assertEqual(r.status_code, 409)
        self.assertIn("different pharmacist", r.json()["detail"])
        self.assertEqual(self.do(fill, "check", self.rph2, **checks).status_code, 200)
        fill.refresh_from_db()
        self.assertEqual((fill.checked_by, fill.single_pharmacist_reason), (self.rph2, ""))

    def test_3_single_pharmacist_on_duty_override_is_logged(self):
        fill = self._filled_by(self.rph)
        r = self.do(fill, "check", self.rph, product_verified=True, strength_verified=True, quantity_verified=True,
                    single_pharmacist_reason="Only pharmacist on duty (night shift)")
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        self.assertEqual(fill.single_pharmacist_reason, "Only pharmacist on duty (night shift)")
        self.assertEqual(fill.events.get(event_type="checked").detail["single_pharmacist_override"], "Only pharmacist on duty (night shift)")

    def test_4_dangerous_partial_fills_allowed_unless_switched_off(self):
        rx = self.rx("Morphine sulfate 10 mg tablet", quantity=10)
        fill = self.fill_for(rx)
        self.do(fill, "start_entry")
        with self.settings(PHARMACY_ALLOW_DANGEROUS_PARTIAL_FILLS=False):
            r = self.do(fill, "enter", quantity="4")
            self.assertEqual(r.status_code, 400)
            self.assertIn("switched off", r.json()["detail"])
        self.assertEqual(self.do(fill, "enter", quantity="4").status_code, 200)  # default: allowed

    def test_5_one_discount_per_sale_never_stacked(self):
        for kind, number in (("senior", "QC-SC-2019-004512"), ("pwd", "QC-PWD-2021-000321")):
            PatientDiscountId.objects.create(organization=self.org, patient=self.lola, kind=kind, id_number=number)
        fill = self.to_ready(self.rx(patient=self.lola))
        r = self.do(fill, "dispense", self.rph, counseling_offered=False, discount_kind="pwd")
        self.assertEqual(r.status_code, 200, r.content)
        fill.refresh_from_db()
        # one 20% on the VAT-exclusive price (210.00), not two
        self.assertEqual((fill.discount_kind, fill.discount_id_number, fill.discount_amount, fill.total_amount),
                         ("pwd", "QC-PWD-2021-000321", Decimal("42.00"), Decimal("168.00")))

    def test_6_price_admin_notes_the_vat_exempt_review(self):
        from .admin import PharmacyPriceAdmin

        self.assertIn("pharmacist must tick", PharmacyPriceAdmin.__doc__)
        self.assertIn("pharmacist must set", PharmacyPrice._meta.get_field("vat_exempt").help_text)

    def test_7_no_dispense_without_a_price(self):
        fill = self.to_ready(self.rx("Cefuroxime 500 mg tablet"))
        r = self.do(fill, "dispense", self.rph, counseling_offered=True)
        self.assertEqual(r.status_code, 409)
        self.assertIn("no price for Cefuroxime", r.json()["detail"])
        # priced after data entry: the table price is used at dispense
        PharmacyPrice.objects.create(organization=self.org, drug_name="Cefuroxime", unit="tablet", unit_price=Decimal("25.00"))
        self.assertEqual(self.do(fill, "dispense", self.rph, counseling_offered=True).status_code, 200)
        fill.refresh_from_db()
        self.assertEqual(fill.total_amount, Decimal("525.00"))

    def test_8_label_shows_the_dispensing_pharmacist_and_prc_license(self):
        fill = self.to_ready(self.rx())
        self.do(fill, "dispense", self.rph, counseling_offered=True)
        label = self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/label/").json()
        self.assertEqual((label["dispensed_by"], label["pharmacist_license"]), ("Bonifacio, Andres", "0045678"))

    def test_8_pharmacist_without_a_license_on_file_enters_it_once(self):
        fill = self.to_ready(self.rx(), checker=self.rph)
        r = self.do(fill, "dispense", self.rph2, counseling_offered=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn("PRC license", r.json()["detail"])
        r = self.do(fill, "dispense", self.rph2, counseling_offered=True, prc_license_number="0099887")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(PharmacistProfile.objects.get(user=self.rph2).prc_license_number, "0099887")
        fill.refresh_from_db()
        self.assertEqual(fill.pharmacist_license, "0099887")


class FormularyReviewWarningTests(Base):
    """The fill shows "Not yet reviewed by a pharmacist" for a formulary item that needs review; it never blocks."""

    def test_fill_detail_warns_but_fills(self):
        from . import formulary as fm

        sysadmin = mk("sys", "system_admin", None)
        item = fm.create_item(sysadmin, None, {"code": "amoxicillin_500_capsule", "generic_name": "Amoxicillin", "strength": "500 mg", "form": "capsule"})
        rx = self.rx()
        fill = self.fill_for(rx)
        self.assertTrue(self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/").json()["needs_review"])
        self.assertEqual(self.to_ready(rx).stage, "ready")  # not blocked
        fm.mark_reviewed(sysadmin, None, item)
        self.assertFalse(self.api(self.tech).get(f"/api/pharmacy/fills/{fill.pk}/").json()["needs_review"])

