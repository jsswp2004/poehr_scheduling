"""
Modules an organization can switch on, and what they cost.

Pricing (agreed with the owner): a flat base price for every organization, the first priced module is
included, and every priced module after the first adds the same monthly amount. The electronic lab
interface is quoted separately, so it never counts toward the total. The plan (Professional, Clinic,
Group) sets the user limit only.

`Organization.enabled_modules` holds the list of enabled module codes in the order they were chosen
(the first priced one is the included module). `None` means "never configured": every module is on, which
is how organizations that existed before modules were introduced keep working untouched.

A module is enforced on the server by URL prefix (MODULE_ROUTES, checked in
poehr_scheduling_backend.tenancy.TenantAwareJWTAuthentication), so switching one off blocks its API and
not just its menu entry. System administrators are never blocked.
"""

BASE_PRICE = 299
EXTRA_MODULE_PRICE = 150

# (code, label, group, description, quoted)
MODULES = [
    ("patient_portal", "Patient registration and portal", "Clinical",
     "Patient sign-in, my information, announcements.", False),
    ("clinical_documentation", "Clinical documentation", "Clinical",
     "Notes, flowsheets, note and flowsheet builders, vaccines and screenings.", False),
    ("orders_labs", "Orders and lab results", "Clinical",
     "Place and sign orders, enter and review results.", False),
    ("prescriptions_referrals", "Prescriptions and referrals", "Clinical",
     "Prescription manager and referral tracking.", False),
    ("triage_boards", "Triage and status boards", "Clinical",
     "Triage scales, ED follow-up and pediatric boards.", False),
    ("scheduling", "Scheduling and calendar", "Operations",
     "Appointments, availability, holidays, check-in.", False),
    ("staffing", "Staffing and coverage", "Operations",
     "Roster, shifts, coverage status, time off.", False),
    ("communicator", "Communicator (text and bulk messages)", "Operations",
     "Automatic reminders, bulk text and email.", False),
    ("custom_reports", "Custom reports", "Operations",
     "Report builder, linked reports, scheduled email.", False),
    ("telehealth", "Telehealth", "Add-ons",
     "Video visits with a join link for patients.", False),
    ("dictation", "Voice dictation", "Add-ons",
     "Speak into a note; optional AI clean-up.", False),
    ("lab_interface", "Electronic lab interface", "Add-ons",
     "Connect to Quest or Labcorp. Set up by arrangement and quoted separately.", True),
]

MODULE_CODES = [m[0] for m in MODULES]
QUOTED_CODES = {m[0] for m in MODULES if m[4]}
MODULE_LABELS = {m[0]: m[1] for m in MODULES}

# Plans set the user limit only. 999999 reads as "unlimited" (the same value the app already used).
PLAN_USER_LIMITS = {"basic": 1, "premium": 10, "enterprise": 999999}
PLAN_LABELS = {"basic": "Professional", "premium": "Clinic", "enterprise": "Group"}
_DISPLAY_TO_KEY = {"Personal": "basic", "Professional": "basic", "Clinic": "premium", "Group": "enterprise"}


def plan_key(value):
    """'Clinic' or 'premium' -> 'premium'. Enrollment used to store the display name; both are accepted."""
    if value in PLAN_USER_LIMITS:
        return value
    return _DISPLAY_TO_KEY.get(value, "basic")


# URL path prefix (after /api/) -> module. Longest prefix wins. Anything not listed is not gated.
MODULE_ROUTES = [
    ("staffing/custom-reports/", "custom_reports"),
    ("staffing/", "staffing"),
    ("communicator/announcements/", None),  # announcements follow the portal, not the Communicator
    ("communicator/", "communicator"),
    ("sms/", "communicator"),
    ("auto-email/", "communicator"),
    ("telehealth/", "telehealth"),
    ("dictation/", "dictation"),
    ("lab-interface/", "lab_interface"),
    ("clinical-notes/", "clinical_documentation"),
    ("vital-signs-flowsheets/", "clinical_documentation"),
    ("flowsheet-templates/", "clinical_documentation"),
    ("admin/flowsheet-templates/", "clinical_documentation"),
    ("note-templates/", "clinical_documentation"),
    ("admin/note-templates/", "clinical_documentation"),
    ("admin/dictionaries/", "clinical_documentation"),
    ("clinical-summary/", "clinical_documentation"),
    ("note-chart-data/", "clinical_documentation"),
    ("intake-output/", "clinical_documentation"),
    ("problem-list/", "clinical_documentation"),
    ("home-medications/", "clinical_documentation"),
    ("vaccine-manager/", "clinical_documentation"),
    ("growth-charts/", "clinical_documentation"),
    ("documentation-assistant/", "clinical_documentation"),
    ("orders/", "orders_labs"),
    ("orderables/", "orders_labs"),
    ("order-sets/", "orders_labs"),
    ("admin/orderables/", "orders_labs"),
    ("admin/order-sets/", "orders_labs"),
    ("order-tasks/", "orders_labs"),
    ("order-task-", "orders_labs"),
    ("lab-reports/", "orders_labs"),
    ("lab-messages/", "orders_labs"),
    ("lab-usage/", "orders_labs"),
    ("referrals/", "prescriptions_referrals"),
    ("referral-", "prescriptions_referrals"),
    ("prescriptions/", "prescriptions_referrals"),
    ("prescription-", "prescriptions_referrals"),
    ("pharmacies/", "prescriptions_referrals"),
    ("patient-pharmacy/", "prescriptions_referrals"),
    ("prescriber-profile/", "prescriptions_referrals"),
    ("triage/", "triage_boards"),
    ("appointments/", "scheduling"),
    ("availability/", "scheduling"),
    ("holidays/", "scheduling"),
    ("clinic-events/", "scheduling"),
    ("check-in/", "scheduling"),
    ("my-schedule/", "scheduling"),
    ("scheduler-assistant/", "scheduling"),
]
_ROUTES_LONGEST_FIRST = sorted(MODULE_ROUTES, key=lambda r: len(r[0]), reverse=True)


def module_for_path(path):
    """Which module an API path belongs to, or None when it is not gated."""
    path = path or ""
    if not path.startswith("/api/"):
        return None
    rest = path[len("/api/"):]
    for prefix, code in _ROUTES_LONGEST_FIRST:
        if rest.startswith(prefix):
            return code
    return None


def enabled_codes(org):
    """The modules an organization may use. No organization or never configured means all of them."""
    stored = getattr(org, "enabled_modules", None) if org is not None else None
    if stored is None:
        return list(MODULE_CODES)
    return [c for c in stored if c in MODULE_CODES]


def has_module(org, code):
    return code in enabled_codes(org)


def priced_modules(codes):
    return [c for c in codes if c not in QUOTED_CODES]


def monthly_total(codes):
    """Base price plus the same amount for every priced module after the first."""
    extra = max(0, len(priced_modules(codes)) - 1)
    return BASE_PRICE + extra * EXTRA_MODULE_PRICE


def extra_module_count(codes):
    return max(0, len(priced_modules(codes)) - 1)


def catalog():
    return [
        {"code": c, "label": label, "group": group, "description": desc, "quoted": quoted}
        for c, label, group, desc, quoted in MODULES
    ]
