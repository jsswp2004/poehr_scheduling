"""
Registration tab sequences.

Full Registration is a list of steps. A clinic chooses which steps it shows, their order, and
which ones a registrar must open (review) before the registration can be saved. A sequence can be
set for every care setting or for one (ambulatory, emergency, acute).

* GET    /api/registration-tabs/?care_setting=ambulatory   the sequence in force (any staff)
* PUT    /api/registration-tabs/                           save a sequence (administrators)
* DELETE /api/registration-tabs/?care_setting=ambulatory   go back to the default (administrators)
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Registration

from .models import RegistrationTabSequence
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

# The steps that exist today. Each one holds fields the form already captures.
CATALOG = [
    ("identity", "Patient Identity"),
    ("demographics", "Demographics"),
    ("emergency", "Emergency Contact"),
    ("contacts", "Contacts"),
    ("financial", "Financial Information"),
    ("insurance", "Insurance"),
    ("payments", "Payments"),
    ("guarantor", "Guarantor"),
    ("employer", "Employer"),
    ("reason", "Reason for Visit"),
    ("visitdetails", "Visit Details"),
    ("legal", "Legal Documents"),
    ("forms", "Forms"),
    ("transportation", "Transportation"),
    ("logistics", "Logistics"),
]
LABELS = dict(CATALOG)
# Identity opens the registration and Logistics holds the visit's care setting, provider and
# location, so both always stay in the sequence.
FIRST = "identity"
REQUIRED_TABS = ("identity", "logistics")
CARE_SETTINGS = [key for key, _ in Registration.CARE_SETTING_CHOICES]

DEFAULT_TABS = [{"key": key, "require_review": False} for key, _ in CATALOG]


def _with_labels(tabs):
    return [{"key": t["key"], "label": LABELS[t["key"]], "require_review": bool(t.get("require_review"))} for t in tabs]


def resolve(org, care_setting=""):
    """(tabs, source): the sequence for this clinic and care setting, most specific first."""
    if org is not None:
        rows = {r.care_setting: r for r in RegistrationTabSequence.objects.filter(organization=org, care_setting__in=["", care_setting or ""])}
        if care_setting and care_setting in rows:
            return rows[care_setting].tabs, "care_setting"
        if "" in rows:
            return rows[""].tabs, "organization"
    return DEFAULT_TABS, "default"


def clean_tabs(raw):
    """(tabs, error). Checks the keys and the two rules about Identity and Logistics."""
    if not isinstance(raw, list) or not raw:
        return None, "tabs must be a list with at least one step."
    cleaned, seen = [], set()
    for item in raw:
        key = item.get("key") if isinstance(item, dict) else None
        if key not in LABELS:
            return None, f"Unknown step: {key}"
        if key in seen:
            return None, f"Step listed twice: {LABELS[key]}"
        seen.add(key)
        cleaned.append({"key": key, "require_review": bool(item.get("require_review", False))})
    for key in REQUIRED_TABS:
        if key not in seen:
            return None, f"{LABELS[key]} must stay in the sequence."
    if cleaned[0]["key"] != FIRST:
        return None, f"{LABELS[FIRST]} must stay first."
    return cleaned, None


def _care_setting(request, supplied=None):
    value = supplied if supplied is not None else request.query_params.get("care_setting", "")
    value = value or ""
    return value if value in CARE_SETTINGS else ("" if not value else None)


class RegistrationTabsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, request, org, care_setting):
        tabs, source = resolve(org, care_setting)
        overrides = []
        if org is not None:
            overrides = sorted(RegistrationTabSequence.objects.filter(organization=org).values_list("care_setting", flat=True))
        return {
            "organization": org.pk if org else None,
            "care_setting": care_setting,
            "tabs": _with_labels(tabs),
            "source": source,
            "overrides": ["all" if o == "" else o for o in overrides],
            "catalog": [{"key": k, "label": label, "locked": k in REQUIRED_TABS} for k, label in CATALOG],
            "can_edit": request.user.role in ADMIN_ROLES,
        }

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        care_setting = _care_setting(request)
        if care_setting is None:
            return Response({"detail": "Unknown care setting."}, status=400)
        org = _target_org(request)
        return Response(self._payload(request, org, care_setting))

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the registration steps."}, status=403)
        care_setting = _care_setting(request, request.data.get("care_setting") or "")
        if care_setting is None:
            return Response({"detail": "Unknown care setting."}, status=400)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        tabs, error = clean_tabs(request.data.get("tabs"))
        if error:
            return Response({"detail": error}, status=400)
        RegistrationTabSequence.objects.update_or_create(
            organization=org, care_setting=care_setting, defaults={"tabs": tabs, "updated_by": request.user}
        )
        return Response(self._payload(request, org, care_setting))

    def delete(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the registration steps."}, status=403)
        care_setting = _care_setting(request)
        if care_setting is None:
            return Response({"detail": "Unknown care setting."}, status=400)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        RegistrationTabSequence.objects.filter(organization=org, care_setting=care_setting).delete()
        return Response(self._payload(request, org, care_setting))
