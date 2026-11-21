# POWER Pharmacy, Phase 2: in-house outpatient fill (fills and their history, price table, senior / PWD IDs).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('appointments', '0106_pharmacy_in_house'),
        ('users', '0061_alter_customuser_role'),
        ('pharmacy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PrescriptionFill',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fill_number', models.PositiveSmallIntegerField(default=1, help_text='1 = original fill, 2 = first refill, ...')),
                ('stage', models.CharField(choices=[('received', 'Received'), ('data_entry', 'Data entry'), ('filling', 'Filling'), ('final_check', 'Pharmacist final check'), ('ready', 'Ready for pickup'), ('dispensed', 'Dispensed'), ('on_hold', 'On hold')], default='received', max_length=12)),
                ('held_from', models.CharField(blank=True, help_text='The stage to go back to when the hold is released', max_length=12)),
                ('hold_reason', models.CharField(blank=True, max_length=300)),
                ('quantity', models.DecimalField(blank=True, decimal_places=2, help_text='Quantity this fill dispenses', max_digits=8, null=True)),
                ('quantity_unit', models.CharField(blank=True, max_length=30)),
                ('product_name', models.CharField(blank=True, help_text='Product taken from the shelf', max_length=200)),
                ('product_strength', models.CharField(blank=True, max_length=60)),
                ('lot_number', models.CharField(blank=True, max_length=40)),
                ('expiry_date', models.DateField(blank=True, null=True)),
                ('product_verified', models.BooleanField(default=False)),
                ('strength_verified', models.BooleanField(default=False)),
                ('quantity_verified', models.BooleanField(default=False)),
                ('check_note', models.CharField(blank=True, max_length=300)),
                ('received_at', models.DateTimeField(blank=True, null=True)),
                ('entered_at', models.DateTimeField(blank=True, null=True)),
                ('filled_at', models.DateTimeField(blank=True, null=True)),
                ('checked_at', models.DateTimeField(blank=True, null=True)),
                ('dispensed_at', models.DateTimeField(blank=True, null=True)),
                ('yellow_rx_serial', models.CharField(blank=True, max_length=40)),
                ('s2_number', models.CharField(blank=True, max_length=40)),
                ('unit_price', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('gross_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('vat_exempt_amount', models.DecimalField(blank=True, decimal_places=2, help_text='VAT removed for a senior / PWD', max_digits=12, null=True)),
                ('discount_kind', models.CharField(blank=True, max_length=10)),
                ('discount_id_number', models.CharField(blank=True, max_length=40)),
                ('discount_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('total_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('counseling_offered', models.BooleanField(blank=True, null=True)),
                ('counseling_accepted', models.BooleanField(blank=True, null=True)),
                ('note', models.CharField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('checked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('dispensed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('entered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('filled_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='prescription_fills', to='users.organization')),
                ('patient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='prescription_fills', to=settings.AUTH_USER_MODEL)),
                ('prescription', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='fills', to='appointments.prescription')),
                ('received_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PharmacyPrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('drug_name', models.CharField(help_text='Generic name (and strength if priced per strength)', max_length=200)),
                ('unit', models.CharField(blank=True, help_text='e.g. tablet, capsule, mL', max_length=30)),
                ('unit_price', models.DecimalField(decimal_places=2, help_text='PHP per unit', max_digits=10)),
                ('vat_exempt', models.BooleanField(default=False, help_text='Already VAT-exempt (e.g. medicines exempt under the Tax Code)')),
                ('is_active', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pharmacy_prices', to='users.organization')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['drug_name', 'id'],
            },
        ),
        migrations.CreateModel(
            name='PatientDiscountId',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('senior', 'Senior citizen (RA 9994)'), ('pwd', 'Person with disability (RA 10754)')], max_length=10)),
                ('id_number', models.CharField(max_length=40)),
                ('issued_by', models.CharField(blank=True, help_text='OSCA / PDAO office, city or municipality', max_length=120)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to='users.organization')),
                ('patient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='discount_ids', to=settings.AUTH_USER_MODEL)),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-is_active', '-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='FillEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=30)),
                ('from_stage', models.CharField(blank=True, max_length=12)),
                ('to_stage', models.CharField(blank=True, max_length=12)),
                ('detail', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('fill', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='pharmacy.prescriptionfill')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='prescriptionfill',
            index=models.Index(fields=['organization', 'stage'], name='pharmacy_pr_organiz_8e6f6f_idx'),
        ),
    ]
