"""DEMO/TEST data command: seed_demo_pharmacy (create, idempotent, --clinic, --reset-passwords, --remove)."""

import re
from io import StringIO

from django.contrib.auth import authenticate, get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from appointments.models import Pharmacy
from users.models import Organization

from .models import PartnerDirectoryLink, PartnerPharmacist, PartnerPharmacy
from .portal import partner_problem

User = get_user_model()
NAME = "Botika ni Aling Nena (DEMO)"


def run(*args):
    out = StringIO()
    call_command("seed_demo_pharmacy", *args, stdout=out)
    return out.getvalue()


def passwords(text):
    return dict(re.findall(r"^\s+(demo_\w+)\s+.+?password: (\S+)$", text, re.M))


class SeedDemoPharmacyTests(TestCase):
    def setUp(self):
        self.sysadmin = User.objects.create_user(username="sys", email="sys@example.ph", password="pw-12345-xyz", role="system_admin")
        self.clinic = Organization.objects.create(name="Klinika ng Bayan", enabled_modules=["clinical_documentation", "pharmacy"])

    def test_creates_an_approved_pharmacy_with_a_full_profile_and_two_logins(self):
        text = run()
        p = PartnerPharmacy.objects.get(name=NAME)
        self.assertEqual((p.status, p.approved_by, p.city, p.province), ("approved", self.sysadmin, "Quezon City", "Metro Manila"))
        self.assertTrue(p.approved_at and p.address and p.phone and p.fda_lto_number.startswith("DEMO-"))
        self.assertTrue(p.email.endswith("@example.ph"))
        self.assertEqual(partner_problem(p), "")  # can work on the portal (approved, LTO valid)
        pw = passwords(text)
        admin = authenticate(username="demo_alingnena_admin", password=pw["demo_alingnena_admin"])
        rph = authenticate(username="demo_alingnena_rph", password=pw["demo_alingnena_rph"])
        self.assertEqual((admin.role, rph.role), ("ext_pharmacy_admin", "ext_pharmacist"))
        self.assertEqual(rph.portal_membership.partner, p)
        self.assertEqual(PartnerPharmacist.objects.get(user=rph).prc_number, "0099123")  # can record dispenses
        self.assertTrue(PartnerPharmacist.objects.get(user=admin).is_admin)
        self.assertIn("--clinic", text)  # tells how to add it to a clinic

    def test_rerun_updates_and_keeps_passwords_unless_reset(self):
        pw = passwords(run())
        PartnerPharmacy.objects.filter(name=NAME).update(phone="changed")
        text = run()
        self.assertIn("Updated DEMO partner pharmacy", text)
        self.assertEqual(PartnerPharmacy.objects.filter(name=NAME).count(), 1)
        self.assertEqual(PartnerPharmacy.objects.get(name=NAME).phone, "(02) 8555 0142")
        self.assertEqual(PartnerPharmacist.objects.count(), 2)
        self.assertIn("(unchanged", text)
        self.assertIsNotNone(authenticate(username="demo_alingnena_rph", password=pw["demo_alingnena_rph"]))
        new = passwords(run("--reset-passwords", "--password", "Sampaguita-2026!"))
        self.assertEqual(new["demo_alingnena_rph"], "Sampaguita-2026!")
        self.assertIsNotNone(authenticate(username="demo_alingnena_rph", password="Sampaguita-2026!"))

    def test_clinic_option_adds_one_directory_entry(self):
        text = run("--clinic", "klinika ng bayan")
        self.assertIn("Pharmacy directory of Klinika ng Bayan", text)
        run("--clinic", str(self.clinic.pk))
        link = PartnerDirectoryLink.objects.get()
        self.assertEqual((link.pharmacy.organization, link.pharmacy.name, link.partner.name), (self.clinic, NAME, NAME))
        with self.assertRaises(CommandError):
            run("--clinic", "no such clinic")

    def test_remove_deletes_only_the_demo(self):
        other = PartnerPharmacy.objects.create(name="Mercury Drug Cubao", fda_lto_number="LTO-1", lto_expiry="2027-12-31", status="approved")
        run("--clinic", str(self.clinic.pk))
        self.assertIn("Removed", run("--remove"))
        self.assertEqual(list(PartnerPharmacy.objects.all()), [other])
        self.assertFalse(User.objects.filter(username__startswith="demo_alingnena").exists())
        self.assertFalse(Pharmacy.objects.exists())
        self.assertTrue(User.objects.filter(username="sys").exists())
        self.assertIn("No demo pharmacy", run("--remove"))

    def test_refuses_to_take_over_an_existing_username(self):
        User.objects.create_user(username="demo_alingnena_rph", email="x@example.ph", password="pw-12345-xyz", role="doctor")
        with self.assertRaises(CommandError):
            run()
        self.assertFalse(PartnerPharmacy.objects.exists())  # all or nothing
