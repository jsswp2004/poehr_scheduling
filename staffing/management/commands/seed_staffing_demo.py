"""
Seed a DEMO organization with fictional Staffing-module data for testers.

    python manage.py seed_staffing_demo --org-name "Riverside Family Clinic (Demo)"
    python manage.py seed_staffing_demo --org-id 3 --logins          # also create tester logins
    python manage.py seed_staffing_demo --org-id 3 --reset           # remove the demo data only

What it creates (all fictional, all tagged so --reset removes ONLY these records):
  * 2 units: Maple Wing (12-hour shifts) and Oak Wing (8-hour shifts)
  * a rolling census for both units
  * 36 fictional staff (RN / LPN / CNA / other) with recurring schedules and
    shifts from 14 days ago to 45 days ahead -- built so a normal week shows
    GREEN Mon-Wed, AMBER Thu-Fri, RED Sat-Sun on the calendar
  * a few time-off requests (2 pending, 1 approved, 1 denied)
  * optional tester logins (--logins): 2 admins, 1 manager (read-only on Time Off)
    and 6 staff logins linked to roster people who work EVERY day, so the
    "I can't make my shift" button is always available. Passwords are random
    and printed once (use --password to set one shared password instead).

Safety:
  * Staff have NO phone numbers, reminders are OFF and emails use the reserved
    @demo.powerstaffing.test domain, so no real SMS/email can be triggered.
  * Re-running refreshes the demo data (it deletes the previously seeded records
    first). Real data in the organization is never touched.
  * Never run this against a real clinic's organization.
"""

import datetime
import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from staffing.models import (
    DAY_OF_WEEK_CHOICES,
    Staff,
    StaffRecurringPattern,
    StaffShift,
    StaffTimeOffRequest,
    Unit,
    UnitCensus,
)
from users.models import Organization

TAG = "[DEMO SEED]"
DOMAIN = "demo.powerstaffing.test"

# key -> (first, last, profession, nursing_role)
PEOPLE = {
    "alice": ("Alice", "Navarro", "Registered Nurse", "rn"),
    "brian": ("Brian", "Okafor", "Registered Nurse", "rn"),
    "carmen": ("Carmen", "Delgado", "Registered Nurse", "rn"),
    "daniel": ("Daniel", "Whitfield", "Registered Nurse", "rn"),
    "elena": ("Elena", "Petrova", "Registered Nurse", "rn"),
    "frank": ("Frank", "Mensah", "Registered Nurse", "rn"),
    "grace": ("Grace", "Liu", "Registered Nurse", "rn"),
    "hector": ("Hector", "Alvarez", "Registered Nurse", "rn"),
    "ivy": ("Ivy", "Sandoval", "Registered Nurse", "rn"),
    "jonah": ("Jonah", "Pike", "Registered Nurse", "rn"),
    "leah": ("Leah", "Brandt", "Registered Nurse", "rn"),
    "nate": ("Nate", "Fischer", "Registered Nurse", "rn"),
    "irene": ("Irene", "Castillo", "Licensed Practical Nurse", "lpn"),
    "jamal": ("Jamal", "Brooks", "Licensed Practical Nurse", "lpn"),
    "kavita": ("Kavita", "Shah", "Licensed Practical Nurse", "lpn"),
    "luis": ("Luis", "Romero", "Licensed Practical Nurse", "lpn"),
    "mei": ("Mei", "Tanaka", "Licensed Practical Nurse", "lpn"),
    "nadia": ("Nadia", "Farouk", "Licensed Practical Nurse", "lpn"),
    "owen": ("Owen", "Blake", "Licensed Practical Nurse", "lpn"),
    "miguel": ("Miguel", "Soto", "Licensed Practical Nurse", "lpn"),
    "nora": ("Nora", "Abbott", "Certified Nursing Assistant", "cna"),
    "omar": ("Omar", "Haddad", "Certified Nursing Assistant", "cna"),
    "paula": ("Paula", "Reyes", "Certified Nursing Assistant", "cna"),
    "quincy": ("Quincy", "Hart", "Certified Nursing Assistant", "cna"),
    "rosa": ("Rosa", "Jimenez", "Certified Nursing Assistant", "cna"),
    "sam": ("Sam", "Eriksen", "Certified Nursing Assistant", "cna"),
    "tina": ("Tina", "Moreau", "Certified Nursing Assistant", "cna"),
    "victor": ("Victor", "Ng", "Certified Nursing Assistant", "cna"),
    "priya": ("Priya", "Nair", "Certified Nursing Assistant", "cna"),
    "rafael": ("Rafael", "Ortiz", "Certified Nursing Assistant", "cna"),
    "sofia": ("Sofia", "Lind", "Certified Nursing Assistant", "cna"),
    "theo": ("Theo", "Grant", "Certified Nursing Assistant", "cna"),
    "ulla": ("Ulla", "Berg", "Certified Nursing Assistant", "cna"),
    "wendy": ("Wendy", "Park", "Unit Clerk", "other"),
    "xavier": ("Xavier", "Cole", "Housekeeping", "other"),
    "yara": ("Yara", "Stein", "Administrative Assistant", "other"),
}

