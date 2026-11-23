"""
DEMO / TEST DATA: a fake partner lab for trying the POWER Lab Portal, "Diagnostika Clinical Laboratory (DEMO)".

    python manage.py seed_demo_lab                      create or update it (approved), print the logins
    python manage.py seed_demo_lab --clinic "Klinika"   ... and put it in that clinic's lab directory (id or name)
    python manage.py seed_demo_lab --reset-passwords    ... and give the logins new passwords
    python manage.py seed_demo_lab --password '...'     ... use this password (new logins, or with --reset-passwords)
    python manage.py seed_demo_lab --remove             delete the demo lab, its directory entries and its logins
    python manage.py seed_demo_lab --from-env           for a deploy's build step (Render has no shell on the free
                                                        plan): does nothing unless SEED_DEMO_LAB=true, then reads
                                                        DEMO_LAB_PASSWORD and DEMO_LAB_CLINIC; never fails the build

It is idempotent: a re-run updates the profile and keeps the passwords (unless --reset-passwords). Everything it
creates is marked DEMO and uses example.ph addresses, which can't receive mail, and no mobile numbers, so no texts
go out. It touches nothing else: only the lab named below, its logins and its directory entries.

The logins:
  demo_diagnostika_admin    lab administrator who is also the chief medical technologist (so a worker login, ext_lab_tech,
                            with the lab-admin flag, as registration sets up a licensed admin): manages staff, works
                            requests and may release results
  demo_diagnostika_asst     lab assistant: receives requests, logs collection and enters results, may not release
  demo_diagnostika_path     pathologist: may release everything, including Philippine critical values
"""

import os
import secrets
import string
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone

from lab_portal.models import ClinicLab, PartnerLab, PartnerLabStaff
from users.models import CustomUser, Organization

NAME = "Diagnostika Clinical Laboratory (DEMO)"
PROFILE = {
    "country": "PH",
    "address": "88 Kalayaan Avenue, Barangay Central",
    "city": "Quezon City",
    "province": "Metro Manila",
    "postal_code": "1100",
    "phone": "(02) 8555 0177",
    "email": "diagnostika.demo@example.ph",
    "sms_mobile": "",
    "license_number": "DEMO-DOH-LTO-CL-0042",
    "license_category": "Secondary clinical laboratory",
    "head_name": "Dr. Ramon Villanueva (DEMO)",
    "head_license": "0071234",
    "hours": "Mon-Sat 6am-6pm",
    "offers_walk_in": True,
    "offers_bedside": True,
    "offers_courier": True,
    "offers_home_service": True,
}
LAB_ROLES = ("ext_lab_tech", "ext_lab_pathologist", "ext_lab_admin")
LOGINS = [
    # username, role, first name, last name, email, PRC number, admin?, pathologist?, may release?
    ("demo_diagnostika_admin", "ext_lab_tech", "Liza", "Santos (DEMO)", "liza.santos.demo@example.ph", "0098765", True, False, True),
    ("demo_diagnostika_asst", "ext_lab_tech", "Mark", "Reyes (DEMO)", "mark.reyes.demo@example.ph", "", False, False, False),
    ("demo_diagnostika_path", "ext_lab_pathologist", "Ramon", "Villanueva (DEMO)", "ramon.villanueva.demo@example.ph", "0071234", False, True, True),
]


def _password():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(12)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))


