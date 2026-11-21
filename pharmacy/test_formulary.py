"""POWER Formulary: shared items with clinic overrides, edits, revert, history, CSV preview/apply, roles, the flag
migration, the checks reading item flags, the drug search and inpatient ordering."""

import importlib
from decimal import Decimal

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments.models import Orderable, Prescription

from . import formulary as fm
from .dangerous_drugs import is_dangerous_drug
from .models import FormularyChange, FormularyImport, FormularyOverride, FormularyReview, PharmacistProfile, PharmacyPrice
from .renal_drugs import renal_threshold
from users.models import Organization

User = get_user_model()
URL = "/api/pharmacy/formulary/"


def mk(username, role, org=None):
    return User.objects.create_user(username=username, email=f"{username}@example.ph", password="pw-12345-xyz", role=role, organization=org)


class Base(TestCase):
    def setUp(self):
        self.manila = Organization.objects.create(name="Klinika ng Bayan", enabled_modules=["clinical_documentation", "pharmacy"])
        self.cebu = Organization.objects.create(name="Cebu Doctors Clinic", enabled_modules=["clinical_documentation", "pharmacy"])
        self.sysadmin = mk("sys", "system_admin")
        self.rph = mk("rph", "pharmacist", self.manila)
        self.admin = mk("adm", "admin", self.manila)
        self.tech = mk("tech", "pharmacy_tech", self.manila)
        self.doctor = mk("doc", "doctor", self.manila)
        self.nurse = mk("nurse", "nurse", self.manila)
        self.rph_cebu = mk("rphc", "pharmacist", self.cebu)
        self.amox = fm.create_item(self.sysadmin, None, {
            "code": "amoxicillin_500_capsule", "generic_name": "Amoxicillin", "brand_name": "Amoxil", "strength": "500 mg",
            "form": "capsule", "route": "PO", "rxnorm_code": "308191",
        })  # shared items carry no price: each clinic sets its own

    def api(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def row(self, user, code):
        return next(r for r in self.api(user).get(URL).json()["results"] if r["code"] == code)

    def upload(self, user, text, mode="preview", name="formulary.csv"):
        f = SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")
        return self.api(user).post(f"{URL}import/", {"file": f, "mode": mode}, format="multipart")


class SharedAndOverrideTests(Base):
    def test_shared_item_has_no_price_until_the_clinic_sets_its_own(self):
        r = self.row(self.rph, "amoxicillin_500_capsule")
        self.assertEqual((r["scope"], r["display"], r["unit_price_php"], r["unit"]), ("shared", "Amoxicillin (Amoxil) 500 mg capsule", None, ""))
        self.assertEqual(r["overridden"], [])
        self.assertEqual({f: s for f, s in r["sources"].items() if s != "shared"}, {"unit": "clinic", "unit_price_php": "clinic", "vat_exempt": "clinic"})

    def test_clinic_price_and_active_override_then_revert(self):
        c = self.api(self.rph)
        r = c.patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50", "unit": "capsule", "is_active": False}, format="json").json()
        self.assertEqual((r["unit_price_php"], r["unit"], r["is_active"]), ("12.5", "capsule", False))
        self.assertEqual(r["overridden"], ["is_active"])  # the price is the clinic's own, not an override
        # the other clinic and the shared item are untouched
        self.assertEqual(self.row(self.rph_cebu, "amoxicillin_500_capsule")["unit_price_php"], None)
        self.assertEqual(self.row(self.sysadmin, "amoxicillin_500_capsule")["is_active"], True)
        # a price has no shared value to revert to; clearing it removes the clinic's price
        self.assertEqual(c.post(f"{URL}{self.amox.pk}/revert/", {"field": "unit_price_php"}, format="json").status_code, 409)
        self.assertIsNone(c.patch(f"{URL}{self.amox.pk}/", {"unit_price_php": ""}, format="json").json()["unit_price_php"])
        self.assertFalse(PharmacyPrice.objects.filter(orderable=self.amox).exists())
        r = c.post(f"{URL}{self.amox.pk}/revert/", {"field": "is_active"}, format="json").json()
        self.assertEqual(r["overridden"], [])
        self.assertFalse(FormularyOverride.objects.exists())
        self.assertEqual(c.post(f"{URL}{self.amox.pk}/revert/", {"field": "is_active"}, format="json").status_code, 409)

    def test_setting_the_shared_value_removes_the_override(self):
        c = self.api(self.rph)
        c.patch(f"{URL}{self.amox.pk}/", {"dangerous_drug": True}, format="json")
        r = c.patch(f"{URL}{self.amox.pk}/", {"dangerous_drug": False}, format="json").json()
        self.assertEqual(r["overridden"], [])

    def test_clinic_cannot_change_the_shared_definition(self):
        r = self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"brand_name": "Himox"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertIn("brand_name", r.json()["fields"])

    def test_system_admin_changes_the_shared_item_for_everyone(self):
        r = self.api(self.sysadmin).patch(f"{URL}{self.amox.pk}/", {"brand_name": "Himox"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        for user in (self.rph, self.rph_cebu):
            self.assertEqual(self.row(user, "amoxicillin_500_capsule")["brand_name"], "Himox")

    def test_clinic_items_are_private(self):
        r = self.api(self.rph).post(URL, {"generic_name": "Lagundi leaf", "strength": "600 mg", "form": "tablet", "route": "PO", "unit_price_php": "4.50", "unit": "tablet"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["scope"], "clinic")
        codes = [x["code"] for x in self.api(self.rph_cebu).get(URL).json()["results"]]
        self.assertNotIn(r.json()["code"], codes)
        self.assertEqual(self.api(self.rph_cebu).patch(f"{URL}{r.json()['id']}/", {"is_active": False}, format="json").status_code, 404)

    def test_history_of_every_change(self):
        c = self.api(self.rph)
        c.patch(f"{URL}{self.amox.pk}/", {"dangerous_drug": True}, format="json")
        c.post(f"{URL}{self.amox.pk}/revert/", {"field": "dangerous_drug"}, format="json")
        h = c.get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual([x["source"] for x in h], ["revert", "manual", "manual"])  # newest first; creation by POWER
        self.assertEqual(h[1]["changes"]["dangerous_drug"], [False, True])
        self.assertEqual(h[1]["user"], "rph")
        # Cebu does not see Manila's history
        h_cebu = self.api(self.rph_cebu).get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual([x["source"] for x in h_cebu], ["manual"])


class RoleTests(Base):
    def test_roles(self):
        for user, code in ((self.rph, 200), (self.admin, 200), (self.tech, 200), (self.sysadmin, 200), (self.doctor, 403), (self.nurse, 403)):
            self.assertEqual(self.api(user).get(URL).status_code, code, user.role)
        for user, code in ((self.tech, 403), (self.doctor, 403), (self.nurse, 403), (self.admin, 200)):
            self.assertEqual(self.api(user).patch(f"{URL}{self.amox.pk}/", {"is_active": True}, format="json").status_code, code, user.role)
        self.assertEqual(self.upload(self.tech, "code,generic_name\nx,y\n").status_code, 403)


SHARED_CSV = """code,generic_name,brand_name,strength,form,route,rxnorm_code,dangerous_drug,renal_threshold_crcl,vat_exempt,unit,unit_price_php,is_active
amoxicillin_500_capsule,Amoxicillin,Amoxil,500 mg,capsule,PO,308191,no,,no,capsule,11.80,yes
metformin_500_tablet,Metformin,Glucophage,500 mg,tablet,PO,861007,no,,yes,tablet,2.50,yes
morphine_10_tablet,Morphine sulfate,,10 mg,tablet,PO,,,,no,tablet,38.00,yes
"""


class ImportTests(Base):
    def test_preview_then_apply_shared_import(self):
        r = self.upload(self.sysadmin, SHARED_CSV)
        self.assertEqual(r.status_code, 200, r.content)
        plan = r.json()
        self.assertEqual(plan["counts"], {"new": 2, "changed": 0, "unchanged": 1})  # the price columns are ignored
        warned = {(w["row"], w["column"]) for w in plan["warnings"]}
        self.assertTrue({(2, "unit_price_php"), (2, "unit"), (3, "vat_exempt")} <= warned)
        self.assertFalse(Orderable.objects.filter(code="metformin_500_tablet").exists())  # preview writes nothing
        r = self.upload(self.sysadmin, SHARED_CSV, mode="apply", name="shared-2026-11.csv")
        self.assertEqual(r.status_code, 201, r.content)
        morphine = Orderable.objects.get(code="morphine_10_tablet")
        self.assertIsNone(morphine.organization_id)
        self.assertTrue(morphine.is_dangerous_drug)  # blank column: the reference list's default
        metformin = Orderable.objects.get(code="metformin_500_tablet")
        self.assertEqual(metformin.renal_threshold_crcl, 30)
        imp = FormularyImport.objects.get()
        self.assertEqual((imp.filename, imp.created, imp.changed, imp.organization), ("shared-2026-11.csv", 2, 0, None))
        self.assertEqual(FormularyChange.objects.filter(formulary_import=imp).count(), 2)
        self.assertFalse(PharmacyPrice.objects.exists())  # no shared prices
        f = self.api(self.sysadmin).get(f"{URL}imports/{imp.pk}/file/")
        self.assertEqual(f.content.decode(), SHARED_CSV)

    def test_errors_by_row_and_column_and_nothing_saved(self):
        bad = SHARED_CSV + "bad code!,X,,,,,,,,,,,\nok_item,Cefuroxime,,500 mg,pill,XX,abc,maybe,500,no,tablet,-1,yes\namoxicillin_500_capsule,Amoxicillin,,,,,,,,,,,\n"
        plan = self.upload(self.sysadmin, bad).json()
        self.assertFalse(plan["ok"])
        got = {(e["row"], e["column"]) for e in plan["errors"]}
        for cell in ((5, "code"), (6, "form"), (6, "route"), (6, "rxnorm_code"), (6, "dangerous_drug"), (6, "renal_threshold_crcl"), (6, "unit_price_php"), (7, "code")):
            self.assertIn(cell, got)
        r = self.upload(self.sysadmin, bad, mode="apply")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Orderable.objects.filter(code="metformin_500_tablet").exists())
        self.assertFalse(FormularyImport.objects.exists())

    def test_clinic_import_overrides_shared_and_adds_its_own(self):
        csv_text = """code,generic_name,brand_name,strength,form,route,rxnorm_code,dangerous_drug,renal_threshold_crcl,vat_exempt,unit,unit_price_php,is_active
amoxicillin_500_capsule,Amoxicillin,Himox,500 mg,capsule,PO,999999,no,,no,capsule,12.00,yes
lagundi_600_tablet,Lagundi leaf,Ascof,600 mg,tablet,PO,,no,,no,tablet,4.50,yes
"""
        plan = self.upload(self.rph, csv_text).json()
        self.assertTrue(plan["ok"], plan["errors"])
        amox = next(x for x in plan["rows"] if x["code"] == "amoxicillin_500_capsule")
        self.assertEqual((amox["scope"], amox["changes"]), ("override", {"unit": ["", "capsule"], "unit_price_php": [None, "12"]}))
        warned = {(w["row"], w["column"]) for w in plan["warnings"]}
        self.assertIn((2, "brand_name"), warned)  # ignored: only POWER changes the shared definition
        self.assertIn((2, "rxnorm_code"), warned)  # RxNorm mismatch
        self.assertEqual(self.upload(self.rph, csv_text, mode="apply").status_code, 201)
        self.assertEqual(self.row(self.rph, "amoxicillin_500_capsule")["unit_price_php"], "12")
        self.assertEqual(self.row(self.rph, "amoxicillin_500_capsule")["brand_name"], "Amoxil")
        self.assertEqual(Orderable.objects.get(code="lagundi_600_tablet").organization, self.manila)
        # the same code from another clinic is refused
        plan = self.upload(self.rph_cebu, csv_text).json()
        self.assertIn((3, "code"), {(e["row"], e["column"]) for e in plan["errors"]})

    def test_export_round_trips(self):
        text = self.api(self.rph).get(f"{URL}export/").content.decode()
        self.assertTrue(text.startswith(",".join(fm.COLUMNS)))
        plan = self.upload(self.rph, text).json()
        self.assertEqual(plan["counts"], {"new": 0, "changed": 0, "unchanged": 1})


class FlagTests(Base):
    def test_flag_migration_seeds_from_the_lists(self):
        meds = [Orderable(code=c, name=n, category="medication") for c, n in (("mso4", "Morphine sulfate 10 mg"), ("vanco", "Vancomycin 1 g IV"), ("para", "Paracetamol 500 mg"))]
        Orderable.objects.bulk_create(meds)  # bulk: no save() defaults, like rows that existed before the formulary
        Orderable.objects.filter(code__in=["mso4", "vanco"]).update(is_dangerous_drug=False, renal_threshold_crcl=None)
        mig = importlib.import_module("pharmacy.migrations.0007_formulary_flags")
        mig.seed_flags(django_apps, None)
        flags = {o.code: (o.is_dangerous_drug, o.renal_threshold_crcl) for o in Orderable.objects.filter(code__in=["mso4", "vanco", "para"])}
        self.assertEqual(flags, {"mso4": (True, None), "vanco": (False, 50), "para": (False, None)})
        self.assertEqual(FormularyChange.objects.filter(source="migration").count(), 2)

    def test_checks_read_the_item_flag_first(self):
        tramadol = fm.create_item(self.sysadmin, None, {"code": "tramadol_50", "generic_name": "Tramadol", "strength": "50 mg", "form": "capsule"})
        self.assertFalse(is_dangerous_drug("Tramadol 50 mg capsule", organization=self.manila))
        # a clinic flags it locally: only that clinic treats it as a dangerous drug
        self.api(self.rph).patch(f"{URL}{tramadol.pk}/", {"dangerous_drug": True, "renal_threshold_crcl": 30}, format="json")
        self.assertTrue(is_dangerous_drug("Tramadol 50 mg capsule", organization=self.manila))
        self.assertFalse(is_dangerous_drug("Tramadol 50 mg capsule", organization=self.cebu))
        self.assertEqual(renal_threshold("Tramadol 50 mg", organization=self.manila), ("tramadol", 30.0))
        # an item un-flagged by POWER wins over the name list ...
        mso4 = fm.create_item(self.sysadmin, None, {"code": "mso4", "generic_name": "Morphine sulfate", "strength": "10 mg", "form": "tablet"})
        self.assertTrue(mso4.is_dangerous_drug)  # new item: the list's default
        # ... and free text that matches no item still uses the list
        self.assertTrue(is_dangerous_drug("Midazolam 1 mg/mL injection", organization=self.manila))


class SearchAndOrderingTests(Base):
    def test_drug_search_lists_formulary_items_first_and_hides_inactive(self):
        from django.test import override_settings

        with override_settings(ALLERGY_RXNORM_ENABLED=False):
            r = self.api(self.doctor).get("/api/prescription-drugs/", {"q": "amox"})
            self.assertEqual(r.status_code, 200, r.content)
            first = r.json()["results"][0]
            self.assertEqual((first["formulary"], first["display"], first["strength"], first["form"], first["route"]),
                             (True, "Amoxicillin (Amoxil) 500 mg capsule", "500 mg", "capsule", "PO"))
            self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"is_active": False}, format="json")
            r = self.api(self.doctor).get("/api/prescription-drugs/", {"q": "amox"})
            self.assertFalse(any(x.get("formulary") for x in r.json()["results"]))
            # Cebu still sees it
            doc_cebu = mk("docc", "doctor", self.cebu)
            self.assertTrue(self.api(doc_cebu).get("/api/prescription-drugs/", {"q": "amox"}).json()["results"][0]["formulary"])

    def test_inpatient_ordering_hides_items_a_clinic_switched_off(self):
        url = "/api/orderables/?category=medication"
        self.assertIn(self.amox.pk, [o["id"] for o in self.api(self.doctor).get(url).json()])
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"is_active": False}, format="json")
        self.assertNotIn(self.amox.pk, [o["id"] for o in self.api(self.doctor).get(url).json()])

    def test_in_house_fill_uses_the_clinics_own_formulary_price(self):
        from .fills import price_for

        rx = Prescription(organization=self.manila, drug_name="Amoxicillin 500 mg", strength="500 mg")
        # an old shared price row is kept but ignored: no price -> no dispense
        PharmacyPrice.objects.create(organization=None, orderable=self.amox, drug_name="Amoxicillin 500 mg", unit="capsule", unit_price=Decimal("99.00"))
        self.assertIsNone(price_for(self.manila.pk, rx))
        self.assertIsNone(self.row(self.rph, "amoxicillin_500_capsule")["unit_price_php"])
        # the clinic's Phase 2 price-table row is the fallback
        PharmacyPrice.objects.create(organization=self.manila, drug_name="Amoxicillin 500 mg", unit="capsule", unit_price=Decimal("10.00"))
        self.assertEqual(price_for(self.manila.pk, rx).unit_price, Decimal("10.00"))
        # the clinic's formulary price wins; Cebu's is its own
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50"}, format="json")
        self.assertEqual(price_for(self.manila.pk, rx).unit_price, Decimal("12.50"))
        self.assertIsNone(price_for(self.cebu.pk, Prescription(organization=self.cebu, drug_name="Amoxicillin 500 mg", strength="500 mg")))
        self.assertTrue(PharmacyPrice.objects.filter(orderable=self.amox, organization=None).exists())  # kept