ALL = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WK = ["mon", "tue", "wed", "thu", "fri"]
FRONT = ["mon", "tue", "wed"]      # fully staffed days -> green
BACK = ["thu", "fri"]              # at the minimum -> amber
WKND = ["sat", "sun"]

# unit key, shift_type, start, end, days, [people]
SCHEDULE = [
    # ---- Maple Wing: 12-hour units (Day / Night). Census ~30 -> need 4 per shift, 1 RN.
    ("maple", "day", "07:00", "19:00", WK, ["alice", "brian", "irene", "nora", "omar", "xavier"]),
    ("maple", "day", "07:00", "19:00", ["sat"], ["carmen", "jamal", "paula", "quincy"]),
    ("maple", "day", "07:00", "19:00", ["sun"], ["carmen", "paula"]),
    ("maple", "night", "19:00", "07:00", FRONT, ["daniel", "elena", "kavita", "rosa", "sam"]),
    ("maple", "night", "19:00", "07:00", BACK, ["daniel", "kavita", "rosa", "sam"]),
    ("maple", "night", "19:00", "07:00", WKND, ["frank", "luis", "tina", "victor"]),
    # ---- Oak Wing: 8-hour units (Day / Evening / Night). Census ~24.
    ("oak", "day", "07:00", "15:00", FRONT, ["grace", "hector", "mei", "priya", "rafael"]),
    ("oak", "day", "07:00", "15:00", BACK, ["grace", "mei", "priya", "rafael", "wendy"]),
    ("oak", "day", "07:00", "15:00", WKND, ["hector", "nadia", "sofia"]),
    ("oak", "evening", "15:00", "23:00", FRONT, ["ivy", "jonah", "owen", "theo", "sofia"]),
    ("oak", "evening", "15:00", "23:00", BACK, ["ivy", "owen", "theo", "sofia", "yara"]),
    ("oak", "evening", "15:00", "23:00", WKND, ["ivy", "jonah", "owen", "theo"]),
    ("oak", "night", "23:00", "07:00", ALL, ["leah", "miguel", "ulla"]),
    ("oak", "night", "23:00", "07:00", FRONT, ["nate"]),
]

UNITS = {
    "maple": ("Maple Wing", "12h", [30, 30, 29, 30, 31, 30, 30]),
    "oak": ("Oak Wing", "8h", [24, 24, 23, 24, 25, 24, 24]),
}

# People who work every single day (so the staff app always has a shift today/tomorrow)
STAFF_LOGINS = ["ivy", "owen", "theo", "leah", "miguel", "ulla"]
ADMIN_LOGINS = [("demo.admin1", "Demo", "Admin One", "admin"), ("demo.admin2", "Demo", "Admin Two", "admin"),
                ("demo.manager", "Demo", "Manager", "nurse")]

PAST_DAYS = 14
FUTURE_DAYS = 45


def _email(key):
    return f"{key}@{DOMAIN}"