class Command(BaseCommand):
    help = "DEMO/TEST: create or update the fake partner lab 'Diagnostika Clinical Laboratory (DEMO)' and its portal logins."

    def add_arguments(self, parser):
        parser.add_argument("--clinic", help="Clinic (organization) id or name to add the lab to its lab directory")
        parser.add_argument("--approved-by", help="Username of the system admin recorded as approver (default: the first one)")
        parser.add_argument("--password", help="Password for new logins (and for all of them with --reset-passwords)")
        parser.add_argument("--reset-passwords", action="store_true", help="Give the logins new passwords")
        parser.add_argument("--remove", action="store_true", help="Delete the demo lab, its directory entries and logins")
        parser.add_argument("--from-env", action="store_true",
                            help="Build step: run only when SEED_DEMO_LAB=true, take DEMO_LAB_PASSWORD and DEMO_LAB_CLINIC, never fail")

    def handle(self, *args, **opts):
        if opts["from_env"]:
            if os.environ.get("SEED_DEMO_LAB", "").strip().lower() not in ("1", "true", "yes"):
                self.stdout.write("seed_demo_lab: SEED_DEMO_LAB is not true, skipping.")
                return
            opts["password"] = opts["password"] or os.environ.get("DEMO_LAB_PASSWORD") or None
            opts["clinic"] = opts["clinic"] or os.environ.get("DEMO_LAB_CLINIC") or None
            opts["reset_passwords"] = bool(opts["password"])  # the logins always match DEMO_LAB_PASSWORD
            try:
                return self._seed(opts)
            except Exception as exc:  # a demo seed must never block a deploy
                self.stderr.write(f"seed_demo_lab: skipped, {exc}")
                return
        return self._seed(opts)

    def _seed(self, opts):
        if opts["remove"]:
            return self._remove()
        if opts["password"] is not None and len(opts["password"]) < 10:
            raise CommandError("Use a password of at least 10 characters.")
        approver = self._approver(opts["approved_by"])
        clinic = self._clinic(opts["clinic"]) if opts["clinic"] else None
        with transaction.atomic():
            lab, created = self._lab(approver)
            logins = [self._login(lab, row, opts["password"], opts["reset_passwords"]) for row in LOGINS]
            linked = self._directory(lab, clinic) if clinic else None

        out = self.stdout.write
        out(f"{'Created' if created else 'Updated'} DEMO partner lab: {lab.name} (id {lab.pk}), status {lab.get_status_display()}"
            f"{f', approved by {approver.username}' if approver else ''}.")
        out(f"  {lab.address}, {lab.city}, {lab.province} · {lab.phone} · {lab.email}")
        out(f"  DOH license {lab.license_number}, valid until {lab.license_expiry.isoformat()} · head pathologist {lab.head_name}")
        out("Portal logins (sign in at /lab-portal):")
        for (username, *_rest), (user, password) in zip(LOGINS, logins):
            shown = password if password else "(unchanged; use --reset-passwords for a new one)"
            out(f"  {username:<24} {user.get_role_display():<32} password: {shown}")
        if clinic:
            out(f"Lab directory of {clinic.name} (id {clinic.pk}): {'added' if linked else 'already there'}.")
        else:
            out("Not in any clinic's lab directory yet. Re-run with --clinic <id or name> to add it, e.g.:")
            for org in Organization.objects.order_by("name")[:20]:
                out(f"  --clinic {org.pk:<5} {org.name}")

    # ----------------------------------------------------------------------------------------------- parts

    def _approver(self, username):
        qs = CustomUser.objects.filter(role="system_admin", is_active=True)
        if username:
            user = qs.filter(username=username).first()
            if user is None:
                raise CommandError(f"No active system admin with username {username!r}.")
            return user
        return qs.order_by("id").first()  # may be None on an empty database; the approval time is still recorded

    def _clinic(self, value):
        qs = Organization.objects.all()
        if str(value).isdigit():
            org = qs.filter(pk=int(value)).first()
            if org:
                return org
        matches = list(qs.filter(name__iexact=value)) or list(qs.filter(name__icontains=value)[:5])
        if len(matches) != 1:
            names = ", ".join(f"{o.pk}: {o.name}" for o in matches) or "none"
            raise CommandError(f"--clinic {value!r} must match exactly one clinic (matches: {names}).")
        return matches[0]

    def _lab(self, approver):
        lab = PartnerLab.objects.filter(name=NAME).first()
        created = lab is None
        if created:
            lab = PartnerLab(name=NAME)
        for field, value in PROFILE.items():
            setattr(lab, field, value)
        if lab.license_expiry is None or lab.license_expiry < timezone.localdate() + timedelta(days=30):
            lab.license_expiry = timezone.localdate() + timedelta(days=365)  # about a year out, renewed when close
        if lab.status != "approved":
            lab.status, lab.status_reason = "approved", ""
            lab.approved_by, lab.approved_at = approver, timezone.now()
        lab.save()
        return lab, created

    def _login(self, lab, row, password, reset):
        username, role, first, last, email, prc, is_admin, is_pathologist, can_release = row
        user = CustomUser.objects.filter(username=username).first()
        if user is not None and getattr(getattr(user, "lab_portal_membership", None), "partner_id", lab.pk) != lab.pk:
            raise CommandError(f"Username {username!r} already belongs to another lab; nothing was changed.")
        if user is not None and user.role not in LAB_ROLES:
            raise CommandError(f"Username {username!r} is an existing {user.get_role_display()} login; nothing was changed.")
        new_password = None
        if user is None:
            new_password = password or _password()
            user = CustomUser.objects.create_user(username=username, password=new_password, email=email, role=role,
                                                  first_name=first, last_name=last)
        else:
            user.role, user.first_name, user.last_name, user.email, user.is_active = role, first, last, email, True
            if reset:
                new_password = password or _password()
                user.set_password(new_password)
            user.save()
        PartnerLabStaff.objects.update_or_create(
            user=user,
            defaults={"partner": lab, "full_name": f"{first} {last}", "license_number": prc, "email": email, "mobile": "",
                      "is_admin": is_admin, "is_pathologist": is_pathologist, "can_release": can_release, "is_active": True},
        )
        return user, new_password

    def _directory(self, lab, clinic):
        if ClinicLab.objects.filter(partner=lab, organization=clinic).exists():
            ClinicLab.objects.filter(partner=lab, organization=clinic).update(is_active=True)
            return False
        ClinicLab.objects.create(organization=clinic, name=lab.name, mode="partner_portal", partner=lab,
                                 address=f"{lab.address}, {lab.city}", phone=lab.phone,
                                 note="DEMO lab: walk-in, bedside, courier and home service", accepts_inpatient=True)
        return True

    def _remove(self):
        lab = PartnerLab.objects.filter(name=NAME).first()
        users = CustomUser.objects.filter(username__in=[row[0] for row in LOGINS], role__in=LAB_ROLES)
        if lab is None and not users.exists():
            self.stdout.write("No demo lab to remove.")
            return
        try:
            with transaction.atomic():
                if lab is not None:
                    ClinicLab.objects.filter(partner=lab).delete()
                    lab.delete()
                n = users.count()
                users.delete()
        except ProtectedError:
            # requests were sent to it: keep the records, switch the demo off instead
            with transaction.atomic():
                lab.status, lab.status_reason = "suspended", "DEMO lab removed"
                lab.save()
                users.update(is_active=False)
                ClinicLab.objects.filter(partner=lab).update(is_active=False)
            self.stdout.write(f"{NAME} has lab requests, so it was kept for the record: it is now suspended, its logins "
                              "are deactivated and it is hidden from clinic lab directories.")
            return
        self.stdout.write(f"Removed {NAME}, its clinic directory entries and {n} demo login(s).")
