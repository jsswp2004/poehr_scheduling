"""
Chart tabs: which tabs the Patients page shows for each module, their order, and which one
opens first.

* The built-in default is every tab, in the usual order, opening on the patient list.
* A clinic's administrator can change that per module (Ambulatory, Emergency, Acute).
* Each person can then reorder and hide tabs for themselves, but only among the tabs the
  clinic's default leaves available.

The server works out the final list, so the Patients page just draws it.
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChartTabLayout
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

CARE_SETTINGS = ("ambulatory", "emergency", "acute")
CLINICAL_ROLES = ("doctor", "nurse", "admin", "system_admin")
LIST_TAB = "patient_list"  # always shown: it is how a patient gets chosen

# key, label, needs a clinical role
CATALOG = [
    ("patient_list", "Patient List", False),
    ("orders", "Orders", True),
    ("results", "Results", True),
    ("patient_info", "Patient Info", False),
    ("documents", "Documents", True),
    ("flowsheets", "Flowsheets", True),
    ("my_schedule", "My Schedule", False),
    ("referral_list", "Referral List", False),
    ("clinical_summary", "Clinical Summary", True),
]
KEYS = [k for k, _, _ in CATALOG]
CLINICAL = {k for k, _, c in CATALOG if c}
LABELS = {k: label for k, label, _ in CATALOG}


def _tab_allowed(key, role):
    return key in KEYS and (key not in CLINICAL or role in CLINICAL_ROLES)


def _clean_items(raw):
    """Valid, de-duplicated items in the order given; unknown keys are dropped."""
    out, seen = [], set()
    for item in raw if isinstance(raw, list) else []:
        key = item.get("key") if isinstance(item, dict) else None
        if key in KEYS and key not in seen:
            seen.add(key)
            out.append({"key": key, "visible": bool(item.get("visible", True)) or key == LIST_TAB})
    return out


def _complete(items, visible_default=True):
    """Saved items first, then every tab not mentioned (so newly built tabs appear)."""
    out = _clean_items(items)
    seen = {i["key"] for i in out}
    out += [{"key": k, "visible": visible_default} for k in KEYS if k not in seen]
    return out


def _pick_default(wanted, visible_keys):
    return wanted if wanted in visible_keys else (LIST_TAB if LIST_TAB in visible_keys else (visible_keys[0] if visible_keys else LIST_TAB))


def _row(org, care_setting, user=None):
    return ChartTabLayout.objects.filter(organization=org, care_setting=care_setting, user=user).first()


def org_layout(org, care_setting):
    """The clinic default for one module: every tab listed, with visible flags, and the opening tab."""
    row = _row(org, care_setting) if org else None
    # a clinic that saved a layout keeps unlisted tabs hidden; one that never did gets every tab
    items = _complete(row.items, visible_default=False) if row else _complete([])
    visible = [i["key"] for i in items if i["visible"]]
    return items, _pick_default(row.default_tab if row else "", visible), bool(row)


def resolve(org, user, care_setting):
    """
    What this person sees for one module. `items` is the editable list for their own
    arrangement (only the tabs the clinic makes available); `tabs` is what is actually shown.
    """
    role = user.role
    org_items, org_default, org_custom = org_layout(org, care_setting)
    available = [i["key"] for i in org_items if i["visible"] and _tab_allowed(i["key"], role)]
    mine = _row(org, care_setting, user)
    my_items = _clean_items(mine.items) if mine else []
    my_items = [i for i in my_items if i["key"] in available]
    seen = {i["key"] for i in my_items}
    # tabs the person never arranged (for example, ones the clinic added later) go at the end
    my_items += [{"key": k, "visible": True} for k in available if k not in seen]
    tabs = [i["key"] for i in my_items if i["visible"]]
    wanted = (mine.default_tab if mine and mine.default_tab else org_default)
    return {
        "care_setting": care_setting,
        "tabs": tabs,
        "default_tab": _pick_default(wanted, tabs),
        "items": [{"key": i["key"], "label": LABELS[i["key"]], "visible": i["visible"], "locked": i["key"] == LIST_TAB} for i in my_items],
        "customized": bool(mine),
        "my_default_tab": mine.default_tab if mine and mine.default_tab in available else "",
        "org_default_tab": org_default,
        "org_customized": org_custom,
    }


def _care_setting(value):
    return value if value in CARE_SETTINGS else None


def _validate_payload(request):
    care = _care_setting(request.data.get("care_setting"))
    if not care:
        return None, None, None, Response({"detail": "care_setting must be ambulatory, emergency or acute."}, status=400)
    raw = request.data.get("items")
    if not isinstance(raw, list):
        return None, None, None, Response({"detail": "items must be a list."}, status=400)
    keys = [i.get("key") for i in raw if isinstance(i, dict)]
    unknown = [k for k in keys if k not in KEYS]
    if unknown:
        return None, None, None, Response({"detail": f"Unknown tab: {unknown[0]}"}, status=400)
    if len(set(keys)) != len(keys):
        return None, None, None, Response({"detail": "A tab is listed twice."}, status=400)
    items = _clean_items(raw)
    if not any(i["key"] == LIST_TAB for i in items):
        items.insert(0, {"key": LIST_TAB, "visible": True})  # the list is always there
    visible = [i["key"] for i in items if i["visible"]]
    default_tab = request.data.get("default_tab") or ""
    if default_tab and default_tab not in visible:
        return None, None, None, Response({"detail": "The opening tab must be one of the tabs that are shown."}, status=400)
    return care, items, default_tab, None


class ChartTabsView(APIView):
    """GET everything the Patients page and Settings need: each module's layout for this person."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        return Response(
            {
                "organization": org.pk,
                "can_edit_defaults": request.user.role in ADMIN_ROLES,
                "catalog": [{"key": k, "label": label, "clinical": c} for k, label, c in CATALOG],
                "settings": {care: resolve(org, request.user, care) for care in CARE_SETTINGS},
            }
        )