class Command(BaseCommand):
    help = "Seed a demo organization with fictional Staffing-module data (see module docstring)."

    def add_arguments(self, parser):
        parser.add_argument("--org-name", default="Riverside Family Clinic (Demo)")
        parser.add_argument("--org-id", type=int, default=None)
        parser.add_argument("--logins", action="store_true", help="Also create tester logins.")
        parser.add_argument("--password", default=None, help="One shared password for all tester logins.")
        parser.add_argument("--set-location", action="store_true",
                            help="Set the org to Leonardtown, MD (Maryland rules) if no state is set.")
        parser.add_argument("--reset", action="store_true", help="Only remove previously seeded demo data.")

    # ------------------------------------------------------------------
    def _org(self, opts):
        qs = Organization.objects.all()
        try:
            return qs.get(pk=opts["org_id"]) if opts["org_id"] else qs.get(name=opts["org_name"])
        except Organization.DoesNotExist:
            raise CommandError("Organization not found. Pass --org-id or an exact --org-name.")
        except Organization.MultipleObjectsReturned:
            raise CommandError("More than one organization has that name. Use --org-id.")

    def _wipe(self, org):
        User = get_user_model()
        removed = {}
        removed["staff"] = Staff.objects.filter(organization=org, notes__startswith=TAG).delete()[0]
        removed["units"] = Unit.objects.filter(organization=org, notes__startswith=TAG).delete()[0]
        removed["logins"] = User.objects.filter(organization=org, email__iendswith="@" + DOMAIN).delete()[0]
        return removed

    # ------------------------------------------------------------------
    @transaction.atomic
    def handle(self, *args, **opts):
        org = self._org(opts)
        today = timezone.localdate()
        removed = self._wipe(org)
        if opts["reset"]:
            self.stdout.write(self.style.SUCCESS(f"Removed demo data from '{org.name}': {removed}"))
            return

        if opts["set_location"] and not org.state:
            org.state, org.city, org.postal_code = "MD", "Leonardtown", "20650"
            org.address_line1 = org.address_line1 or "1 Demo Way"
            org.save()

        units = {}
        for key, (name, pattern, _) in UNITS.items():
            units[key] = Unit.objects.create(
                organization=org, name=name, shift_pattern=pattern, is_active=True, notes=TAG
            )

        start = today - datetime.timedelta(days=PAST_DAYS)
        end = today + datetime.timedelta(days=FUTURE_DAYS)
        days = [start + datetime.timedelta(days=i) for i in range((end - start).days + 1)]

        for key, unit in units.items():
            series = UNITS[key][2]
            for d in days:
                UnitCensus.objects.create(unit=unit, date=d, census=series[d.weekday()], notes=TAG)

        staff = {}
        for key, (first, last, prof, role) in PEOPLE.items():
            staff[key] = Staff.objects.create(
                organization=org, first_name=first, last_name=last, profession=prof,
                nursing_role=role, email=_email(key), phone_number=None,
                reminders_enabled=False, is_active=True, notes=TAG,
            )

        shift_count = 0
        for ukey, stype, st, en, dow, people in SCHEDULE:
            st_t = datetime.time.fromisoformat(st)
            en_t = datetime.time.fromisoformat(en)
            for pkey in people:
                pat = StaffRecurringPattern.objects.create(
                    organization=org, staff=staff[pkey], unit=units[ukey], shift_type=stype,
                    start_time=st_t, end_time=en_t, days_of_week=list(dow), start_date=start,
                    end_date=None, is_active=True, notes=TAG,
                )
                for d in days:
                    if pat.applies_on(d):
                        StaffShift.objects.create(
                            organization=org, staff=staff[pkey], unit=units[ukey], date=d, shift_type=stype,
                            start_time=st_t, end_time=en_t, source="recurring", recurring_pattern=pat,
                            notes=TAG,
                        )
                        shift_count += 1

        self._time_off(org, staff, today)
        creds = self._logins(org, staff, opts) if opts["logins"] else []

        self.stdout.write(self.style.SUCCESS(
            f"Seeded '{org.name}': {len(units)} units, {len(staff)} staff, {shift_count} shifts "
            f"({start} to {end})."))
        if creds:
            self.stdout.write("\nTESTER LOGINS (shown once -- copy them now):")
            for username, role, pw, who in creds:
                self.stdout.write(f"  {role:<8} {username:<44} {pw}   {who}")
            seats = org.max_users
            self.stdout.write(f"\nNote: this org allows {seats} users and now has {org.current_user_count}.")

    # ------------------------------------------------------------------
    def _next(self, today, weekday):
        d = today + datetime.timedelta(days=1)
        while d.weekday() != weekday:
            d += datetime.timedelta(days=1)
        return d

    def _time_off(self, org, staff, today):
        R = StaffTimeOffRequest
        mon = self._next(today, 0)
        tue = mon + datetime.timedelta(days=1)
        wed = mon + datetime.timedelta(days=2)
        thu = mon + datetime.timedelta(days=3)
        now = timezone.now()
        R.objects.create(organization=org, staff=staff["mei"], kind=R.KIND_OFF_REQUEST, status=R.STATUS_PENDING,
                         start_date=mon, end_date=tue, reason="Family event (demo)")
        R.objects.create(organization=org, staff=staff["alice"], kind=R.KIND_OFF_REQUEST, status=R.STATUS_PENDING,
                         start_date=wed, end_date=wed, reason="Dentist appointment (demo)")
        R.objects.create(organization=org, staff=staff["omar"], kind=R.KIND_OFF_REQUEST, status=R.STATUS_APPROVED,
                         start_date=thu, end_date=thu, reason="Personal day (demo)", decided_at=now,
                         admin_note="Approved (demo)")
        R.objects.create(organization=org, staff=staff["quincy"], kind=R.KIND_OFF_REQUEST, status=R.STATUS_DENIED,
                         start_date=thu, end_date=thu + datetime.timedelta(days=1), reason="Long weekend (demo)",
                         decided_at=now, admin_note="Short staffed that weekend (demo)")

    def _logins(self, org, staff, opts):
        User = get_user_model()
        shared = opts["password"]
        creds = []

        def make(username, first, last, role, staff_obj=None):
            pw = shared or secrets.token_urlsafe(9)
            u = User(username=username, email=username, first_name=first, last_name=last, role=role,
                     organization=org, is_active=True)
            if hasattr(u, "registered"):
                u.registered = True
            u.set_password(pw)
            u.save()
            if staff_obj is not None:
                staff_obj.user = u
                staff_obj.save(update_fields=["user", "updated_at"])
            creds.append((username, role, pw, f"{first} {last}"))

        for local, first, last, role in ADMIN_LOGINS:
            make(f"{local}@{DOMAIN}", first, last, role)
        for key in STAFF_LOGINS:
            s = staff[key]
            make(s.email, s.first_name, s.last_name, "staff", s)
        return creds
