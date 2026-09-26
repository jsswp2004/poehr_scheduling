from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0034_clinicalnote_template_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="notefielddefinition",
            name="tab_label",
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
