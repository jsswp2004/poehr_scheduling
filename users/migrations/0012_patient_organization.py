# Generated by Django 5.2 on 2025-05-29 22:39

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_alter_customuser_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='organization',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='patients', to='users.organization'),
        ),
    ]
