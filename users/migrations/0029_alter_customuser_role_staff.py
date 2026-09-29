from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0028_organization_staffing_messaging_enabled"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customuser",
            name="role",
            field=models.CharField(
                choices=[
                    ("patient", "Patient"),
                    ("doctor", "Doctor"),
                    ("nurse", "Nurse"),
                    ("receptionist", "Receptionist"),
                    ("admin", "Admin"),
                    ("registrar", "Registrar"),
                    ("none", "None"),
                    ("system_admin", "System Admin"),
                    ("staff", "Staff"),
                ],
                default="none",
                max_length=20,
            ),
        ),
    ]
