"""
FHIR R4 lab results: a Bundle holding DiagnosticReport + Observation (+ Patient,
ServiceRequest) read into the same plain data lab_hl7.parse_oru produces, so
matching and filing (lab_intake.py) do not care which way a result arrived.

Only what we use is read. Observations are found by reference ("Observation/1",
a bundle fullUrl, or an id). An attached document (presentedForm) is noted but
not imported.
"""

import re
from datetime import date

from django.utils.dateparse import parse_date, parse_datetime

LOINC_SYSTEM = "http://loinc.org"


class FhirError(Exception):
    """The bundle cannot be read (the sender should be told, not silently dropped)."""


REPORT_STATUS = {
    "final": "final",
    "amended": "corrected",
    "corrected": "corrected",
    "appended": "corrected",
    "preliminary": "preliminary",
    "partial": "preliminary",
    "registered": "preliminary",
    "cancelled": "cancelled",
    "entered-in-error": "cancelled",
}

# Observation.interpretation (v3 ObservationInterpretation) -> our flag
INTERPRETATION = {
    "N": "",
    "H": "H",
    "L": "L",
    "HH": "HH",
    "LL": "LL",
    "CH": "HH",
    "CL": "LL",
    "HU": "H",
    "LU": "L",
    "A": "A",
    "AA": "A",
    "R": "A",
    ">": "H",
    "<": "L",
}


def _coding_text(codeable):
    if not isinstance(codeable, dict):
        return ""
    if codeable.get("text"):
        return str(codeable["text"]).strip()
    for coding in codeable.get("coding") or []:
        if coding.get("display"):
            return str(coding["display"]).strip()
    for coding in codeable.get("coding") or []:
        if coding.get("code"):
            return str(coding["code"]).strip()
    return ""


def _loinc(codeable):
    for coding in (codeable or {}).get("coding") or []:
        if coding.get("system") == LOINC_SYSTEM and coding.get("code"):
            return str(coding["code"])
    return ""


def _datetime(value):
    if not value:
        return None
    value = str(value)
    dt = parse_datetime(value)
    if dt is not None:
        from django.utils import timezone

        return dt if dt.tzinfo else timezone.make_aware(dt, timezone.get_current_timezone())
    d = parse_date(value[:10]) if re.match(r"\d{4}-\d{2}-\d{2}", value) else None
    if d is not None:
        from datetime import datetime

        from django.utils import timezone

        return timezone.make_aware(datetime(d.year, d.month, d.day), timezone.get_current_timezone())
    return None


def _number(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _range_text(observation):
    ranges = observation.get("referenceRange") or []
    if not ranges:
        return ""
    r = ranges[0]
    if r.get("text"):
        return str(r["text"]).strip()
    low = (r.get("low") or {}).get("value")
    high = (r.get("high") or {}).get("value")
    if low is not None and high is not None:
        return f"{_number(low)}-{_number(high)}"
    if high is not None:
        return f"<{_number(high)}"
    if low is not None:
        return f">{_number(low)}"
    return ""


def _value(observation):
    if "valueQuantity" in observation:
        q = observation["valueQuantity"] or {}
        comparator = q.get("comparator", "")
        return f"{comparator}{_number(q.get('value'))}".strip(), q.get("unit") or q.get("code") or ""
    if "valueString" in observation:
        return str(observation["valueString"]).strip(), ""
    if "valueCodeableConcept" in observation:
        return _coding_text(observation["valueCodeableConcept"]), ""
    if "valueInteger" in observation:
        return _number(observation["valueInteger"]), ""
    if "valueBoolean" in observation:
        return "Positive" if observation["valueBoolean"] else "Negative", ""
    return "", ""


def _identifier_values(resource):
    return [str(i["value"]) for i in resource.get("identifier") or [] if i.get("value")]


def _index(entries):
    """Look resources up by 'Type/id', by fullUrl, and by bare id."""
    index = {}
    for entry in entries:
        resource = entry.get("resource") if isinstance(entry, dict) else None
        if not isinstance(resource, dict):
            continue
        rtype, rid = resource.get("resourceType"), resource.get("id")
        if rtype and rid:
            index[f"{rtype}/{rid}"] = resource
        if entry.get("fullUrl"):
            index[entry["fullUrl"]] = resource
    return index


def _resolve(ref, index):
    if not isinstance(ref, dict):
        return None
    key = ref.get("reference")
    if not key:
        return None
    if key in index:
        return index[key]
    return index.get("/".join(key.rstrip("/").split("/")[-2:]))


def parse_bundle(bundle):
    if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
        raise FhirError("Send a FHIR Bundle.")
    entries = bundle.get("entry") or []
    index = _index(entries)
    resources = [e["resource"] for e in entries if isinstance(e, dict) and isinstance(e.get("resource"), dict)]
    reports = [r for r in resources if r.get("resourceType") == "DiagnosticReport"]
    if not reports:
        raise FhirError("The bundle has no DiagnosticReport.")

    patient = None
    out_reports = []
    for dr in reports:
        subject = _resolve(dr.get("subject"), index)
        if subject is None:
            subject = next((r for r in resources if r.get("resourceType") == "Patient"), None)
        if subject is None:
            raise FhirError("A DiagnosticReport has no Patient.")
        if patient is None:
            name = (subject.get("name") or [{}])[0]
            patient = {
                "ids": _identifier_values(subject),
                "last": str(name.get("family") or "").strip(),
                "first": str((name.get("given") or [""])[0]).strip(),
                "dob": parse_date(subject["birthDate"]) if subject.get("birthDate") else None,
                "sex": str(subject.get("gender") or ""),
            }

        placer = ""
        for ref in dr.get("basedOn") or []:
            sr = _resolve(ref, index)
            if sr is not None:
                values = _identifier_values(sr)
                if values:
                    placer = values[0]
                    break
        filler = (_identifier_values(dr) or [""])[0]

        items = []
        for ref in dr.get("result") or []:
            obs = _resolve(ref, index)
            if obs is None or obs.get("status") in ("cancelled", "entered-in-error"):
                continue
            value, unit = _value(obs)
            if not value:
                continue
            interp = ((obs.get("interpretation") or [{}])[0].get("coding") or [{}])[0].get("code", "")
            note = " ".join(str(n.get("text", "")).strip() for n in obs.get("note") or [] if n.get("text"))
            items.append(
                {
                    "test_name": _coding_text(obs.get("code")),
                    "loinc_code": _loinc(obs.get("code")),
                    "value": value,
                    "units": unit,
                    "reference_range": _range_text(obs),
                    "abnormal_flag": INTERPRETATION.get(str(interp).upper(), "A" if interp else ""),
                    "comment": note,
                }
            )

        out_reports.append(
            {
                "placer": placer,
                "filler": filler,
                "code": ((dr.get("code") or {}).get("coding") or [{}])[0].get("code", ""),
                "loinc_code": _loinc(dr.get("code")),
                "title": _coding_text(dr.get("code")) or "Lab report",
                "collected_at": _datetime(dr.get("effectiveDateTime") or (dr.get("effectivePeriod") or {}).get("start")),
                "resulted_at": _datetime(dr.get("issued")),
                "status": REPORT_STATUS.get(str(dr.get("status", "")).lower(), "preliminary"),
                "comment": str(dr.get("conclusion") or "").strip(),
                "has_document": bool(dr.get("presentedForm")),
                "items": items,
            }
        )

    return {
        "control_id": str(bundle.get("id") or ""),
        "sending_app": "",
        "sending_facility": "",
        "version": "R4",
        "patient": patient,
        "reports": out_reports,
    }
