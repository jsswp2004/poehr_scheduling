# POWER Pharmacy, Phase 3: the external pharmacy portal (partner pharmacies, routing, requests, dispenses, access log).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('appointments', '0108_rx_claim_code'),
        ('pharmacy', '0003_checks_and_license'),
    ]

    operations = [
        migrations.CreateModel(
            name='PartnerPharmacy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('address', models.CharField(blank=True, max_length=255)),
                ('city', models.CharField(blank=True, max_length=80)),
                ('province', models.CharField(blank=True, max_length=80)),
                ('phone', models.CharField(blank=True, max_length=30)),
                ('email', models.EmailField(blank=True, help_text='Where portal notices are emailed', max_length=254)),
                ('fda_lto_number', models.CharField(max_length=40)),
                ('lto_expiry', models.DateField()),
                ('status', models.CharField(choices=[('pending', 'Pending approval'), ('approved', 'Approved'), ('suspended', 'Suspended')], default='pending', max_length=10)),
                ('status_reason', models.CharField(blank=True, max_length=300)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'partner pharmacies',
                'ordering': ['name', 'id'],
            },
        ),
        migrations.CreateModel(
            name='PortalPrescription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('new', 'New'), ('in_progress', 'In progress'), ('ready', 'Ready for pickup'), ('partially_dispensed', 'Partially dispensed'), ('dispensed', 'Dispensed'), ('declined', 'Declined'), ('cancelled', 'Cancelled by prescriber')], default='new', max_length=20)),
                ('how', models.CharField(blank=True, help_text='routed (chosen by the prescriber) or claimed (claim code)', max_length=10)),
                ('fill_number', models.PositiveSmallIntegerField(default=1)),
                ('decline_reason', models.CharField(blank=True, max_length=300)),
                ('locked_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='prescriptions', to='pharmacy.partnerpharmacy')),
                ('prescription', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='portal', to='appointments.prescription')),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PortalRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('out_of_stock', 'Out of stock'), ('strength_form', 'Different strength or form'), ('clarification', 'Clarification'), ('renewal', 'Renewal')], max_length=20)),
                ('message', models.CharField(max_length=1000)),
                ('proposed', models.CharField(blank=True, help_text='e.g. the strength or form the pharmacy has', max_length=300)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('denied', 'Denied')], default='pending', max_length=10)),
                ('response', models.CharField(blank=True, max_length=1000)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to='pharmacy.partnerpharmacy')),
                ('portal', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='requests', to='pharmacy.portalprescription')),
                ('renewal_prescription', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='appointments.prescription')),
                ('responded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PortalNotice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notices', to='pharmacy.partnerpharmacy')),
                ('portal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notices', to='pharmacy.portalprescription')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PortalDispense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fill_number', models.PositiveSmallIntegerField(default=1)),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=8)),
                ('is_partial', models.BooleanField(default=False)),
                ('generic_name', models.CharField(max_length=200)),
                ('brand_name', models.CharField(blank=True, max_length=200)),
                ('manufacturer', models.CharField(blank=True, max_length=200)),
                ('strength', models.CharField(blank=True, max_length=60)),
                ('form', models.CharField(blank=True, max_length=40)),
                ('yellow_rx_serial', models.CharField(blank=True, max_length=40)),
                ('original_in_hand', models.BooleanField(default=False)),
                ('discount_id_type', models.CharField(blank=True, max_length=10)),
                ('discount_id_number', models.CharField(blank=True, max_length=40)),
                ('pharmacist_prc', models.CharField(blank=True, max_length=40)),
                ('dispensed_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to='pharmacy.partnerpharmacy')),
                ('pharmacist', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('portal', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dispenses', to='pharmacy.portalprescription')),
            ],
            options={
                'ordering': ['-dispensed_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PortalAccessLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=40)),
                ('detail', models.JSONField(blank=True, default=dict)),
                ('ip', models.CharField(blank=True, max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='pharmacy.partnerpharmacy')),
                ('prescription', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='appointments.prescription')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='PartnerPharmacist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('full_name', models.CharField(max_length=160)),
                ('prc_number', models.CharField(blank=True, max_length=40)),
                ('is_admin', models.BooleanField(default=False, help_text="Manages the pharmacy's portal logins (the person who registered it)")),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='staff', to='pharmacy.partnerpharmacy')),
                ('user', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='portal_membership', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['full_name', 'id'],
            },
        ),
        migrations.CreateModel(
            name='PartnerDirectoryLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='directory_links', to='pharmacy.partnerpharmacy')),
                ('pharmacy', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='portal_link', to='appointments.pharmacy')),
            ],
        ),
        migrations.AddIndex(
            model_name='portalaccesslog',
            index=models.Index(fields=['user', 'created_at'], name='pharmacy_po_user_id_b3426b_idx'),
        ),
    ]
