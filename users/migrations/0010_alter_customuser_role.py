# Generated by Django 5.2 on 2025-05-27 14:29

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_customuser_organization'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customuser',
            name='role',
            field=models.CharField(choices=[('patient', 'Patient'), ('doctor', 'Doctor'), ('receptionist', 'Receptionist'), ('admin', 'Admin'), ('registrar', 'Registrar'), ('none', 'None')], default='none', max_length=20),
        ),
    ]