class StarterFormularyTests(Base):
    """1. The starter shared PNF formulary: idempotent, never overwrites, flags from the lists, marked for review."""

    def starter(self):
        return importlib.import_module("pharmacy.migrations.0008_starter_formulary")

    def test_loads_once_with_flags_and_review_note(self):
        st = self.starter()
        created = st.load_starter(django_apps)
        self.assertEqual(created, len(st.STARTER) - 1)  # Amoxicillin 500 mg capsule is already a shared item (setUp)
        self.assertEqual(st.load_starter(django_apps), 0)  # idempotent
        items = Orderable.objects.filter(code__startswith="pnf_")
        self.assertEqual(items.count(), len(st.STARTER) - 1)
        self.assertFalse(items.exclude(organization__isnull=True).exists())  # all shared
        self.assertFalse(PharmacyPrice.objects.filter(orderable__in=items).exists())  # prices left blank
        self.assertFalse(items.exclude(external_code="").exists())  # RxNorm left blank, not guessed
        morphine = items.get(code="pnf_morphine_sulfate_10_mg_ml_injection")
        self.assertEqual((morphine.is_dangerous_drug, morphine.default_route, morphine.form), (True, "IV", "injection"))
        self.assertEqual(items.get(code="pnf_metformin_500_mg_tablet").renal_threshold_crcl, 30)
        self.assertEqual(items.get(code="pnf_vancomycin_500_mg_injection").renal_threshold_crcl, 50)
        self.assertFalse(items.get(code="pnf_paracetamol_500_mg_tablet").is_dangerous_drug)
        log = FormularyChange.objects.filter(source="starter")
        self.assertEqual(log.count(), len(st.STARTER) - 1)
        self.assertEqual(log.first().changes["note"], [None, "starter, pharmacist review required"])

    def test_never_overwrites_existing_items_or_overrides(self):
        st = self.starter()
        # a shared Amoxicillin 500 mg capsule already exists (setUp), with a clinic override
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50", "is_active": False}, format="json")
        mine = Orderable.objects.create(code="pnf_paracetamol_500_mg_tablet", name="Our paracetamol", category="medication", organization=self.manila, generic_name="Paracetamol")
        created = st.load_starter(django_apps)
        self.assertEqual(created, len(st.STARTER) - 2)
        self.assertFalse(Orderable.objects.filter(code="pnf_amoxicillin_500_mg_capsule").exists())  # same drug already shared
        mine.refresh_from_db()
        self.assertEqual((mine.name, mine.organization), ("Our paracetamol", self.manila))
        row = self.row(self.rph, "amoxicillin_500_capsule")
        self.assertEqual((row["unit_price_php"], row["is_active"]), ("12.5", False))

    def test_management_command_reloads_missing_items(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        call_command("load_starter_formulary", stdout=out)
        self.assertIn("starter, pharmacist review required", out.getvalue())
        Orderable.objects.filter(code="pnf_ibuprofen_400_mg_tablet").delete()
        out = StringIO()
        call_command("load_starter_formulary", stdout=out)
        self.assertTrue(out.getvalue().startswith("Created 1 starter items"))

    def test_starter_items_appear_in_every_clinics_formulary(self):
        self.starter().load_starter(django_apps)
        for user in (self.rph, self.rph_cebu):
            codes = {r["code"] for r in self.api(user).get(URL, {"q": "pnf_"}).json()["results"]}
            self.assertIn("pnf_losartan_potassium_50_mg_tablet", codes)


class HiddenItemOrdersTests(Base):
    """2. Hiding a shared item blocks NEW orders only; an existing active order is unaffected."""

    def test_existing_active_order_keeps_running(self):
        from datetime import timedelta

        from django.utils import timezone

        from appointments import order_tasks as ot
        from appointments import orders_workflow as ow
        from appointments.models import Appointment, Order, OrderTask

        doctor, patient = mk("docm", "doctor", self.manila), mk("patm", "patient", self.manila)
        appt = Appointment.all_objects.create(organization=self.manila, patient=patient, provider=doctor, title="Admission",
                                              appointment_datetime=timezone.now() + timedelta(days=1))
        draft = ow.create_draft_order(doctor, appt, self.amox, schedule={"frequency": "q8h", "dose": "500 mg", "route": "PO"})
        Order.objects.filter(pk=draft.pk).update(pharmacy_status="verified")
        order = ow.sign_order(draft, doctor)
        before = OrderTask.objects.filter(order=order).count()
        self.assertGreater(before, 0)
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"is_active": False}, format="json")
        order.refresh_from_db()
        self.assertEqual((order.status, order.pharmacy_status), ("active", "verified"))
        ot.ensure_tasks(self.manila, now=timezone.now() + timedelta(hours=20))
        self.assertGreaterEqual(OrderTask.objects.filter(order=order).count(), before)
        self.assertIn(order.pk, [o["id"] for o in self.api(doctor).get("/api/orders/", {"patient": patient.pk}).json()])
        # but it can't be ordered again
        self.assertNotIn(self.amox.pk, [o["id"] for o in self.api(doctor).get("/api/orderables/?category=medication").json()])


