"""Fill one organization with demo surgery data so the module can be tried in a browser.

    python manage.py seed_surgery_demo --org "My Org"            # development database
    python manage.py seed_surgery_demo --org 3 --reset           # remove the demo cases first, then reseed
    python manage.py seed_surgery_demo --org 3 --force           # only if you really mean a non-DEBUG database

It uses the organization's EXISTING patients and doctors/nurses (it never creates users or patients), adds operating
rooms, preference cards, charge policies and prices if they are missing, and books a day of cases in every status.
Every demo case is tagged "[DEMO]" in its booking comments so --reset can remove exactly those and nothing else.
"""
from datetime import datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from appointments.models import Facility
from users.models import CustomUser, Organization, Patient

from surgery.models import (
    CaseCard,
    CaseParticipant,
    CaseUsageItem,
    ChargePolicy,
    ChargePrice,
    PreferenceCard,
    PreferenceCardItem,
    SurgeryCase,
    SurgeryRoom,
)
from surgery.services import generate_charges, record, snapshot

TAG = "[DEMO]"

CARDS = {
    "DEMO - AV FISTULA CREATION": {
        "procedure": "ARTERIOVENOUS FISTULA CREATION",
        "pre": "Position supine, arm board. Prep with chlorhexidine.",
        "post": "CLIP, SURGICLIP M-11.5",
        "items": [
            ("EQUIPMENT", "VL ELECTROSURGICAL UNIT", "", 1, ""),
            ("UNSTERILE", "CAUTERY, PAD RETURN ELECTRODE ADULT", "OOR10593", 1, "OOR10593"),
            ("UNSTERILE", "CHUCKS", "OOR11665", 2, "OOR11665"),
            ("INSTRUMENT", "TRAY, AV FISTULA", "", 1, ""),
            ("MEDICATIONS", "IV SOLUTION, NORMAL SALINE", "OCS10334", 1, "OCS10334"),
            ("PREP", "PREP, CHLORAPREP 26ML TINTED", "OOR12994", 1, "OOR12994"),
        ],
    },
    "DEMO - CYSTOSCOPY": {
        "procedure": "CYSTOSCOPY",
        "pre": "Lithotomy position.",
        "post": "Foley per surgeon.",
        "items": [
            ("INSTRUMENT", "SET, CYSTO", "", 1, ""),
            ("UNSTERILE", "TUBING, IRRIGATION CYSTO", "OOR20001", 2, "OOR20001"),
            ("MEDICATIONS", "LIDOCAINE JELLY 2%", "OCS30001", 1, "OCS30001"),
        ],
    },
}
POLICIES = [
    dict(name="DEMO OR Time", policy_type="case_time", time_basis="or", first_code="UOORL130", first_minutes=30,
         extra_code="UOORL115", extra_minutes=15, description="OR time"),
    dict(name="DEMO General Anesthesia", policy_type="case_time", time_basis="anesthesia", first_code="ANSG0001",
         first_minutes=30, extra_code="ANSG0002", extra_minutes=15, description="Anesthesia time"),
]
PRICES = {"UOORL130": "850.00", "UOORL115": "210.00", "ANSG0001": "420.00", "ANSG0002": "95.00", "OOR10593": "18.50",
          "OOR11665": "4.25", "OCS10334": "6.00", "OOR12994": "9.75", "OOR20001": "12.00", "OCS30001": "3.10"}

