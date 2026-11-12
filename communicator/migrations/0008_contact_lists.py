import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("communicator", "0007_announcements"),
    ]

    operations = [
        migrations.CreateModel(
            name="ContactList",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contact_lists",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["name"], "unique_together": {("created_by", "name")}},
        ),
        migrations.AddField(
            model_name="contact",
            name="lists",
            field=models.ManyToManyField(blank=True, related_name="contacts", to="communicator.contactlist"),
        ),
    ]