class SharedHistoryTests(Base):
    """3. Every clinic sees the full history of a shared item, never another clinic's overrides."""

    def test_full_shared_history_without_other_clinics_overrides(self):
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50"}, format="json")  # Manila override
        self.api(self.sysadmin).patch(f"{URL}{self.amox.pk}/", {"brand_name": "Himox"}, format="json")  # shared change
        cebu = self.api(self.rph_cebu).get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual([(h["scope"], h["source"]) for h in cebu], [("shared", "manual"), ("shared", "manual")])
        self.assertEqual(cebu[0]["changes"], {"brand_name": ["Amoxil", "Himox"]})
        self.assertNotIn("unit_price_php", str(cebu))
        manila = self.api(self.rph).get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual(sorted(h["scope"] for h in manila), ["clinic", "shared", "shared"])


class OrderBuilderMedicationTests(Base):
    """4. Medications are edited in the Formulary only; the Order Builder keeps labs, imaging and procedures."""

    def test_order_builder_hides_and_refuses_medications(self):
        cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")
        c = self.api(self.admin)
        listed = [o["code"] for o in c.get("/api/admin/orderables/").json()]
        self.assertIn("cbc", listed)
        self.assertNotIn("amoxicillin_500_capsule", listed)
        r = c.post("/api/admin/orderables/", {"code": "lagundi", "name": "Lagundi 600 mg tablet", "category": "medication"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Pharmacy > Formulary", r.json()["detail"])
        r = self.api(self.sysadmin).patch(f"/api/admin/orderables/{self.amox.pk}/", {"name": "Changed"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.api(self.sysadmin).patch(f"/api/admin/orderables/{cbc.pk}/", {"category": "medication"}, format="json").status_code, 400)
        self.assertEqual(self.api(self.sysadmin).delete(f"/api/admin/orderables/{self.amox.pk}/").status_code, 400)

    def test_order_builder_csv_refuses_medication_rows(self):
        text = "code,name,category\nxray_chest,Chest X-ray,imaging\nlagundi,Lagundi 600 mg tablet,medication\n"
        f = SimpleUploadedFile("orders.csv", text.encode(), content_type="text/csv")
        r = self.api(self.admin).post("/api/admin/orderables/upload-csv/", {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertEqual([(e["row"], e["column"]) for e in r.json()["errors"]], [(3, "category")])
        self.assertIn("Pharmacy > Formulary", r.json()["errors"][0]["message"])
        self.assertFalse(Orderable.objects.filter(code="xray_chest").exists())  # all or nothing, as before

    def test_medications_stay_orderable(self):
        doctor = mk("doc2", "doctor", self.manila)
        ids = [o["id"] for o in self.api(doctor).get("/api/orderables/?category=medication").json()]
        self.assertIn(self.amox.pk, ids)


class RxNormTests(Base):
    """1. RxNorm codes stay shared: only system admins change them on shared items; a clinic's own items are its own."""

    def test_only_system_admins_change_a_shared_items_rxnorm(self):
        for user in (self.rph, self.admin):
            r = self.api(user).patch(f"{URL}{self.amox.pk}/", {"rxnorm_code": "123456"}, format="json")
            self.assertEqual((r.status_code, r.json()["fields"]), (403, ["rxnorm_code"]), user.role)
        r = self.api(self.sysadmin).patch(f"{URL}{self.amox.pk}/", {"rxnorm_code": "308182"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.row(self.rph_cebu, "amoxicillin_500_capsule")["rxnorm_code"], "308182")

    def test_a_clinic_codes_its_own_items(self):
        item = self.api(self.rph).post(URL, {"generic_name": "Lagundi leaf", "strength": "600 mg", "form": "tablet"}, format="json").json()
        r = self.api(self.admin).patch(f"{URL}{item['id']}/", {"rxnorm_code": "1000001"}, format="json")
        self.assertEqual((r.status_code, r.json()["rxnorm_code"]), (200, "1000001"))

    def test_starter_items_have_no_rxnorm_code(self):
        importlib.import_module("pharmacy.migrations.0008_starter_formulary").load_starter(django_apps)
        self.assertFalse(Orderable.objects.filter(code__startswith="pnf_").exclude(external_code="").exists())


class PerClinicPriceTests(Base):
    """2. Prices are per clinic; the shared formulary has none."""

    def test_system_admin_cannot_price_shared_items(self):
        c = self.api(self.sysadmin)
        r = c.patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "10.00"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertIn("each clinic", r.json()["detail"])
        r = c.post(URL, {"generic_name": "Cetirizine", "strength": "10 mg", "form": "tablet", "unit_price_php": "3.00"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(c.post(URL, {"generic_name": "Cetirizine", "strength": "10 mg", "form": "tablet"}, format="json").status_code, 201)
        meta = c.get(URL).json()
        self.assertEqual((meta["edits_shared"], meta["edits_prices"]), (True, False))
        self.assertEqual(self.api(self.rph).get(URL).json()["edits_prices"], True)
        self.assertFalse(PharmacyPrice.objects.exists())

    def test_each_clinic_prices_a_shared_item_with_its_own_unit_and_vat(self):
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50", "unit": "capsule", "vat_exempt": True}, format="json")
        self.api(self.rph_cebu).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "9.75", "unit": "capsule"}, format="json")
        manila, cebu = self.row(self.rph, "amoxicillin_500_capsule"), self.row(self.rph_cebu, "amoxicillin_500_capsule")
        self.assertEqual((manila["unit_price_php"], manila["vat_exempt"]), ("12.5", True))
        self.assertEqual((cebu["unit_price_php"], cebu["vat_exempt"]), ("9.75", False))
        self.assertIsNone(self.row(self.sysadmin, "amoxicillin_500_capsule")["unit_price_php"])
        # Manila's price change is in Manila's history only
        h = self.api(self.rph_cebu).get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertNotIn("12.5", str(h))


class ReviewTests(Base):
    """3. "Needs pharmacist review": status, filter, Mark reviewed, and what sets it back."""

    def review(self, user, item):
        return self.api(user).post(f"{URL}{item.pk}/review/")

    def test_new_starter_and_migrated_items_need_review(self):
        self.assertEqual(self.row(self.rph, "amoxicillin_500_capsule")["review"]["status"], "needs_review")
        importlib.import_module("pharmacy.migrations.0008_starter_formulary").load_starter(django_apps)
        needing = {r["code"] for r in self.api(self.rph).get(URL, {"review": "needs_review"}).json()["results"]}
        self.assertIn("pnf_paracetamol_500_mg_tablet", needing)
        self.assertEqual(self.api(self.rph).get(URL, {"review": "reviewed"}).json()["results"], [])
        Orderable.objects.bulk_create([Orderable(code="mso4", name="Morphine sulfate 10 mg", category="medication")])
        importlib.import_module("pharmacy.migrations.0007_formulary_flags").seed_flags(django_apps, None)
        self.assertEqual(fm.review_of(Orderable.objects.get(code="mso4"))["status"], "needs_review")

    def test_who_reviews_a_shared_item(self):
        self.assertEqual(self.review(self.rph, self.amox).status_code, 403)  # a clinic pharmacist
        self.assertEqual(self.review(self.admin, self.amox).status_code, 403)
        self.assertEqual(self.review(self.tech, self.amox).status_code, 403)
        self.assertFalse(self.row(self.rph, "amoxicillin_500_capsule")["can_review"])
        PharmacistProfile.objects.create(user=self.rph, reviews_shared_formulary=True)  # a POWER formulary reviewer
        self.assertTrue(self.row(self.rph, "amoxicillin_500_capsule")["can_review"])
        r = self.review(self.rph, self.amox)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["review"]["status"], r.json()["review"]["reviewed_by"]), ("reviewed", "rph"))
        self.assertEqual(self.review(self.sysadmin, self.amox).status_code, 409)
        # recorded in the shared history, which every clinic sees
        h = self.api(self.rph_cebu).get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual((h[0]["source"], h[0]["scope"], h[0]["changes"]), ("review", "shared", {"review": ["needs_review", "reviewed"]}))
        self.assertEqual(self.row(self.rph_cebu, "amoxicillin_500_capsule")["review"]["status"], "reviewed")

    def test_system_admin_reviews_shared_items(self):
        self.assertEqual(self.review(self.sysadmin, self.amox).status_code, 200)
        self.assertEqual([r["code"] for r in self.api(self.sysadmin).get(URL, {"review": "reviewed"}).json()["results"]], ["amoxicillin_500_capsule"])

    def test_a_clinic_pharmacist_reviews_the_clinics_own_items(self):
        item = Orderable.objects.get(pk=self.api(self.admin).post(URL, {"generic_name": "Lagundi leaf", "strength": "600 mg", "form": "tablet"}, format="json").json()["id"])
        self.assertEqual(self.review(self.admin, item).status_code, 403)
        self.assertEqual(self.review(self.rph_cebu, item).status_code, 404)
        self.assertEqual(self.review(self.sysadmin, item).status_code, 404)
        self.assertTrue(self.row(self.rph, item.code)["can_review"])
        self.assertEqual(self.review(self.rph, item).status_code, 200)
        # a price change keeps it reviewed; a clinical change sets it back
        self.api(self.rph).patch(f"{URL}{item.pk}/", {"unit_price_php": "4.50"}, format="json")
        self.assertEqual(fm.review_of(item)["status"], "reviewed")
        self.api(self.admin).patch(f"{URL}{item.pk}/", {"strength": "300 mg"}, format="json")
        self.assertEqual(fm.review_of(item)["status"], "needs_review")

    def test_clinical_edits_and_imports_set_a_shared_item_back_to_needs_review(self):
        self.review(self.sysadmin, self.amox)
        c = self.api(self.sysadmin)
        c.patch(f"{URL}{self.amox.pk}/", {"is_active": True}, format="json")  # no change
        self.assertEqual(fm.review_of(self.amox)["status"], "reviewed")
        # a clinic's override doesn't touch the shared item's review (overrides have no review status)
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"dangerous_drug": True, "unit_price_php": "12.00"}, format="json")
        self.assertEqual(fm.review_of(self.amox)["status"], "reviewed")
        for field, value in (("generic_name", "Amoxicillin trihydrate"), ("route", "IV"), ("renal_threshold_crcl", 30), ("rxnorm_code", "308182")):
            c.patch(f"{URL}{self.amox.pk}/", {field: value}, format="json")
            r = fm.review_of(self.amox)
            self.assertEqual((r["status"], r["reviewed_by"]), ("needs_review", "sys"), field)  # the last reviewer stays on record
            self.review(self.sysadmin, self.amox)
        # any change by an import, even a non-clinical one
        self.upload(self.sysadmin, "code,generic_name,is_active\namoxicillin_500_capsule,Amoxicillin trihydrate,no\n", mode="apply")
        self.assertEqual(fm.review_of(self.amox)["status"], "needs_review")
        self.assertEqual(FormularyReview.objects.get().status, "needs_review")

