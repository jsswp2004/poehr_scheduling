from django.db import migrations, models


def _to_e164(phone):
    """Frozen copy of communicator.utils.format_phone_to_international."""
    if not phone:
        return ""
    cleaned = "".join(ch for ch in phone if ch.isdigit())
    if len(cleaned) == 10:
        return f"+1{cleaned}"
    if len(cleaned) == 11 and cleaned.startswith("1"):
        return f"+{cleaned}"
    if len(cleaned) == 11:
        return f"+1{cleaned[1:]}"
    if phone.startswith("+") and len(cleaned) >= 10:
        return phone
    if len(cleaned) >= 10:
        return f"+1{cleaned[-10:]}"
    return phone


def backfill(apps, schema_editor):
    Contact = apps.get_model("communicator", "Contact")
    CustomUser = apps.get_model("users", "CustomUser")

    opted_out = {}
    for phone, date, method in CustomUser.objects.filter(sms_opt_out=True).exclude(
        phone_number__isnull=True
    ).exclude(phone_number="").values_list(
        "phone_number", "sms_opt_out_date", "sms_opt_out_method"
    ):
        opted_out[_to_e164(phone)] = (date, method)

    for contact in Contact.objects.exclude(phone="").iterator():
        e164 = _to_e164(contact.phone)
        fields = ["phone_e164"]
        contact.phone_e164 = e164
        if e164 in opted_out:
            date, method = opted_out[e164]
            contact.sms_opt_out = True
            contact.sms_opt_out_date = date
            contact.sms_opt_out_method = method or "STOP"
            fields += ["sms_opt_out", "sms_opt_out_date", "sms_opt_out_method"]
        contact.save(update_fields=fields)


class Migration(migrations.Migration):

    dependencies = [
        ("communicator", "0004_alter_messagelog_message_type"),
        ("users", "0024_customuser_sms_opt_out_customuser_sms_opt_out_date_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="contact",
            name="phone_e164",
            field=models.CharField(blank=True, db_index=True, editable=False, max_length=20),
        ),
        migrations.AddField(
            model_name="contact",
            name="sms_opt_out",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="contact",
            name="sms_opt_out_date",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contact",
            name="sms_opt_out_method",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