# (clock time, minutes planned, room index, status, case type, service, procedure, laterality, card, minutes actually in room)
CASES = [
    ("07:30", 150, 0, "discharged", "elective", "Vascular Surgery", "ARTERIOVENOUS FISTULA CREATION", "left", "DEMO - AV FISTULA CREATION", 156),
    ("08:00", 60, 1, "discharged", "elective", "Urology", "CYSTOSCOPY", "", "DEMO - CYSTOSCOPY", 52),
    ("09:30", 90, 1, "pacu", "elective", "Urology", "CYSTOSCOPY", "", "DEMO - CYSTOSCOPY", 70),
    ("10:00", 120, 0, "or", "elective", "Vascular Surgery", "ARTERIOVENOUS FISTULA CREATION", "right", "DEMO - AV FISTULA CREATION", None),
    ("11:30", 60, 2, "preop", "elective", "Urology", "CYSTOSCOPY", "", None, None),
    ("13:00", 90, 0, "pending", "elective", "Vascular Surgery", "ARTERIOVENOUS FISTULA CREATION", "left", None, None),
    ("13:30", 60, 0, "pending", "urgent", "Urology", "CYSTOSCOPY", "", None, None),  # overlaps the case above on purpose
    ("14:00", 60, 1, "cancelled", "elective", "Urology", "CYSTOSCOPY", "", None, None),
    ("15:00", 90, 2, "transferred", "emergent", "Vascular Surgery", "ARTERIOVENOUS FISTULA CREATION", "left", None, 75),
]


