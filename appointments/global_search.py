"""Header search: find patients, medical record numbers and visits in one box.

The text typed is recognised first (a visit number, an MRN, a date of birth, a phone number, or a
name) and the matching rows come back already shaped for the search panel. A person only ever sees
their own clinic's patients; a system administrator sees every clinic until they choose one.

Names are matched word by word in any order ("Santos Maria", "Santos, Maria"). When nothing matches,
close spellings are offered instead ("smyth" -> Smith, Smythe).
"""

import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher

from django.db.models import CharField, Q, Value
from django.db.models.functions import Replace

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import Patient, Registration

from .patient_header import CARE_SETTING_LABELS, _age_text, _visit_row

STAFF_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
PATIENT_LIMIT = 8
VISIT_LIMIT = 6
SUGGEST_LIMIT = 5
FUZZY_POOL = 5000  # patients compared when nothing matched by spelling
MINE_LIMIT = 10

BADGES = {"acute": "In house", "emergency": "In ED", "ambulatory": "Outpatient"}


# --- recognising what was typed -------------------------------------------------

_VN = re.compile(r"^vn[-\s]?(\d{1,9})$", re.I)
_MRN = re.compile(r"^mrn[-\s]?(\d{1,9})$", re.I)
_US_DATE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$")
_ISO_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
_DIGITS = re.compile(r"^[\d\s().+-]{4,}$")


def _parse_date(text):
    m = _ISO_DATE.match(text)
    if m:
        y, mo, d = (int(g) for g in m.groups())
    else:
        m = _US_DATE.match(text)
        if not m:
            return None
        mo, d, y = (int(g) for g in m.groups())
        if y < 100:
            y += 2000 if y <= date.today().year % 100 else 1900
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def detect(text):
    """('vn'|'mrn'|'dob'|'phone'|'name', value) for what was typed."""
    t = (text or "").strip()
    if m := _VN.match(t):
        return "vn", int(m.group(1))
    if m := _MRN.match(t):
        return "mrn", int(m.group(1))
    if (d := _parse_date(t)) is not None:
        return "dob", d
    if _DIGITS.match(t) and len(re.sub(r"\D", "", t)) >= 4:
        return "phone", re.sub(r"\D", "", t)
    return "name", t


def _plain(text):
    """Lower case, no accents, letters and digits only."""
    text = unicodedata.normalize("NFKD", text or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if not unicodedata.combining(c)).lower())


def _words(text):
    return [w for w in re.split(r"[\s,;]+", (text or "").strip()) if w]


def _soundex(word):
    word = _plain(word)
    word = re.sub(r"\d", "", word)
    if not word:
        return ""
    codes = {c: d for d, letters in {"1": "bfpv", "2": "cgjkqsxz", "3": "dt", "4": "l", "5": "mn", "6": "r"}.items() for c in letters}
    out, last = word[0].upper(), codes.get(word[0], "")
    for c in word[1:]:
        code = codes.get(c, "")
        if code and code != last:
            out += code
        if c not in "hw":
            last = code
    return (out + "000")[:4]


# --- scope ----------------------------------------------------------------------

def _patients(user):
    qs = Patient.objects.select_related("user", "user__organization")
    if not sees_all_orgs(user) and user.organization_id is not None:
        qs = qs.filter(user__organization_id=user.organization_id)
    return qs.filter(user__role="patient")


def _visits(user):
    qs = Registration.objects.select_related(
        "patient", "patient__user", "attending_provider", "facility", "unit", "room", "bed"
    )
    if not sees_all_orgs(user) and user.organization_id is not None:
        qs = qs.filter(patient__user__organization_id=user.organization_id)
    return qs


def _strip(field):
    """The phone column with the punctuation taken out, so (301) 880-6015 matches 3018806015."""
    expr = field
    for ch in " ()-.+":
        expr = Replace(expr, Value(ch), Value(""), output_field=CharField())
    return expr


# --- finding ----------------------------------------------------------------------

