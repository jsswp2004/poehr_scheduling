import re

from django.db import migrations
from django.db.models import Q


def backfill_mrns(apps, schema_editor):
    """Step 2 of 3: give every patient without an MRN one, and start the counter above all MRNs.

    Existing MRNs are never changed. Patients with a blank MRN get the next numbers, oldest first.
    """
    Patient = apps.get_model("users", "Patient")
    Counter = apps.get_model("users", "MRNCounter")
    counter, _ = Counter.objects.get_or_create(pk=1)

    highest = counter.last_number
    for mrn in Patient.objects.exclude(mrn__isnull=True).exclude(mrn="").values_list("mrn", flat=True):
        match = re.fullmatch(r"MRN-(\d+)", mrn)
        if match:
            highest = max(highest, int(match.group(1)))
    counter.last_number = highest

    for patient in Patient.objects.filter(Q(mrn__isnull=True) | Q(mrn="")).order_by("pk"):
        counter.last_number += 1
        patient.mrn = f"MRN-{counter.last_number:06d}"
        patient.save(update_fields=["mrn"])
    counter.save()


class Migration(migrations.Migration):
    dependencies = [("users", "0043_mrn_counter")]

    operations = [migrations.RunPython(backfill_mrns, migrations.RunPython.noop)]
