"""The MRN is required, unique and assigned before a patient is first saved."""
import importlib

from django.apps import apps
from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import CustomUser, MRNCounter, Organization, Patient


def make_patient(name):
    org, _ = Organization.objects.get_or_create(name="MRN Clinic")
    user = CustomUser.objects.create_user(username=name, password="x", role="patient", organization=org)
    return Patient.objects.get(user=user)  # registering a patient user creates the profile


class MRNTests(TestCase):
    def test_a_new_patient_has_an_mrn_the_moment_it_is_saved(self):
        patient = make_patient("p1")
        self.assertRegex(patient.mrn, r"^MRN-\d{6}$")
        self.assertEqual(Patient.objects.get(pk=patient.pk).mrn, patient.mrn)

    def test_mrns_are_unique_and_never_reused(self):
        a, b = make_patient("a"), make_patient("b")
        self.assertNotEqual(a.mrn, b.mrn)
        a.delete()
        c = make_patient("c")
        self.assertNotIn(c.mrn, (a.mrn, b.mrn))

    def test_saving_again_keeps_the_same_mrn(self):
        patient = make_patient("keep")
        mrn = patient.mrn
        patient.phone_number = "3015550100"
        patient.save()
        patient.save(update_fields=["phone_number"])
        self.assertEqual(Patient.objects.get(pk=patient.pk).mrn, mrn)

    def test_the_database_refuses_a_patient_without_an_mrn(self):
        patient = make_patient("nomrn")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Patient.objects.filter(pk=patient.pk).update(mrn=None)

    def test_a_failed_save_does_not_leave_a_patient_without_an_mrn(self):
        org = Organization.objects.create(name="Fail Clinic")
        user = CustomUser.objects.create_user(username="dup", password="x", role="patient", organization=org)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Patient.objects.create(user=user)  # one patient profile per user
        self.assertEqual(Patient.objects.filter(user=user).count(), 1)
        self.assertFalse(Patient.objects.filter(mrn="").exists())

    def test_the_repair_fills_blank_mrns_and_keeps_existing_ones(self):
        keep = make_patient("old")
        blank = make_patient("blank")
        Patient.objects.filter(pk=blank.pk).update(mrn="")  # the damage the old design allowed
        MRNCounter.objects.all().update(last_number=0)
        migration = importlib.import_module("users.migrations.0044_backfill_mrn")
        migration.backfill_mrns(apps, None)

        keep.refresh_from_db()
        blank.refresh_from_db()
        self.assertEqual(keep.mrn, Patient.objects.get(pk=keep.pk).mrn)
        self.assertRegex(blank.mrn, r"^MRN-\d{6}$")
        self.assertNotEqual(blank.mrn, keep.mrn)
        # new patients continue above every MRN already handed out
        newest = make_patient("new")
        numbers = [int(m.split("-")[1]) for m in Patient.objects.exclude(pk=newest.pk).values_list("mrn", flat=True)]
        self.assertGreater(int(newest.mrn.split("-")[1]), max(numbers))
