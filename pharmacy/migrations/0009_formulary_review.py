# POWER Formulary: "needs pharmacist review" per item (no row = needs review) and the POWER-level reviewer flag.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('appointments', '0109_orderable_formulary_fields'),
        ('pharmacy', '0008_starter_formulary'),
    ]

    operations = [
        migrations.AddField(
            model_name='pharmacistprofile',
            name='reviews_shared_formulary',
            field=models.BooleanField(default=False, help_text='POWER-level formulary reviewer: may mark SHARED formulary items reviewed. Set by a system administrator.'),
        ),
        migrations.CreateModel(
            name='FormularyReview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('needs_review', 'Needs pharmacist review'), ('reviewed', 'Reviewed')], default='needs_review', max_length=12)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('orderable', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='formulary_review', to='appointments.orderable')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
