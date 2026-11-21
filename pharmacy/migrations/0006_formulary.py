# POWER Formulary: prices tied to items (shared or clinic), clinic overrides, imports and change history.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0062_alter_customuser_role'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('appointments', '0109_orderable_formulary_fields'),
        ('pharmacy', '0005_portal_followups'),
    ]

    operations = [
        migrations.AddField(
            model_name='pharmacyprice',
            name='orderable',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='prices', to='appointments.orderable'),
        ),
        migrations.AlterField(
            model_name='pharmacyprice',
            name='organization',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pharmacy_prices', to='users.organization'),
        ),
        migrations.CreateModel(
            name='FormularyOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('values', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('orderable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='formulary_overrides', to='appointments.orderable')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='formulary_overrides', to='users.organization')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='FormularyImport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('filename', models.CharField(max_length=255)),
                ('content', models.TextField()),
                ('created', models.PositiveIntegerField(default=0)),
                ('changed', models.PositiveIntegerField(default=0)),
                ('unchanged', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(blank=True, help_text='Blank = the shared POWER formulary', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='users.organization')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='FormularyChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(default='manual', max_length=10)),
                ('changes', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('formulary_import', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='changes', to='pharmacy.formularyimport')),
                ('orderable', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='formulary_changes', to='appointments.orderable')),
                ('organization', models.ForeignKey(blank=True, help_text='Blank = a change to the shared item itself', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='users.organization')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='formularyoverride',
            constraint=models.UniqueConstraint(fields=('organization', 'orderable'), name='uniq_formulary_override'),
        ),
    ]
