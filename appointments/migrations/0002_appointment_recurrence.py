# Generated by Django 5.2 on 2025-04-29 17:09

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='appointment',
            name='recurrence',
            field=models.CharField(choices=[('none', 'None'), ('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly')], default='none', max_length=10),
        ),
    ]
