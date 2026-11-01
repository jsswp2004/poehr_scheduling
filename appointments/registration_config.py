"""
Registration dictionaries and field settings.

Dictionaries are the choice lists behind registration fields (language, relationship, insurance
payer, copay status). Field settings let a clinic relabel a field, make it required, view-only or
hidden. Both are per clinic; a clinic that saved nothing gets the built-in lists and labels.

* GET    /api/registration-dictionaries/            every dictionary with its entries (any staff)
* PUT    /api/registration-dictionaries/            save one: {code, entries:[{value, abbr, active}]} (admins)
* DELETE /api/registration-dictionaries/?code=      back to the built-in list (admins)
* GET    /api/registration-fields/                  every step's fields with label and mode (any staff)
* PUT    /api/registration-fields/                  save one step: {window, fields:{key:{label, mode}}} (admins)
* DELETE /api/registration-fields/?window=          back to the built-in labels (admins)
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RegistrationDictionary, RegistrationFieldSetting
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

MAX_ENTRIES = 200
MAX_VALUE = 80

# code -> (title, where it is used, built-in entries)
DICTIONARIES = {
    "language": (
        "Preferred language",
        "Patient Identity: Preferred Language",
        ["English", "Spanish", "Haitian Creole", "Mandarin", "Cantonese", "Russian", "Arabic", "French", "Bengali", "Korean"],
    ),
    "relationship": (
        "Contact relationship",
        "Emergency Contact: Relationship",
        ["Spouse", "Parent", "Child", "Sibling", "Friend", "Guardian", "Other"],
    ),
    "payer": (
        "Insurance payer",
        "Financial Information: Insurance Payer Name",
        ["Medicare", "Medicaid", "Self-pay", "Commercial", "Workers' compensation"],
    ),
    "title": ("Title", "Demographics: Title", ["Mr", "Mrs", "Ms", "Miss", "Mx", "Dr"]),
    "suffix": ("Suffix", "Demographics: Suffix", ["Jr", "Sr", "II", "III", "IV"]),
    "marital_status": (
        "Marital status",
        "Demographics: Marital Status",
        ["Single", "Married", "Divorced", "Widowed", "Separated", "Domestic partner"],
    ),
    "race": (
        "Race",
        "Demographics: Race",
        [
            "American Indian or Alaska Native",
            "Asian",
            "Black or African American",
            "Native Hawaiian or Pacific Islander",
            "White",
            "Other",
            "Declined",
        ],
    ),
    "ethnicity": ("Ethnicity", "Demographics: Ethnicity", ["Hispanic or Latino", "Not Hispanic or Latino", "Declined"]),
    "religion": (
        "Religion",
        "Demographics: Religion",
        ["Catholic", "Protestant", "Jewish", "Muslim", "Hindu", "Buddhist", "None", "Declined"],
    ),
    "veteran_status": ("Veteran status", "Demographics: Veteran", ["Yes", "No", "Unknown"]),
    "address_type": ("Address type", "Demographics: Address Type", ["Home", "Mailing", "Temporary", "Work"]),
    "contact_type": (
        "Contact type",
        "Contacts: Contact Type",
        ["Emergency contact", "Next of kin", "Guardian", "Health care proxy"],
    ),
    "directive_type": (
        "Advance directive",
        "Contacts: Advance directive on file",
        ["None", "Living will", "Health care proxy", "DNR / MOLST"],
    ),
    "employment_status": (
        "Employment status",
        "Employer: Employment Status",
        ["Full time", "Part time", "Retired", "Student", "Unemployed", "Self-employed"],
    ),
    "copay_status": (
        "Copay / deductible status",
        "Financial Information: Copay / Deductible Status",
        ["Copay due", "Copay collected", "Deductible not met", "Deductible met", "Waived"],
    ),
}

# window -> (title, [(field key, built-in label, locked)]). Locked fields can be relabelled and
# made required but never hidden or view-only: the chart and growth curves depend on them.
WINDOWS = {
    "identity": (
        "Patient Identity",
        [
            ("date_of_birth", "Date of Birth", True),
            ("address", "Address", False),
            ("phone_number", "Phone Number", False),
            ("legal_sex", "Legal Sex", True),
            ("ssn_last4", "Social Security Number (last 4 digits)", False),
            ("preferred_language", "Preferred Language", False),
            ("email", "Email", False),
        ],
    ),
    "emergency": (
        "Emergency Contact",
        [
            ("emergency_contact_name", "Contact Name", False),
            ("emergency_contact_relationship", "Relationship", False),
            ("emergency_contact_phone", "Phone Number", False),
            ("emergency_contact_address", "Address", False),
        ],
    ),
    "financial": (
        "Financial Information",
        [
            ("insurance_payer_name", "Insurance Payer Name", False),
            ("insurance_member_id", "Member ID", False),
            ("insurance_group_number", "Group Number", False),
            ("policyholder_name", "Policyholder Name", False),
            ("policyholder_dob", "Policyholder Date of Birth", False),
            ("copay_deductible_status", "Copay / Deductible Status", False),
            ("authorization_requirements", "Authorization Requirements", False),
            ("secondary_insurance", "Secondary Insurance", False),
        ],
    ),
    "demographics": (
        "Demographics",
        [
            ("title", "Title", False),
            ("middle_name", "Middle Name", False),
            ("suffix", "Suffix", False),
            ("marital_status", "Marital Status", False),
            ("race", "Race", False),
            ("ethnicity", "Ethnicity", False),
            ("religion", "Religion", False),
            ("veteran_status", "Veteran Status", False),
            ("secondary_phone", "Secondary Phone", False),
            ("address2", "Address 2", False),
            ("city", "City", False),
            ("state", "State", False),
            ("zip_code", "ZIP Code", False),
            ("address_type", "Address Type", False),
        ],
    ),
    "contacts": (
        "Contacts",
        [
            ("directive_type", "Advance Directive on File", False),
            ("directive_received_date", "Directive Date Received", False),
        ],
    ),
    "insurance": (
        "Insurance",
        [
            ("authorization_number", "Authorization Number", False),
            ("copay_due", "Copay Due Today", False),
        ],
    ),
    "guarantor": (
        "Guarantor",
        [
            ("name", "Name", False),
            ("relationship", "Relationship", False),
            ("phone", "Phone", False),
            ("address", "Address", False),
        ],
    ),
    "employer": (
        "Employer",
        [
            ("employer_name", "Employer", False),
            ("employment_status", "Employment Status", False),
            ("occupation", "Occupation", False),
            ("phone", "Phone", False),
            ("from_date", "From Date", False),
        ],
    ),
    "reason": (
        "Reason for Visit",
        [
            ("reason_for_visit", "Reason for Visit", False),
            ("presenting_problem", "Chief Complaint", False),
            ("scheduled_procedure", "Scheduled Procedure", False),
            ("referring_physician", "Referring Physician", False),
            ("current_diagnoses", "Current Diagnoses", False),
        ],
    ),
    "logistics": (
        "Logistics",
        [
            ("arrival_time", "Arrival Time", False),
        ],
    ),
}

MODES = [("opt", "Optional"), ("req", "Required"), ("view", "View-only"), ("hid", "Hidden")]
MODE_KEYS = {k for k, _ in MODES}
MAX_LABEL = 60


# ---------- dictionaries ----------

def default_entries(code):
    return [{"value": v, "abbr": "", "active": True} for v in DICTIONARIES[code][2]]


def clean_entries(raw):
    """(entries, error). Values must be unique ignoring case; an abbreviation is at most 5 characters."""
    if not isinstance(raw, list):
        return None, "entries must be a list."
    if len(raw) > MAX_ENTRIES:
        return None, f"A dictionary can hold at most {MAX_ENTRIES} entries."
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            return None, "Each entry needs a value."
        value = str(item.get("value") or "").strip()
        if not value:
            return None, "An entry has no value."
        if len(value) > MAX_VALUE:
            return None, f"'{value[:20]}...' is longer than {MAX_VALUE} characters."
        if value.lower() in seen:
            return None, f"'{value}' is listed twice."
        seen.add(value.lower())
        abbr = str(item.get("abbr") or "").strip()
        if len(abbr) > 5:
            return None, f"The abbreviation for '{value}' is longer than 5 characters."
        out.append({"value": value, "abbr": abbr, "active": bool(item.get("active", True))})
    return out, None


def resolve_dictionary(org, code):
    """(entries, source)."""
    if org is not None:
        row = RegistrationDictionary.objects.filter(organization=org, code=code).first()
        if row is not None:
            return row.entries, "organization"
    return default_entries(code), "default"


class RegistrationDictionariesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, request, org):
        saved = {}
        if org is not None:
            saved = {r.code: r.entries for r in RegistrationDictionary.objects.filter(organization=org)}
        items = []
        for code, (title, used_on, _defaults) in DICTIONARIES.items():
            entries = saved.get(code)
            items.append(
                {
                    "code": code,
                    "title": title,
                    "used_on": used_on,
                    "source": "organization" if code in saved else "default",
                    "entries": entries if code in saved else default_entries(code),
                }
            )
        return {"organization": org.pk if org else None, "dictionaries": items, "can_edit": request.user.role in ADMIN_ROLES}

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        return Response(self._payload(request, _target_org(request)))

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change dictionaries."}, status=403)
        code = request.data.get("code")
        if code not in DICTIONARIES:
            return Response({"detail": "Unknown dictionary."}, status=400)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        entries, error = clean_entries(request.data.get("entries"))
        if error:
            return Response({"detail": error}, status=400)
        if not any(e["active"] for e in entries):
            return Response({"detail": "Keep at least one active entry."}, status=400)
        RegistrationDictionary.objects.update_or_create(
            organization=org, code=code, defaults={"entries": entries, "updated_by": request.user}
        )
        return Response(self._payload(request, org))

    def delete(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change dictionaries."}, status=403)
        code = request.query_params.get("code")
        if code not in DICTIONARIES:
            return Response({"detail": "Unknown dictionary."}, status=400)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        RegistrationDictionary.objects.filter(organization=org, code=code).delete()
        return Response(self._payload(request, org))


# ---------- field settings ----------

def clean_fields(window, raw):
    """(settings_map, error). Only fields that differ from the built-in label and Optional are kept."""
    if window not in WINDOWS:
        return None, "Unknown step."
    if not isinstance(raw, dict):
        return None, "fields must be an object."
    catalog = {k: (label, locked) for k, label, locked in WINDOWS[window][1]}
    out = {}
    for key, cfg in raw.items():
        if key not in catalog:
            return None, f"Unknown field: {key}"
        if not isinstance(cfg, dict):
            return None, f"Settings for {key} must be an object."
        default_label, locked = catalog[key]
        mode = cfg.get("mode") or "opt"
        if mode not in MODE_KEYS:
            return None, f"Unknown setting '{mode}' for {default_label}."
        if locked and mode in ("hid", "view"):
            return None, f"{default_label} cannot be hidden or view-only."
        label = str(cfg.get("label") or "").strip()
        if len(label) > MAX_LABEL:
            return None, f"The label for {default_label} is longer than {MAX_LABEL} characters."
        entry = {}
        if label and label != default_label:
            entry["label"] = label
        if mode != "opt":
            entry["mode"] = mode
        if entry:
            out[key] = entry
    return out, None


def _window_fields(window, saved):
    rows = []
    for key, default_label, locked in WINDOWS[window][1]:
        cfg = saved.get(key, {})
        rows.append(
            {
                "key": key,
                "default_label": default_label,
                "label": cfg.get("label") or default_label,
                "mode": cfg.get("mode") or "opt",
                "locked": locked,
            }
        )
    return rows


class RegistrationFieldsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, request, org):
        saved = {}
        if org is not None:
            saved = {r.window: r.settings_map for r in RegistrationFieldSetting.objects.filter(organization=org)}
        windows = [
            {
                "key": window,
                "title": title,
                "source": "organization" if window in saved else "default",
                "fields": _window_fields(window, saved.get(window, {})),
            }
            for window, (title, _fields) in WINDOWS.items()
        ]
        return {
            "organization": org.pk if org else None,
            "windows": windows,
            "modes": [{"key": k, "label": label} for k, label in MODES],
            "can_edit": request.user.role in ADMIN_ROLES,
        }

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        return Response(self._payload(request, _target_org(request)))

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change field settings."}, status=403)
        window = request.data.get("window")
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        cleaned, error = clean_fields(window, request.data.get("fields"))
        if error:
            return Response({"detail": error}, status=400)
        if cleaned:
            RegistrationFieldSetting.objects.update_or_create(
                organization=org, window=window, defaults={"settings_map": cleaned, "updated_by": request.user}
            )
        else:
            RegistrationFieldSetting.objects.filter(organization=org, window=window).delete()
        return Response(self._payload(request, org))

    def delete(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change field settings."}, status=403)
        window = request.query_params.get("window")
        if window not in WINDOWS:
            return Response({"detail": "Unknown step."}, status=400)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        RegistrationFieldSetting.objects.filter(organization=org, window=window).delete()
        return Response(self._payload(request, org))