def _name_filter(text):
    q = Q()
    for word in _words(text):
        q &= (
            Q(user__first_name__icontains=word)
            | Q(user__last_name__icontains=word)
            | Q(middle_name__icontains=word)
        )
    return q


def _find_patients(user, kind, value, text):
    qs = _patients(user)
    if kind == "mrn":
        exact = list(qs.filter(mrn__iexact=f"MRN-{value:06d}"))
        return exact or list(qs.filter(mrn__icontains=str(value)).order_by("mrn")[:PATIENT_LIMIT])
    if kind == "dob":
        return list(qs.filter(date_of_birth=value).order_by("user__last_name", "user__first_name")[:PATIENT_LIMIT])
    if kind == "phone":
        qs = qs.annotate(p1=_strip("phone_number"), p2=_strip("secondary_phone")).filter(
            Q(p1__contains=value) | Q(p2__contains=value)
        )
        found = list(qs.order_by("user__last_name", "user__first_name")[:PATIENT_LIMIT])
        if len(value) <= 6:  # a short number may be the number part of an MRN
            for p in _patients(user).filter(mrn__iexact=f"MRN-{int(value):06d}"):
                if p not in found:
                    found.insert(0, p)
        return found
    if kind == "name":
        if not _words(text):
            return []
        return list(qs.filter(_name_filter(text)).order_by("user__last_name", "user__first_name")[:PATIENT_LIMIT])
    return []


def _suggestions(user, text):
    """Close spellings for a name that matched nothing."""
    words = [_plain(w) for w in _words(text) if _plain(w)]
    if not words:
        return []
    scored = []
    pool = _patients(user).order_by("pk")[:FUZZY_POOL]
    for p in pool:
        names = [_plain(p.user.first_name), _plain(p.user.last_name), _plain(p.middle_name)]
        names = [n for n in names if n]
        total = 0.0
        for w in words:
            best = 0.0
            for n in names:
                ratio = SequenceMatcher(None, w, n).ratio()
                if len(w) >= 3 and _soundex(w) and _soundex(w) == _soundex(n):
                    ratio = max(ratio, 0.8)
                if n.startswith(w) and len(w) >= 3:
                    ratio = max(ratio, 0.85)
                best = max(best, ratio)
            if best < 0.75:
                total = 0
                break
            total += best
        if total:
            scored.append((total / len(words), p))
    scored.sort(key=lambda s: (-s[0], s[1].user.last_name, s[1].user.first_name))
    return [p for _, p in scored[:SUGGEST_LIMIT]]


# --- shaping rows ----------------------------------------------------------------------

def _full_name(u):
    return f"{u.first_name} {u.last_name}".strip() or u.username


def _latest_visits(user, patient_ids):
    """{patient pk: newest visit} for the given patients."""
    latest = {}
    for v in _visits(user).filter(patient_id__in=patient_ids).order_by("-created_at", "-pk"):
        latest.setdefault(v.patient_id, v)
    return latest


def _patient_row(p, latest, matched_by):
    v = latest.get(p.pk)
    visit = None
    badge = ""
    if v is not None:
        row = _visit_row(v, v.pk)
        visit = {
            "id": v.pk,
            "visit_number": row["visit_number"],
            "care_setting": row["care_setting"],
            "care_setting_label": row["care_setting_label"],
            "location": row["location"],
            "provider": row["provider"],
            "is_open": row["is_open"],
        }
        badge = BADGES.get(row["care_setting"], "") if row["is_open"] else "Discharged"
    return {
        "type": "patient",
        "user_id": p.user_id,
        "full_name": _full_name(p.user),
        "mrn": p.mrn,
        "dob": p.date_of_birth.isoformat() if p.date_of_birth else "",
        "age": _age_text(p.date_of_birth),
        "sex": p.legal_sex or "",
        "matched_by": matched_by,
        "visit": visit,
        "badge": badge,
    }


