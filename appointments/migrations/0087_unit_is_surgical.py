from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0086_search_audit"),
    ]

    operations = [
        migrations.AddField(
            model_name="unit",
            name="is_surgical",
            field=models.BooleanField(default=False),
        ),
    ]