class MyChartTabsView(APIView):
    """PUT: save my own arrangement for one module. DELETE ?care_setting=: go back to the default."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        care, items, default_tab, err = _validate_payload(request)
        if err:
            return err
        available = {i["key"] for i in org_layout(org, care)[0] if i["visible"]}
        extra = [i["key"] for i in items if i["visible"] and i["key"] not in available]
        if extra:
            return Response({"detail": f"{LABELS[extra[0]]} is not available in this module."}, status=400)
        ChartTabLayout.objects.update_or_create(
            organization=org, care_setting=care, user=request.user, defaults={"items": items, "default_tab": default_tab}
        )
        return Response(resolve(org, request.user, care))

    def delete(self, request):
        care = _care_setting(request.query_params.get("care_setting"))
        if not care:
            return Response({"detail": "care_setting must be ambulatory, emergency or acute."}, status=400)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        ChartTabLayout.objects.filter(organization=org, care_setting=care, user=request.user).delete()
        return Response(resolve(org, request.user, care))


class OrgChartTabsView(APIView):
    """Administrators: the clinic default for one module. GET lists every tab; PUT saves; DELETE resets."""

    permission_classes = [permissions.IsAuthenticated]

    def _guard(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the clinic's tabs."}, status=403)
        return None

    def get(self, request):
        denied = self._guard(request)
        if denied:
            return denied
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        out = {}
        for care in CARE_SETTINGS:
            items, default_tab, custom = org_layout(org, care)
            out[care] = {
                "items": [{"key": i["key"], "label": LABELS[i["key"]], "visible": i["visible"], "locked": i["key"] == LIST_TAB} for i in items],
                "default_tab": default_tab,
                "customized": custom,
            }
        return Response({"organization": org.pk, "settings": out})

    def put(self, request):
        denied = self._guard(request)
        if denied:
            return denied
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        care, items, default_tab, err = _validate_payload(request)
        if err:
            return err
        ChartTabLayout.objects.update_or_create(
            organization=org, care_setting=care, user=None, defaults={"items": items, "default_tab": default_tab}
        )
        items2, default2, custom = org_layout(org, care)
        return Response({"care_setting": care, "items": items2, "default_tab": default2, "customized": custom})

    def delete(self, request):
        denied = self._guard(request)
        if denied:
            return denied
        care = _care_setting(request.query_params.get("care_setting"))
        if not care:
            return Response({"detail": "care_setting must be ambulatory, emergency or acute."}, status=400)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        ChartTabLayout.objects.filter(organization=org, care_setting=care, user=None).delete()
        return Response({"care_setting": care, "customized": False})