def _visit_result(v, latest_id, matched_by):
    row = _visit_row(v, latest_id)
    p = v.patient
    row.update(
        {
            "type": "visit",
            "user_id": p.user_id,
            "full_name": _full_name(p.user),
            "mrn": p.mrn,
            "matched_by": matched_by,
        }
    )
    return row


def search(user, text, care=None):
    """The search panel's rows for what was typed."""
    text = (text or "").strip()[:80]
    if not text:
        return mine(user)

    kind, value = detect(text)
    patients, visits, suggestions = [], [], []
    exact = False

    if kind == "vn":
        number = f"VN-{value:06d}"
        hits = list(_visits(user).filter(visit_number__iexact=number)) or list(
            _visits(user).filter(visit_number__icontains=str(value)).order_by("-created_at")[:VISIT_LIMIT]
        )
        exact = len(hits) == 1 and (hits[0].visit_number or "").upper() == number
        patients_by_pk = {}
        for v in hits:
            patients_by_pk.setdefault(v.patient_id, v.patient)
        patients = list(patients_by_pk.values())
        visits = hits
    else:
        patients = _find_patients(user, kind, value, text)
        exact = kind == "mrn" and len(patients) == 1 and patients[0].mrn.upper() == f"MRN-{value:06d}"
        if not patients and kind == "name":
            suggestions = _suggestions(user, text)

    shown = patients or suggestions
    latest = _latest_visits(user, [p.pk for p in shown])

    if kind != "vn" and patients:
        # recent visits of the first few patients found
        for p in patients[:3]:
            qs = _visits(user).filter(patient=p).order_by("-created_at", "-pk")[:3]
            visits.extend(qs)
        visits = visits[:VISIT_LIMIT]

    latest_for_visit = {}
    for v in visits:
        if v.patient_id not in latest_for_visit:
            nv = _latest_visits(user, [v.patient_id]).get(v.patient_id)
            latest_for_visit[v.patient_id] = nv.pk if nv else None

    matched = "visit" if kind == "vn" else kind
    prows = [_patient_row(p, latest, matched) for p in patients]
    srows = [_patient_row(p, latest, "similar") for p in suggestions]
    vrows = [_visit_result(v, latest_for_visit.get(v.patient_id), matched) for v in visits]

    if care in CARE_SETTING_LABELS:
        prows = [r for r in prows if r["visit"] and r["visit"]["care_setting"] == care]
        srows = [r for r in srows if r["visit"] and r["visit"]["care_setting"] == care]
        vrows = [r for r in vrows if r["care_setting"] == care]
        exact = exact and bool(prows or vrows)

    return {
        "query": text,
        "kind": kind,
        "exact": exact,
        "patients": prows[:PATIENT_LIMIT],
        "visits": vrows[:VISIT_LIMIT],
        "suggestions": srows,
    }


def mine(user):
    """Nothing typed yet: the patients in house under this person's name."""
    open_visits = (
        _visits(user)
        .filter(discharge_datetime__isnull=True)
        .filter(Q(attending_provider=user) | Q(assigned_nurse=user))
        .order_by("-created_at", "-pk")
    )
    seen, patients = set(), []
    for v in open_visits:
        if v.patient_id not in seen:
            seen.add(v.patient_id)
            patients.append(v.patient)
        if len(patients) >= MINE_LIMIT:
            break
    latest = _latest_visits(user, [p.pk for p in patients])
    return {
        "query": "",
        "kind": "mine",
        "exact": False,
        "patients": [_patient_row(p, latest, "mine") for p in patients],
        "visits": [],
        "suggestions": [],
    }


def kind_for_audit(text):
    """The words typed are kept in the log only when they are not themselves a birth date or phone number."""
    kind, _ = detect(text)
    return kind, (text.strip()[:60] if kind in ("name", "mrn", "vn") else "")


def can_search(user):
    return bool(user and user.is_authenticated and getattr(user, "role", None) in STAFF_ROLES)

