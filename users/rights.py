"""
The application's rights registry -- the single source of truth for every
individually-grantable capability in the system, and which roles get which
capability by default.

Before this existed, every permission check in the codebase was a hardcoded
role-string comparison (`user.role in ["admin", "system_admin"]`) scattered
across appointments/views.py, users/views.py, and communicator/views.py.
That meant there was no way to give one specific nurse access to something
her role normally lacks, or take something away from one specific admin,
without changing code. This registry plus UserRightOverride (see
users/models.py) replaces that: a user's *effective* rights are their role's
defaults, overridden per-right by any UserRightOverride rows that exist for
them.

Adding a new right:
1. Add a (code, label, category) entry to RIGHTS below.
2. Add the code to ROLE_DEFAULT_RIGHTS for whichever roles should have it
   by default.
3. Gate the view/action it protects with HasRight(code) (see
   users/permissions.py).
"""

# (code, label, category) -- code is the stable identifier stored in
# UserRightOverride and referenced by HasRight(); label/category are display
# strings for the Security Settings checkbox UI.
RIGHTS = [
    # Clinical Documentation
    ("clinical_notes.view_author", "View & author clinical notes", "Clinical Documentation"),
    ("clinical_notes.sign", "Sign clinical notes", "Clinical Documentation"),
    ("flowsheets.chart", "Chart & view flowsheets", "Clinical Documentation"),
    ("note_templates.manage", "Manage note templates (Note Builder)", "Clinical Documentation"),
    ("flowsheet_templates.manage", "Manage flowsheet templates (Flowsheet Builder)", "Clinical Documentation"),

    # Scheduling & Patients
    ("appointments.create_for_others", "Create appointments on behalf of other patients", "Scheduling & Patients"),
    ("holidays.manage", "Manage holidays", "Scheduling & Patients"),
    ("checkin.manage", "Check-in search & update arrival status", "Scheduling & Patients"),

    # Messaging
    ("messages.send", "Send SMS/email messages", "Messaging"),
    ("messages.view_logs", "View message logs (all users, not just own)", "Messaging"),

    # Data Import/Export
    ("csv.upload_providers", "Upload CSV -- providers", "Data Import/Export"),
    ("csv.upload_patients", "Upload CSV -- patients", "Data Import/Export"),
    ("csv.upload_clinic_events", "Upload CSV -- clinic events", "Data Import/Export"),
    ("csv.upload_availability", "Upload CSV -- availability", "Data Import/Export"),
    ("organization.export_data", "Export organization data", "Data Import/Export"),

    # Admin & Organization
    ("settings.manage", "Manage environment/scheduling settings", "Admin & Organization"),
    ("organization.edit_own", "Edit own organization", "Admin & Organization"),
    ("organization.search_cross_org", "Search organizations (cross-org)", "Admin & Organization"),
    ("organization.view_admin_details", "View organization admin details", "Admin & Organization"),
    ("organization.manage_all", "Manage all organizations (system-wide)", "Admin & Organization"),
    ("organization.delete", "Delete an organization", "Admin & Organization"),
    ("users.search", "Search users", "Admin & Organization"),
    ("users.delete", "Delete a user account", "Admin & Organization"),
    ("users.change_password", "Change another user's password", "Admin & Organization"),
    ("users.manage_rights", "Manage user rights (this screen)", "Admin & Organization"),
    ("reminders.trigger", "Manually trigger reminder jobs", "Admin & Organization"),

    # Analytics
    ("analytics.view", "Access analytics/reports", "Analytics"),
]

RIGHT_CODES = {code for code, _, _ in RIGHTS}
RIGHT_LABELS = {code: label for code, label, _ in RIGHTS}

# What each role gets by default, absent any per-user override. These
# defaults were chosen to match the app's existing behavior at the time
# this registry was introduced (so turning it on changes nothing until an
# admin starts using the per-user override screen) -- see the Phase-1 rights
# audit for exactly which endpoint each default reflects.
_ALL_RIGHTS = {code for code, _, _ in RIGHTS}

_CLINICAL_STAFF_RIGHTS = {
    "clinical_notes.view_author",
    "clinical_notes.sign",
    "flowsheets.chart",
}

_FRONT_OFFICE_RIGHTS = {
    "holidays.manage",
    "checkin.manage",
    "messages.send",
    "messages.view_logs",
    "csv.upload_providers",
    "csv.upload_patients",
    "csv.upload_clinic_events",
    "csv.upload_availability",
    "organization.export_data",
    "settings.manage",
    "organization.search_cross_org",
    "organization.view_admin_details",
    "appointments.create_for_others",
}

_ORG_ADMIN_RIGHTS = _FRONT_OFFICE_RIGHTS | {
    "organization.edit_own",
    "organization.manage_all",
    "organization.delete",
    "users.search",
    "users.delete",
    "users.change_password",
    "users.manage_rights",
    "reminders.trigger",
    "analytics.view",
}

ROLE_DEFAULT_RIGHTS = {
    "patient": set(),
    "none": set(),
    "doctor": _CLINICAL_STAFF_RIGHTS | {"analytics.view"},
    "nurse": _CLINICAL_STAFF_RIGHTS | {"analytics.view"},
    "receptionist": {"checkin.manage", "messages.send"},
    "registrar": _FRONT_OFFICE_RIGHTS | {"analytics.view"},
    # Admins manage note/flowsheet template structure in addition to the
    # clinical-staff and org-admin rights -- matches the original
    # IsNoteTemplateAdmin/IsFlowsheetTemplateAdmin ALLOWED_ROLES ("admin",
    # "system_admin"), which doctors/nurses were deliberately excluded from.
    "admin": _CLINICAL_STAFF_RIGHTS
    | _ORG_ADMIN_RIGHTS
    | {"note_templates.manage", "flowsheet_templates.manage"},
    "system_admin": _ALL_RIGHTS,
}


def role_default_rights(role):
    """The set of right codes a bare role grants, with no overrides applied."""
    return set(ROLE_DEFAULT_RIGHTS.get(role, set()))


def effective_rights(user):
    """
    A user's actual, final set of granted right codes: their role's
    defaults, with any UserRightOverride rows for them applied on top
    (is_granted=True adds the right even if the role lacks it,
    is_granted=False removes it even if the role has it).
    """
    if not getattr(user, "is_authenticated", False):
        return set()
    if getattr(user, "is_superuser", False):
        return set(_ALL_RIGHTS)

    rights = role_default_rights(getattr(user, "role", None))
    # Local import avoids a circular import (models imports nothing from
    # here, but importing UserRightOverride at module load time would tie
    # this module's import order to Django app-loading order).
    from users.models import UserRightOverride

    overrides = UserRightOverride.objects.filter(user=user).values_list(
        "right_code", "is_granted"
    )
    for code, is_granted in overrides:
        if is_granted:
            rights.add(code)
        else:
            rights.discard(code)
    return rights


def user_has_right(user, code):
    if code not in RIGHT_CODES:
        raise ValueError(f"Unknown right code: {code!r}")
    return code in effective_rights(user)
