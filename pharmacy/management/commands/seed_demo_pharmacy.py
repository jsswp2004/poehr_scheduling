"""
DEMO / TEST DATA: a fake partner pharmacy for trying the POWER Pharmacy Portal, "Botika ni Aling Nena (DEMO)".

    python manage.py seed_demo_pharmacy                      create or update it (approved), print the logins
    python manage.py seed_demo_pharmacy --clinic "Klinika"   ... and put it in that clinic's pharmacy directory (id or name)
    python manage.py seed_demo_pharmacy --reset-passwords    ... and give both logins new passwords
    python manage.py seed_demo_pharmacy --password '...'     ... use this password (new logins, or with --reset-passwords)
    python manage.py seed_demo_pharmacy --remove             delete the demo pharmacy, its directory entries and its logins

It is idempotent: a re-run updates the profile and keeps the passwords (unless --reset-passwords). Everything it
creates is marked DEMO and uses example.ph addresses, which can't receive mail. It touches nothing else: only the
pharmacy named below, its two logins and its directory entries.
"""

import secrets
import string
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone

from appointments.models import Pharmacy
from pharmacy.models import PartnerDirectoryLink, PartnerPharmacist, PartnerPharmacy
from users.models import CustomUser, Organization

NAME = "Botika ni Aling Nena (DEMO)"
PROFILE = {
    "address": "1245 Aurora Boulevard, Barangay Pansol",
    "city": "Quezon City",
    "province": "Metro Manila",
    "phone": "(02) 8555 0142",
    "email": "botika.alingnena.demo@example.ph",
    "fda_lto_number": "DEMO-LTO-3000012345",
}
LOGINS = [
    # username, role, first name, last name, email, PRC number (blank: not a pharmacist), portal admin?
    ("demo_alingnena_admin", "ext_pharmacy_admin", "Nena", "Dizon (DEMO)", "nena.dizon.demo@example.ph", "", True),
    ("demo_alingnena_rph", "ext_pharmacist", "Paolo", "Mercado (DEMO)", "paolo.mercado.demo@example.ph", "0099123", False),
]


def _password():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(12)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))


class Command(BaseCommand):
    help = "DEMO/TEST: create or update the fake partner pharmacy 'Botika ni Aling Nena (DEMO)' and its two portal logins."

    def add_arguments(self, parser):
        parser.add_argument("--clinic", help="Clinic (organization) id or name to add the pharmacy to its directory")
        parser.add_argument("--approved-by", help="Username of the system admin recorded as approver (default: the first one)")
        parser.add_argument("--password", help="Password for new logins (and for both with --reset-passwords)")
        parser.add_argument("--reset-passwords", action="store_true", help="Give both logins a new password")
        parser.add_argument("--remove", action="store_true", help="Delete the demo pharmacy, its directory entries and logins")

    def handle(self, *args, **opts):
        if opts["remove"]:
            return self._remove()
        if opts["password"] is not None and len(opts["password"]) < 10:
            raise CommandError("Use a password of at least 10 characters.")
        approver = self._approver(opts["approved_by"])
        clinic = self._clinic(opts["clinic"]) if opts["clinic"] else None
        with transaction.atomic():
            partner, created = self._pharmacy(approver)
            logins = [self._login(partner, row, opts["password"], opts["reset_passwords"]) for row in LOGINS]
            linked = self._directory(partner, clinic) if clinic else None

        out = self.stdout.write
        out(f"{'Created' if created else 'Updated'} DEMO partner pharmacy: {partner.name} (id {partner.pk}), status {partner.get_status_display()}"
            f"{f', approved by {approver.username}' if approver else ''}.")
        out(f"  {partner.address}, {partner.city}, {partner.province} · {partner.phone} · {partner.email}")
        out(f"  FDA LTO {partner.fda_lto_number}, valid until {partner.lto_expiry.isoformat()}")
        out("Portal logins (sign in at /pharmacy-portal):")
        for (username, role, *_rest), (user, password) in zip(LOGINS, logins):
            shown = password if password else "(unchanged; use --reset-passwords for a new one)"
            out(f"  {username:<22} {user.get_role_display():<24} password: {shown}")
        if clinic:
            out(f"Pharmacy directory of {clinic.name} (id {clinic.pk}): {'added' if linked else 'already there'}.")
        else:
            out("Not in any clinic's pharmacy directory yet. Re-run with --clinic <id or name> to add it, e.g.:")
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

    def _pharmacy(self, approver):
        partner = PartnerPharmacy.objects.filter(name=NAME).first()
        created = partner is None
        if created:
            partner = PartnerPharmacy(name=NAME)
        for field, value in PROFILE.items():
            setattr(partner, field, value)
        if partner.lto_expiry is None or partner.lto_expiry < timezone.localdate() + timedelta(days=30):
            partner.lto_expiry = timezone.localdate() + timedelta(days=365)  # about a year out, renewed when close
        if partner.status != "approved":
            partner.status, partner.status_reason = "approved", ""
            partner.approved_by, partner.approved_at = approver, timezone.now()
        partner.save()
        return partner, created

    def _login(self, partner, row, password, reset):
        username, role, first, last, email, prc, is_admin = row
        user = CustomUser.objects.filter(username=username).first()
        if user is not None and getattr(getattr(user, "portal_membership", None), "partner_id", partner.pk) != partner.pk:
            raise CommandError(f"Username {username!r} already belongs to someone else; nothing was changed.")
        if user is not None and user.role not in ("ext_pharmacist", "ext_pharmacy_admin"):
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
        PartnerPharmacist.objects.update_or_create(
            user=user,
            defaults={"partner": partner, "full_name": f"{first} {last}", "prc_number": prc, "email": email, "is_admin": is_admin, "is_active": True},
        )
        return user, new_password

    def _directory(self, partner, clinic):
        if PartnerDirectoryLink.objects.filter(partner=partner, pharmacy__organization=clinic).exists():
            return False
        ph = Pharmacy.objects.create(organization=clinic, name=partner.name, address=partner.address, city=partner.city,
                                     phone=partner.phone, fda_lto_number=partner.fda_lto_number)
        PartnerDirectoryLink.objects.create(pharmacy=ph, partner=partner)
        return True

    def _remove(self):
        partner = PartnerPharmacy.objects.filter(name=NAME).first()
        users = CustomUser.objects.filter(username__in=[row[0] for row in LOGINS], role__in=("ext_pharmacist", "ext_pharmacy_admin"))
        if partner is None and not users.exists():
            self.stdout.write("No demo pharmacy to remove.")
            return
        try:
            with transaction.atomic():
                if partner is not None:
                    Pharmacy.objects.filter(portal_link__partner=partner).delete()  # its directory entries (and links)
                    partner.delete()
                n = users.count()
                users.delete()
        except ProtectedError:
            # prescriptions were routed to it or dispensed there: keep the records, switch the demo off instead
            with transaction.atomic():
                partner.status, partner.status_reason = "suspended", "DEMO pharmacy removed"
                partner.save()
                users.update(is_active=False)
                Pharmacy.objects.filter(portal_link__partner=partner).update(is_active=False)
            self.stdout.write(f"{NAME} has portal prescriptions or dispenses, so it was kept for the record: it is now "
                              "suspended, its logins are deactivated and it is hidden from clinic directories.")
            return
        self.stdout.write(f"Removed {NAME}, its clinic directory entries and {n} demo login(s).")
