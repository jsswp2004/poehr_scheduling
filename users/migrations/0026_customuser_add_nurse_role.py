from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0025_organization_max_users_and_more"),
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
                ],
                default="none",
                max_length=20,
            ),
        ),
    ]
