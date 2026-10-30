"""
Modules an organization can switch on, and what they cost.

Pricing (agreed with the owner): Professional is $299 with one priced module included; Clinic is $599 with
two included; every priced module beyond the included ones adds $150. Group is priced by a quote (the Clinic
numbers are only a reference). The electronic lab interface is quoted separately, so it never counts toward
the total. The plan also sets the user limit.

`Organization.enabled_modules` holds the list of enabled module codes in the order they were chosen
(the first priced one is the included module). `None` means "never configured": every module is on, which
is how organizations that existed before modules were introduced keep working untouched.

A module is enforced on the server by URL prefix (MODULE_ROUTES, checked in
poehr_scheduling_backend.tenancy.TenantAwareJWTAuthentication), so switching one off blocks its API and
not just its menu entry. System administrators are never blocked.
"""

BASE_PRICE = 299
EXTRA_MODULE_PRICE = 150

# Per plan: base price and how many priced modules it includes. Group is quoted; its figures mirror Clinic.
PLAN_BASE_PRICE = {"basic": BASE_PRICE, "premium": 599, "enterprise": 599}
PLAN_INCLUDED_MODULES = {"basic": 1, "premium": 2, "enterprise": 2}
QUOTED_PLANS = {"enterprise"}

# (code, label, group, description, quoted)
# Orders and lab results, prescriptions and referrals, and triage and status boards used to be modules of
# their own; they are now part of Clinical Notes (LEGACY_MODULE_CODES maps the old codes to it).
# Reports (report builder, saved reports) is not a module: every organization has it, at no charge.
MODULES = [
    ("patient_portal", "Patient Portal", "Clinical",
     "Patient sign-in, my information, announcements.", False),
    ("clinical_documentation", "Clinical Notes", "Clinical",
     "Notes, flowsheets and their builders, vaccines and screenings, orders and lab results, "
     "prescriptions and referrals, triage and status boards.", False),
    ("scheduling", "Scheduling and calendar", "Operations",
     "Appointments, availability, holidays, check-in.", False),
    ("staffing", "Staffing and coverage", "Operations",
     "Roster, shifts, coverage status, time off.", False),
    ("communicator", "Communicator (text and bulk messages)", "Operations",
     "Automatic reminders, bulk text and email.", False),
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
LEGACY_MODULE_CODES = {"orders_labs": "clinical_documentation", "prescriptions_referrals": "clinical_documentation",
                       "triage_boards": "clinical_documentation"}

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
    ("staffing/custom-reports/", None),  # Reports are part of every organization's service
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
    ("orders/", "clinical_documentation"),
    ("orderables/", "clinical_documentation"),
    ("order-sets/", "clinical_documentation"),
    ("admin/orderables/", "clinical_documentation"),
    ("admin/order-sets/", "clinical_documentation"),
    ("order-tasks/", "clinical_documentation"),
    ("order-task-", "clinical_documentation"),
    ("lab-reports/", "clinical_documentation"),
    ("lab-messages/", "clinical_documentation"),
    ("lab-usage/", "clinical_documentation"),
    ("referrals/", "clinical_documentation"),
    ("referral-", "clinical_documentation"),
    ("prescriptions/", "clinical_documentation"),
    ("prescription-", "clinical_documentation"),
    ("pharmacies/", "clinical_documentation"),
    ("patient-pharmacy/", "clinical_documentation"),
    ("prescriber-profile/", "clinical_documentation"),
    ("triage/", "clinical_documentation"),
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
    return normalize_codes(stored)


def has_module(org, code):
    return code in enabled_codes(org)


def priced_modules(codes):
    return [c for c in codes if c not in QUOTED_CODES]


def extra_module_count(codes, plan="basic"):
    """Priced modules beyond the ones the plan includes."""
    return max(0, len(priced_modules(codes)) - PLAN_INCLUDED_MODULES[plan_key(plan)])


def monthly_total(codes, plan="basic"):
    """The plan's base price plus $150 for every priced module beyond the included ones."""
    key = plan_key(plan)
    return PLAN_BASE_PRICE[key] + extra_module_count(codes, key) * EXTRA_MODULE_PRICE


def normalize_codes(codes):
    """Map retired module codes to Clinical Notes, drop duplicates and unknown codes, keep the order."""
    out = []
    for c in codes or []:
        c = LEGACY_MODULE_CODES.get(c, c)
        if c in MODULE_CODES and c not in out:
            out.append(c)
    return out


def catalog():
    return [
        {"code": c, "label": label, "group": group, "description": desc, "quoted": quoted}
        for c, label, group, desc, quoted in MODULES
    ]
