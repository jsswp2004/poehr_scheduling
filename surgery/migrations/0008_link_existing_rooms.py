from django.db import migrations

UNIT_NAME = "Operating Rooms"


def link_rooms(apps, schema_editor):
    """Give every existing operating room a Location Manager room (safe to run twice: only unlinked rooms move)."""
    SurgeryRoom = apps.get_model("surgery", "SurgeryRoom")
    Unit = apps.get_model("appointments", "Unit")
    Room = apps.get_model("appointments", "Room")
    for sr in SurgeryRoom.objects.filter(location_room__isnull=True).order_by("facility_id", "sort_order", "id"):
        unit = Unit.objects.filter(facility_id=sr.facility_id, name__iexact=UNIT_NAME).first()
        if unit is None:
            unit = Unit.objects.create(facility_id=sr.facility_id, name=UNIT_NAME, care_type="outpatient", is_surgical=True)
        elif not unit.is_surgical:
            unit.is_surgical = True
            unit.save(update_fields=["is_surgical"])
        room = Room.objects.filter(unit_id=unit.pk, name__iexact=sr.name).first()
        if room is None:
            room = Room.objects.create(unit_id=unit.pk, name=sr.name, is_active=sr.is_active)
        if SurgeryRoom.objects.filter(location_room_id=room.pk).exists():
            continue
        sr.location_room_id = room.pk
        sr.save(update_fields=["location_room"])


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0087_unit_is_surgical"),
        ("surgery", "0007_surgeryroom_location_room"),
    ]

    operations = [
        migrations.RunPython(link_rooms, migrations.RunPython.noop),
    ]
