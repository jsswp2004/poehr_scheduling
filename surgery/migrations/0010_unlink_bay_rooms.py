from django.db import migrations


def unlink_bays(apps, schema_editor):
    """A room with beds is a PreOp/PACU bay, not an operating room. Some were set up as operating rooms, which hid
    their beds from the bed picker; drop those Surgery rooms (the Location Manager room and its beds stay). A case booked
    into one is left with no room ("Unassigned") for someone to give a real operating room."""
    SurgeryRoom = apps.get_model("surgery", "SurgeryRoom")
    Bed = apps.get_model("appointments", "Bed")
    bay_rooms = set(Bed.objects.values_list("room_id", flat=True))
    SurgeryRoom.objects.filter(location_room_id__in=bay_rooms).delete()  # cases.room is SET_NULL


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0087_unit_is_surgical"),
        ("surgery", "0009_case_bed"),
    ]

    operations = [
        migrations.RunPython(unlink_bays, migrations.RunPython.noop),
    ]
