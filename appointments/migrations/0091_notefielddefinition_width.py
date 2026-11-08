from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appointments", "0090_seed_newborn_note")]

    operations = [
        migrations.AddField(
            model_name="notefielddefinition",
            name="width",
            field=models.CharField(
                choices=[
                    ("full", "Full row"),
                    ("half", "Half row"),
                    ("third", "Third of a row"),
                    ("quarter", "Quarter of a row"),
                ],
                default="full",
                max_length=10,
            ),
        ),
    ]