class Command(BaseCommand):
    help = "Seed demo surgery data (rooms, cards, policies, prices and a day of cases) into one organization."

    def add_arguments(self, parser):
        parser.add_argument("--org", required=True, help="Organization id or exact name")
        parser.add_argument("--reset", action="store_true", help="Remove this organization's [DEMO] cases first")
        parser.add_argument("--force", action="store_true", help="Allow running when DEBUG is off")
        parser.add_argument("--date", help="Day to book the cases on, YYYY-MM-DD (default: today)")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("DEBUG is off, so this looks like a real database. Demo clinical cases do not belong "
                               "there; pass --force only if you are sure.")
        org = self._org(opts["org"])
        day = (datetime.strptime(opts["date"], "%Y-%m-%d").date() if opts["date"] else timezone.localdate())
        facility = Facility.objects.filter(organization=org, is_active=True).order_by("id").first()
        if facility is None:
            raise CommandError(f"{org.name} has no active facility. Create one first (Location Manager).")
        patients = list(Patient.objects.filter(organization=org).select_related("user").order_by("id")[:len(CASES)])
        if not patients:
            raise CommandError(f"{org.name} has no patients. Register a few first; this command never creates patients.")
        doctors = list(CustomUser.objects.filter(organization=org, role="doctor", is_active=True).order_by("id"))
        nurses = list(CustomUser.objects.filter(organization=org, role="nurse", is_active=True).order_by("id"))

        with transaction.atomic():
            if opts["reset"]:
                removed = SurgeryCase.objects.filter(organization=org, comments__startswith=TAG).delete()[0]
                self.stdout.write(f"Removed demo cases ({removed} rows including their details).")
            elif SurgeryCase.objects.filter(organization=org, comments__startswith=TAG).exists():
                raise CommandError("Demo cases already exist here. Use --reset to replace them.")
            rooms = self._rooms(facility)
            cards = self._cards(org)
            self._policies_and_prices(org)
            made = self._cases(org, facility, rooms, cards, patients, doctors, nurses, day)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {made} cases for {day} at {facility.name} ({org.name}): {len(rooms)} rooms, {len(cards)} cards."))

    def _org(self, ident):
        qs = Organization.objects.filter(pk=int(ident)) if str(ident).isdigit() else Organization.objects.filter(name=ident)
        org = qs.first()
        if org is None:
            raise CommandError(f"No organization matches '{ident}'.")
        return org

    def _rooms(self, facility):
        rooms = []
        for i, name in enumerate(["OR-1", "OR-2", "OR-3"], start=1):
            room, _ = SurgeryRoom.objects.get_or_create(facility=facility, name=name, defaults={"sort_order": i})
            rooms.append(room)
        return rooms

    def _cards(self, org):
        out = {}
        for name, spec in CARDS.items():
            card, created = PreferenceCard.objects.get_or_create(
                organization=org, name=name,
                defaults={"procedure_name": spec["procedure"], "pre_op_notes": spec["pre"], "post_op_notes": spec["post"]})
            if created:
                for cat, item, catalog, qty, code in spec["items"]:
                    PreferenceCardItem.objects.create(card=card, category=cat, name=item, catalog_number=catalog,
                                                      quantity=qty, charge_code=code, department="Demo OR")
            out[name] = card
        return out

    def _policies_and_prices(self, org):
        for spec in POLICIES:
            ChargePolicy.objects.get_or_create(organization=org, name=spec["name"], defaults=spec)
        for code, price in PRICES.items():
            ChargePrice.objects.get_or_create(organization=org, charge_code=code, defaults={"unit_price": price})

    def _at(self, day, hhmm):
        h, m = hhmm.split(":")
        return timezone.make_aware(datetime(day.year, day.month, day.day, int(h), int(m)))

    def _cases(self, org, facility, rooms, cards, patients, doctors, nurses, day):
        made = 0
        for i, (clock, minutes, room_i, status, ctype, service, proc, lat, card_name, in_room) in enumerate(CASES):
            patient = patients[i % len(patients)]
            start = self._at(day, clock)
            case = SurgeryCase(
                organization=org, facility=facility, patient=patient, room=rooms[room_i], scheduled_start=start,
                duration_minutes=minutes, surgeon=doctors[i % len(doctors)] if doctors else None, service=service,
                case_type=ctype, status="pending", anesthesia_type="General" if i % 2 == 0 else "MAC",
                comments=f"{TAG} booking comment", physical_status="ASA 2", created_by=nurses[0] if nurses else None)
            case.save()
            case.procedures.create(name=proc, laterality=lat, is_primary=True, cpt_code="36821" if "FISTULA" in proc else "52000")
            record(case, case.created_by, "created", {}, snapshot(case))
            if status != "pending":
                self._advance(case, status, start, in_room, doctors, nurses, card_name and cards[card_name])
            made += 1
        return made

    def _advance(self, case, status, start, in_room, doctors, nurses, card):
        late = timedelta(minutes=12)
        case.preop_start = start - timedelta(minutes=45)
        case.ready_for_or = start - timedelta(minutes=5)
        case.preop_end = start - timedelta(minutes=2)
        if status in ("or", "pacu", "discharged", "transferred"):
            case.patient_in = start + late
            case.time_reasons = {"patient_in": "Previous Case Ran Over"}
            if status in ("pacu", "discharged", "transferred"):
                out = case.patient_in + timedelta(minutes=in_room or case.duration_minutes)
                case.procedure_start = case.patient_in + timedelta(minutes=15)
                case.procedure_end = out - timedelta(minutes=8)
                case.patient_out, case.pacu_start = out, out + timedelta(minutes=3)
            if status == "discharged":
                case.discharged_at = case.pacu_start + timedelta(minutes=60)
        if status == "cancelled":
            case.preop_start, case.ready_for_or, case.preop_end = None, None, None
            case.cancel_reason = "Patient not NPO"
        elif status == "preop":
            case.ready_for_or = case.preop_end = None
        case.status = status
        case.save()
        if status in ("or", "pacu", "discharged", "transferred"):
            self._staff(case, doctors, nurses)
        if card is not None:
            CaseCard.objects.create(case=case, card=card, is_primary=True)
            for it in card.items.all():
                CaseUsageItem.objects.create(case=case, category=it.category, name=it.name, catalog_number=it.catalog_number,
                                             total=it.quantity, charge_code=it.charge_code, department=it.department, source_card=card)
        if status in ("discharged", "transferred"):
            generate_charges(case)
            if status == "discharged":
                case.charges.filter(policy_type="usage").update(status="posted")  # mixed: some posted, some pending

    def _staff(self, case, doctors, nurses):
        rows = [("surgeon_primary", case.surgeon)]
        if doctors:
            rows.append(("anesthesiologist", doctors[-1]))
        if nurses:
            rows += [("rn_circulator", nurses[0]), ("rn_pacu", nurses[-1])]
        for n, (role, user) in enumerate(rows):
            if user is None:
                continue
            CaseParticipant.objects.create(case=case, role=role, user=user, sort_order=n, time_in=case.patient_in,
                                           time_out=case.patient_out if role != "rn_pacu" else None)
        CaseParticipant.objects.create(case=case, role="vendor", name="Demo Vendor Rep", sort_order=9, time_in=case.patient_in)
