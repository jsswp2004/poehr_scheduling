"""
System Dictionaries: configurable lists shown as choices across the app. The first one is "roles".

Everyone signed in can read a dictionary (Create Profile needs the role list). Only a system administrator can
change one. Built-in (locked) entries keep their value and cannot be removed, because access checks depend on
them; their label and order can change. A new entry for roles names the built-in role it behaves like.
"""
import re

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CustomUser, Dictionary, DictionaryEntry

DISPLAY_TYPES = [d for d, _ in Dictionary.DISPLAY_CHOICES]
VALUE_RE = re.compile(r"^[a-z][a-z0-9_]{1,49}$")


def entry_payload(e):
    return {
        "id": e.id, "value": e.value, "label": e.label, "behaves_like": e.behaves_like,
        "sort_order": e.sort_order, "is_active": e.is_active, "is_locked": e.is_locked,
    }


def dictionary_payload(d, include_inactive):
    entries = d.entries.all() if include_inactive else d.entries.filter(is_active=True)
    return {
        "code": d.code, "name": d.name, "used_by": d.used_by, "display_type": d.display_type,
        "display_types": [{"value": v, "label": l} for v, l in Dictionary.DISPLAY_CHOICES],
        "entries": [entry_payload(e) for e in entries],
    }


def built_in_role_values():
    return [v for v, _ in CustomUser.ROLE_CHOICES if v != "none"]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_list(request):
    if request.user.role != "system_admin":
        return Response({"detail": "Only a system administrator can manage dictionaries."}, status=403)
    return Response([
        {"code": d.code, "name": d.name, "used_by": d.used_by, "display_type": d.display_type, "entry_count": d.entries.count()}
        for d in Dictionary.objects.all()
    ])


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def dictionary_detail(request, code):
    d = Dictionary.objects.filter(code=code).first()
    if d is None:
        return Response({"detail": "No such dictionary."}, status=404)
    is_sys = request.user.role == "system_admin"
    if request.method == "GET":
        return Response(dictionary_payload(d, include_inactive=is_sys))
    if not is_sys:
        return Response({"detail": "Only a system administrator can change dictionaries."}, status=403)

    data = request.data
    if "display_type" in data:
        if data["display_type"] not in DISPLAY_TYPES:
            return Response({"display_type": ["Choose checkboxes, radio buttons, dropdown or searchable dropdown."]}, status=400)
        d.display_type = data["display_type"]
    if "name" in data and str(data["name"]).strip():
        d.name = str(data["name"]).strip()[:100]

    if "entries" in data:
        sent = data["entries"]
        if not isinstance(sent, list):
            return Response({"entries": ["Send a list of entries."]}, status=400)
        existing = {e.value: e for e in d.entries.all()}
        seen = set()
        valid_roles = built_in_role_values()
        for i, item in enumerate(sent):
            value = str(item.get("value", "")).strip()
            label = str(item.get("label", "")).strip()
            if not label:
                return Response({"entries": [f"Row {i + 1} needs a label."]}, status=400)
            if value in seen:
                return Response({"entries": [f"The value '{value}' is used twice."]}, status=400)
            seen.add(value)
            current = existing.get(value)
            if current is None:
                if not VALUE_RE.match(value):
                    return Response({"entries": [f"'{value}' is not a valid stored value. Use lowercase letters, numbers and underscores."]}, status=400)
                if d.code == "roles" and item.get("behaves_like") not in valid_roles:
                    return Response({"entries": [f"Choose which built-in role '{label}' behaves like."]}, status=400)
        missing = [v for v, e in existing.items() if e.is_locked and v not in seen]
        if missing:
            return Response({"entries": [f"Built-in entries cannot be removed: {', '.join(missing)}."]}, status=400)
        locked_off = [item.get("value") for item in sent if existing.get(item.get("value")) and existing[item["value"]].is_locked and item.get("is_active") is False]
        if locked_off:
            return Response({"entries": [f"Built-in entries cannot be turned off: {', '.join(locked_off)}."]}, status=400)
        # Entries dropped from the list are deleted only when nobody holds them.
        for value, e in existing.items():
            if value not in seen:
                if CustomUser.objects.filter(role_entry=e).exists():
                    return Response({"entries": [f"'{e.label}' is assigned to people. Turn it off instead of removing it."]}, status=400)
        for value, e in existing.items():
            if value not in seen:
                e.delete()
        for i, item in enumerate(sent):
            value = str(item["value"]).strip()
            label = str(item["label"]).strip()[:100]
            e = existing.get(value)
            if e is None:
                DictionaryEntry.objects.create(
                    dictionary=d, value=value, label=label, behaves_like=item.get("behaves_like", "") if d.code == "roles" else "",
                    sort_order=i * 10, is_active=item.get("is_active", True) is not False,
                )
            else:
                e.label = label
                e.sort_order = i * 10
                if not e.is_locked:
                    e.is_active = item.get("is_active", True) is not False
                e.save()
    d.save()
    return Response(dictionary_payload(d, include_inactive=True))


def resolve_role(value):
    """('built-in role, DictionaryEntry or None)') for a role value chosen in Create Profile, or None if unknown."""
    if value in built_in_role_values() or value == "none":
        return value, None
    entry = DictionaryEntry.objects.filter(dictionary__code="roles", value=value, is_active=True).first()
    if entry and entry.behaves_like in built_in_role_values():
        return entry.behaves_like, entry
    return None
