# POWER Pharmacy, Phase 1: pharmacist verification fields on orders, generic / brand names and the
# dangerous-drug flag on orderables.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def set_existing_medication_orders(apps, schema_editor):
    """
    Medication orders that already exist were never meant to wait for a pharmacist: every signed one is
    marked verified so nothing changes on the nurse's administration tasks. Unsigned drafts wait for
    verification like any new order. Non-medication orders stay blank.
    """
    Order = apps.get_model("appointments", "Order")
    meds = Order.objects.filter(orderable_category="medication", pharmacy_status="")
    meds.exclude(status="draft").update(pharmacy_status="verified")
    meds.filter(status="draft").update(pharmacy_status="pending_verification")


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('appointments', '0103_admission_note_review_of_systems_tab'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='pharmacy_note',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pharmacy_status',
            field=models.CharField(blank=True, choices=[('pending_verification', 'Pending verification'), ('verified', 'Verified'), ('on_hold_clarify', 'On hold: clarification'), ('rejected', 'Rejected')], default='', max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='verified_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='orders_verified', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='orderable',
            name='brand_name',
            field=models.CharField(blank=True, help_text='Medications: brand name, shown in parentheses', max_length=255),
        ),
        migrations.AddField(
            model_name='orderable',
            name='generic_name',
            field=models.CharField(blank=True, help_text='Medications: generic name, shown first', max_length=255),
        ),
        migrations.AddField(
            model_name='orderable',
            name='is_dangerous_drug',
            field=models.BooleanField(default=False, help_text='Medications: a dangerous drug under RA 9165 (PDEA / DDB). Also matched by name from the configurable list in pharmacy.dangerous_drugs.'),
        ),
        migrations.RunPython(set_existing_medication_orders, migrations.RunPython.noop),
    ]
