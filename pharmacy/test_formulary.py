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
from .models import FormularyChange, FormularyImport, FormularyOverride, PharmacyPrice
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
            "form": "capsule", "route": "PO", "rxnorm_code": "308191", "unit": "capsule", "unit_price_php": "11.20", "vat_exempt": "no",
        })

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
    def test_shared_item_with_its_price_as_a_clinic_sees_it(self):
        r = self.row(self.rph, "amoxicillin_500_capsule")
        self.assertEqual((r["scope"], r["display"], r["unit_price_php"], r["unit"]), ("shared", "Amoxicillin (Amoxil) 500 mg capsule", "11.2", "capsule"))
        self.assertEqual(r["overridden"], [])
        self.assertEqual(set(r["sources"].values()), {"shared"})

    def test_clinic_override_price_and_active_then_revert(self):
        c = self.api(self.rph)
        r = c.patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50", "is_active": False}, format="json").json()
        self.assertEqual((r["unit_price_php"], r["is_active"]), ("12.5", False))
        self.assertEqual(sorted(r["overridden"]), ["is_active", "unit", "unit_price_php", "vat_exempt"])
        self.assertEqual(r["shared_values"]["unit_price_php"], "11.2")
        # the other clinic and the shared item are untouched
        self.assertEqual(self.row(self.rph_cebu, "amoxicillin_500_capsule")["unit_price_php"], "11.2")
        self.assertEqual(self.row(self.sysadmin, "amoxicillin_500_capsule")["is_active"], True)
        # revert: the price fields go back together, then active
        r = c.post(f"{URL}{self.amox.pk}/revert/", {"field": "unit_price_php"}, format="json").json()
        self.assertEqual((r["unit_price_php"], r["sources"]["unit_price_php"]), ("11.2", "shared"))
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
        r = self.api(self.sysadmin).patch(f"{URL}{self.amox.pk}/", {"brand_name": "Himox", "unit_price_php": "10.00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        for user in (self.rph, self.rph_cebu):
            row = self.row(user, "amoxicillin_500_capsule")
            self.assertEqual((row["brand_name"], row["unit_price_php"]), ("Himox", "10"))

    def test_clinic_items_are_private(self):
        r = self.api(self.rph).post(URL, {"generic_name": "Lagundi leaf", "strength": "600 mg", "form": "tablet", "route": "PO", "unit_price_php": "4.50", "unit": "tablet"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["scope"], "clinic")
        codes = [x["code"] for x in self.api(self.rph_cebu).get(URL).json()["results"]]
        self.assertNotIn(r.json()["code"], codes)
        self.assertEqual(self.api(self.rph_cebu).patch(f"{URL}{r.json()['id']}/", {"is_active": False}, format="json").status_code, 404)

    def test_history_of_every_change(self):
        c = self.api(self.rph)
        c.patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50"}, format="json")
        c.post(f"{URL}{self.amox.pk}/revert/", {"field": "unit_price_php"}, format="json")
        h = c.get(f"{URL}{self.amox.pk}/history/").json()["results"]
        self.assertEqual([x["source"] for x in h], ["revert", "manual", "manual"])  # newest first; creation by POWER
        self.assertEqual(h[1]["changes"]["unit_price_php"], ["11.2", "12.5"])
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
        self.assertEqual(plan["counts"], {"new": 2, "changed": 1, "unchanged": 0})
        changed = next(x for x in plan["rows"] if x["status"] == "changed")
        self.assertEqual(changed["changes"], {"unit_price_php": ["11.2", "11.8"]})
        self.assertFalse(Orderable.objects.filter(code="metformin_500_tablet").exists())  # preview writes nothing
        r = self.upload(self.sysadmin, SHARED_CSV, mode="apply", name="shared-2026-11.csv")
        self.assertEqual(r.status_code, 201, r.content)
        morphine = Orderable.objects.get(code="morphine_10_tablet")
        self.assertIsNone(morphine.organization_id)
        self.assertTrue(morphine.is_dangerous_drug)  # blank column: the reference list's default
        metformin = Orderable.objects.get(code="metformin_500_tablet")
        self.assertEqual(metformin.renal_threshold_crcl, 30)
        imp = FormularyImport.objects.get()
        self.assertEqual((imp.filename, imp.created, imp.changed, imp.organization), ("shared-2026-11.csv", 2, 1, None))
        self.assertEqual(FormularyChange.objects.filter(formulary_import=imp).count(), 3)
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
        self.assertEqual((amox["scope"], amox["changes"]), ("override", {"unit_price_php": ["11.2", "12"]}))
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

    def test_in_house_fill_uses_the_formulary_price_with_clinic_override(self):
        from .fills import price_for

        rx = Prescription(organization=self.manila, drug_name="Amoxicillin 500 mg", strength="500 mg")
        self.assertEqual(price_for(self.manila.pk, rx).unit_price, Decimal("11.20"))
        self.api(self.rph).patch(f"{URL}{self.amox.pk}/", {"unit_price_php": "12.50"}, format="json")
        self.assertEqual(price_for(self.manila.pk, rx).unit_price, Decimal("12.50"))
        self.assertTrue(PharmacyPrice.objects.filter(orderable=self.amox, organization=self.manila).exists())
