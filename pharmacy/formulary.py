"""
POWER Pharmacy Formulary: one SHARED POWER formulary that each clinic can override.

Data model (the least invasive fit for how orderables are already owned):
* A formulary item IS a medication `Orderable`. organization = None -> shared (owned by POWER system
  administrators, like every shared orderable); organization = a clinic -> that clinic's own item.
  The same item is what nurses order inpatient and what prescribers pick in the prescription writer.
* RxNorm codes are SHARED: on a shared item only POWER system administrators change them (like the rest of the
  definition). Starter items have none; a pharmacist or administrator fills them in on screen or by CSV.
* Prices are PER CLINIC (`PharmacyPrice` linked to the item, with the clinic as organization): each clinic sets its
  own price, unit and VAT-exempt flag for shared items and for its own items. There is no shared price; rows with no
  organization from before (shared prices) are kept in the database but ignored. With no formulary price, the
  in-house fill falls back to the clinic's Phase 2 price-table rows ("no price, no dispense" still applies).
* A clinic's other local values for a shared item (active/hidden, dangerous drug, renal threshold) are a
  `FormularyOverride` row holding only the overridden fields. Reverting a field deletes it from the row.
* "Needs pharmacist review" is a `FormularyReview` per item (no row = needs review). A clinical change to the item
  itself, or any change by an import, sets it back to needs review. Shared items are reviewed at POWER level (system
  administrators and pharmacists flagged as POWER formulary reviewers); a clinic's own item by that clinic's
  pharmacist. A clinic's overrides of a shared item have no review status of their own: they are the clinic's own
  pharmacist decisions and are recorded, with who made them, in the item's history.
* Every change, by hand, by import, by revert or by the flag migration, is a `FormularyChange`; every applied CSV
  is a `FormularyImport` that keeps the original file.

Dangerous-drug and renal checks read the item first (`flags_for`, `match_item`); the name lists in
dangerous_drugs.py and renal_drugs.py are only the fallback for free-text drugs that match no item, and the
default for a brand-new item.
"""

import csv
import io
import re
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.functions import Lower

from appointments import allergies
from appointments.models import Orderable
from appointments.order_tasks import ROUTES

from .models import FormularyChange, FormularyImport, FormularyOverride, FormularyReview, PharmacistProfile, PharmacyPrice

EDIT_ROLES = ("pharmacist", "admin", "system_admin")
VIEW_ROLES = EDIT_ROLES + ("pharmacy_tech",)
FORMS = [
    "tablet", "capsule", "solution", "suspension", "syrup", "cream", "ointment", "gel", "lotion", "patch",
    "inhaler", "drops", "spray", "suppository", "injection", "powder", "other",
]
COLUMNS = ["code", "generic_name", "brand_name", "strength", "form", "route", "rxnorm_code", "dangerous_drug",
           "renal_threshold_crcl", "vat_exempt", "unit", "unit_price_php", "is_active"]
DEFINITION = ("generic_name", "brand_name", "strength", "form", "route", "rxnorm_code")  # shared only
LOCAL = ("is_active", "dangerous_drug", "renal_threshold_crcl")  # a clinic may override these on a shared item
PRICE = ("unit", "unit_price_php", "vat_exempt")  # ... and these (its own price row)
OVERRIDABLE = LOCAL + PRICE
REVIEW_FIELDS = DEFINITION + ("dangerous_drug", "renal_threshold_crcl")  # a change to these needs a pharmacist's review
PRICES_PER_CLINIC = "Prices are set by each clinic in its own formulary; the shared POWER formulary has no prices."
MAX_ROWS = 2000
_SLUG = re.compile(r"^[-a-zA-Z0-9_]+$")
_TRUE, _FALSE = {"yes", "y", "true", "1"}, {"no", "n", "false", "0"}


class FormularyError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# --------------------------------------------------------------------------- reference lists

def list_defaults(text):
    """(dangerous?, renal threshold or None) from the reference name lists, for a new item or a free-text drug."""
    from .dangerous_drugs import dangerous_drug_names, _norm
    from .renal_drugs import renal_drugs

    t = f" {_norm(text)} "
    dangerous = any(f" {n} " in t for n in dangerous_drug_names())
    renal = next((int(v) for n, v in renal_drugs().items() if f" {n} " in t), None)
    return dangerous, renal


def apply_list_defaults(codes):
    """Reference-list defaults for medication items created without Orderable.save() (bulk uploads)."""
    for item in Orderable.objects.filter(code__in=list(codes), category="medication"):
        dangerous, renal = list_defaults(f"{item.generic_name} {item.name}")
        fields = {}
        if dangerous and not item.is_dangerous_drug:
            fields["is_dangerous_drug"] = True
        if renal is not None and item.renal_threshold_crcl is None:
            fields["renal_threshold_crcl"] = renal
        if fields:
            Orderable.objects.filter(pk=item.pk).update(**fields)


# --------------------------------------------------------------------------- effective values

def _num(v):
    return format(v.normalize(), "f") if isinstance(v, Decimal) else v


def scope_items(org, include_inactive=True):
    """The medication items a clinic sees: every shared item plus its own (org None: only the shared ones)."""
    q = Q(organization__isnull=True) if org is None else Q(organization__isnull=True) | Q(organization=org)
    qs = Orderable.objects.filter(q, category="medication")
    return qs if include_inactive else qs


def _maps(items, org):
    ids = [i.pk for i in items]
    overrides = {o.orderable_id: o for o in FormularyOverride.objects.filter(organization=org, orderable_id__in=ids)} if org else {}
    prices = {}
    if org is not None:  # prices are per clinic; rows with no organization (old shared prices) are ignored
        for p in PharmacyPrice.objects.filter(orderable_id__in=ids, organization=org):
            prices.setdefault(p.orderable_id, {})["clinic"] = p
    return overrides, prices


def _base(item, price):
    return {
        "generic_name": item.generic_name or item.name,
        "brand_name": item.brand_name,
        "strength": item.strength,
        "form": item.form,
        "route": item.default_route,
        "rxnorm_code": item.external_code if item.code_system == "rxnorm" else "",
        "dangerous_drug": item.is_dangerous_drug,
        "renal_threshold_crcl": item.renal_threshold_crcl,
        "is_active": item.is_active,
        "unit": price.unit if price else "",
        "unit_price_php": _num(price.unit_price) if price else None,
        "vat_exempt": price.vat_exempt if price else False,
    }


def effective(item, org, overrides=None, prices=None):
    """{"values", "sources", "shared_values"} for one item as this clinic sees it."""
    if overrides is None or prices is None:
        overrides, prices = _maps([item], org)
    shared = item.organization_id is None
    values = _base(item, prices.get(item.pk, {}).get("clinic"))
    sources = {f: ("shared" if shared and f not in PRICE else "clinic") for f in values}
    shared_values = {}
    if shared and org is not None:
        override = overrides.get(item.pk)
        for field, value in ((override.values if override else {}) or {}).items():
            if field in LOCAL:
                shared_values[field] = values[field]
                values[field] = value
                sources[field] = "overridden"
    return {"values": values, "sources": sources, "shared_values": shared_values}


def review_of(item, reviews=None):
    """{"status", "reviewed_by", "reviewed_at"} of an item (no FormularyReview row: needs review)."""
    from .services import name_of

    r = reviews.get(item.pk) if reviews is not None else FormularyReview.objects.filter(orderable=item).select_related("reviewed_by").first()
    if r is None:
        return {"status": "needs_review", "reviewed_by": "", "reviewed_at": None}
    return {"status": r.status, "reviewed_by": name_of(r.reviewed_by) if r.reviewed_by_id else "",
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None}


def _reviews(items):
    return {r.orderable_id: r for r in FormularyReview.objects.filter(orderable_id__in=[i.pk for i in items]).select_related("reviewed_by")}


def serialize(item, org, overrides=None, prices=None, reviews=None):
    eff = effective(item, org, overrides, prices)
    v = eff["values"]
    return {
        "id": item.pk,
        "code": item.code,
        "scope": "shared" if item.organization_id is None else "clinic",
        "display": " ".join(x for x in (v["generic_name"], f"({v['brand_name']})" if v["brand_name"] else "", v["strength"], v["form"]) if x),
        **v,
        "sources": eff["sources"],
        "shared_values": eff["shared_values"],
        "overridden": sorted(f for f, s in eff["sources"].items() if s == "overridden"),
        "review": review_of(item, reviews),
    }


def listing(org, q="", scope="", dangerous="", renal="", active="", review=""):
    items = list(scope_items(org).order_by("generic_name", "name", "id"))
    overrides, prices = _maps(items, org)
    reviews = _reviews(items)
    rows = [serialize(i, org, overrides, prices, reviews) for i in items]
    if review in ("needs_review", "reviewed"):
        rows = [r for r in rows if r["review"]["status"] == review]
    term = q.strip().lower()
    if term:
        rows = [r for r in rows if term in " ".join(str(r[k] or "") for k in ("code", "generic_name", "brand_name", "rxnorm_code")).lower()]
    if scope in ("shared", "clinic"):
        rows = [r for r in rows if r["scope"] == scope]
    if scope == "overridden":
        rows = [r for r in rows if r["overridden"]]
    for key, flag, test in (("dangerous_drug", dangerous, lambda r: r["dangerous_drug"]), ("renal", renal, lambda r: r["renal_threshold_crcl"] is not None),
                            ("is_active", active, lambda r: r["is_active"])):
        if flag in ("yes", "no"):
            rows = [r for r in rows if bool(test(r)) == (flag == "yes")]
    return rows


# --------------------------------------------------------------------------- the checks read the item first

def flags_for(item, org):
    """(dangerous?, renal threshold) of an item as this clinic sees it."""
    v = effective(item, org)["values"]
    return v["dangerous_drug"], v["renal_threshold_crcl"]


def match_item(name, org=None):
    """The formulary item (shared or the clinic's) whose generic name appears in a free-text drug name, longest first."""
    text = f" {allergies._norm(name)} "
    best = None
    for item in scope_items(org):
        generic = allergies._norm(item.generic_name or "")
        if generic and f" {generic} " in text and (best is None or len(generic) > len(allergies._norm(best.generic_name))):
            best = item
    return best


def price_row(item, org):
    """This clinic's PharmacyPrice for the item (prices are per clinic; old shared rows are ignored), or None."""
    if org is None:
        return None
    return PharmacyPrice.objects.filter(orderable=item, organization=org, is_active=True).first()


# --------------------------------------------------------------------------- editing

def _bool(v):
    if isinstance(v, bool):
        return v
    s = str(v or "").strip().lower()
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    raise ValueError("yes or no")


def clean_value(field, raw):
    """A field's value from user input (raises ValueError with a message)."""
    if field in ("dangerous_drug", "vat_exempt", "is_active"):
        return _bool(raw)
    if field == "renal_threshold_crcl":
        if raw in (None, "") or str(raw).strip().lower() == "none":
            return None
        try:
            n = int(str(raw).strip())
        except ValueError:
            raise ValueError("a whole number of mL/min")
        if not 5 <= n <= 150:
            raise ValueError("between 5 and 150 mL/min")
        return n
    if field == "unit_price_php":
        if raw in (None, ""):
            return None
        try:
            d = Decimal(str(raw).strip().replace(",", "").replace("₱", ""))
        except InvalidOperation:
            raise ValueError("a number of pesos")
        if d <= 0:
            raise ValueError("more than zero")
        return _num(d.quantize(Decimal("0.01")))
    value = str(raw or "").strip()
    if field == "form" and value and value not in FORMS:
        raise ValueError("one of " + ", ".join(FORMS))
    if field == "route" and value and value not in ROUTES:
        raise ValueError("one of " + ", ".join(ROUTES))
    if field == "rxnorm_code" and value and not value.isdigit():
        raise ValueError("digits only")
    limits = {"generic_name": 255, "brand_name": 255, "strength": 60, "form": 40, "route": 20, "rxnorm_code": 64, "unit": 30}
    return value[: limits.get(field, 255)]


def can_edit(user, item):
    role = getattr(user, "role", None)
    if role not in EDIT_ROLES:
        return False
    if item is None:
        return True
    if item.organization_id is None:
        return True  # system admins change the shared item; clinics override it
    return role != "system_admin" and item.organization_id == user.organization_id


def _set_price(item, org, values, current):
    """Write (or remove) the price row this scope owns. `values` has the PRICE fields after the change."""
    row = PharmacyPrice.objects.filter(orderable=item, organization=org).first()
    if values["unit_price_php"] in (None, ""):
        if row is not None:
            row.delete()
        return
    if row is None:
        row = PharmacyPrice(orderable=item, organization=org)
    row.drug_name = " ".join(x for x in (item.generic_name or item.name, item.strength) if x)[:200]
    row.unit = values["unit"] or ""
    row.unit_price = Decimal(str(values["unit_price_php"]))
    row.vat_exempt = bool(values["vat_exempt"])
    row.is_active = True
    row.save()


def _name_for(values):
    return " ".join(x for x in (values["generic_name"], values["strength"], values["form"]) if x)[:255] or "Medication"


def apply_changes(user, org, item, changes, source="manual", formulary_import=None):
    """
    Write {field: new value} for one item in the caller's scope and record the history. A clinic changing a SHARED
    item writes overrides only (OVERRIDABLE fields); a value equal to the shared one removes the override.
    Returns {field: [old, new]} of what actually changed.
    """
    shared = item.organization_id is None
    as_clinic = shared and user.role != "system_admin"
    before = effective(item, org if as_clinic or not shared else None)
    old = before["values"]
    done = {}
    if as_clinic:
        override, _ = FormularyOverride.objects.get_or_create(organization=org, orderable=item)
        values = dict(override.values or {})
        shared_now = effective(item, None)["values"]
        for field in LOCAL:
            if field in changes:
                new = changes[field]
                if new == shared_now[field]:
                    values.pop(field, None)
                else:
                    values[field] = new
                if old[field] != new:
                    done[field] = [old[field], new]
        override.values, override.updated_by = values, user
        if values:
            override.save()
        elif override.pk:
            override.delete()
        if any(f in changes for f in PRICE):
            _set_price(item, org, {f: changes.get(f, old[f]) for f in PRICE}, old)  # the clinic's own price
            for f in PRICE:
                if f in changes and old[f] != changes[f]:
                    done[f] = [old[f], changes[f]]
    else:
        values = dict(old)
        for field, new in changes.items():
            if field in values and values[field] != new:
                done[field] = [values[field], new]
                values[field] = new
        item.generic_name, item.brand_name = values["generic_name"], values["brand_name"]
        item.strength, item.form, item.default_route = values["strength"], values["form"], values["route"]
        if values["rxnorm_code"]:
            item.code_system, item.external_code = "rxnorm", values["rxnorm_code"]
        elif item.code_system == "rxnorm":
            item.external_code = ""
        item.is_dangerous_drug, item.renal_threshold_crcl = bool(values["dangerous_drug"]), values["renal_threshold_crcl"]
        item.is_active = bool(values["is_active"])
        item.name = _name_for(values)
        item.save()
        if not shared and any(f in done for f in PRICE):  # a shared item has no price (prices are per clinic)
            _set_price(item, item.organization, {f: values[f] for f in PRICE}, old)
        if (source == "import" and done) or any(f in REVIEW_FIELDS for f in done):
            set_needs_review(item)
    if done:
        FormularyChange.objects.create(
            organization=org if as_clinic else (None if shared else item.organization), orderable=item, user=user,
            source=source, formulary_import=formulary_import, changes=done,
        )
    return done


def revert(user, org, item, field):
    """A clinic goes back to the shared value of one field (the price fields revert together)."""
    if item.organization_id is not None or org is None or user.role == "system_admin":
        raise FormularyError("Only a clinic's override of a shared item can be reverted.", 409)
    eff = effective(item, org)
    if eff["sources"].get(field) != "overridden":
        raise FormularyError("That value is not overridden.", 409)
    fields = PRICE if field in PRICE else (field,)
    done = {f: [eff["values"][f], eff["shared_values"][f]] for f in fields if eff["sources"].get(f) == "overridden"}
    if field in PRICE:
        PharmacyPrice.objects.filter(orderable=item, organization=org).delete()
    else:
        override = FormularyOverride.objects.filter(organization=org, orderable=item).first()
        if override:
            override.values.pop(field, None)
            if override.values:
                override.save()
            else:
                override.delete()
    FormularyChange.objects.create(organization=org, orderable=item, user=user, source="revert", changes=done)
    return done


def new_code(values):
    base = re.sub(r"[^a-z0-9]+", "_", f"{values['generic_name']} {values.get('strength', '')} {values.get('form', '')}".lower()).strip("_")[:56] or "med"
    code, n = base, 1
    while Orderable.objects.filter(code__iexact=code).exists():
        n += 1
        code = f"{base}_{n}"[:64]
    return code


def create_item(user, org, data, source="manual", formulary_import=None):
    """A new item: shared when a system admin adds it, the clinic's own otherwise."""
    values = {f: (clean_value(f, data[f]) if data.get(f) not in (None, "") else None) for f in COLUMNS[1:]}
    if not values["generic_name"]:
        raise FormularyError("Enter the generic name.")
    dangerous, renal = list_defaults(f"{values['generic_name']}")
    code = str(data.get("code") or "").strip() or new_code(values)
    if not _SLUG.match(code):
        raise FormularyError("The code may only have letters, digits, - and _.")
    if Orderable.objects.filter(code__iexact=code).exists():
        raise FormularyError("That code is already in use.")
    item = Orderable(
        code=code, category="medication", organization=None if user.role == "system_admin" else org,
        generic_name=values["generic_name"], brand_name=values["brand_name"] or "", strength=values["strength"] or "",
        form=values["form"] or "", default_route=values["route"] or "",
        code_system="rxnorm" if values["rxnorm_code"] else "local", external_code=values["rxnorm_code"] or "",
        is_dangerous_drug=values["dangerous_drug"] if values["dangerous_drug"] is not None else dangerous,
        renal_threshold_crcl=values["renal_threshold_crcl"] if data.get("renal_threshold_crcl") not in (None, "") else renal,
        is_active=values["is_active"] if values["is_active"] is not None else True,
    )
    item.name = _name_for({"generic_name": item.generic_name, "strength": item.strength, "form": item.form})
    try:
        with transaction.atomic():
            item.save()
    except IntegrityError:
        raise FormularyError("That code is already in use.")
    if values["unit_price_php"] is not None and item.organization_id is not None:  # shared items have no price
        _set_price(item, item.organization, {"unit": values["unit"] or "", "unit_price_php": values["unit_price_php"], "vat_exempt": bool(values["vat_exempt"])}, {})
    FormularyChange.objects.create(
        organization=item.organization, orderable=item, user=user, source=source, formulary_import=formulary_import,
        changes={"created": [None, serialize(item, item.organization)["display"]]},
    )
    return item


# --------------------------------------------------------------------------- review

def set_needs_review(item):
    """Back to "needs pharmacist review" (the last reviewer stays on record). No row already means needs review."""
    FormularyReview.objects.filter(orderable=item, status="reviewed").update(status="needs_review")


def can_review(user, item, org):
    """
    "Mark reviewed": a shared item at POWER level (a system administrator, or a pharmacist flagged as a POWER
    formulary reviewer); a clinic's own item by a pharmacist of that clinic. Administrators and assistants never.
    """
    role = getattr(user, "role", None)
    if item.organization_id is None:
        if role == "system_admin":
            return True
        return role == "pharmacist" and PharmacistProfile.objects.filter(user=user, reviews_shared_formulary=True).exists()
    return role == "pharmacist" and org is not None and item.organization_id == org.pk


def mark_reviewed(user, org, item):
    from django.utils import timezone

    if not can_review(user, item, org):
        raise FormularyError(
            "Only a POWER formulary reviewer or a system administrator can review a shared item." if item.organization_id is None
            else "Only a pharmacist of this clinic can review its items.", 403)
    review, _ = FormularyReview.objects.get_or_create(orderable=item)
    if review.status == "reviewed":
        raise FormularyError("This item is already reviewed.", 409)
    review.status, review.reviewed_by, review.reviewed_at = "reviewed", user, timezone.now()
    review.save()
    FormularyChange.objects.create(organization=item.organization, orderable=item, user=user, source="review",
                                   changes={"review": ["needs_review", "reviewed"]})
    return review


# --------------------------------------------------------------------------- CSV

# In an import a blank cell keeps the current value (a new item gets the default, e.g. the reference lists' dangerous
# drug and renal flags); renal_threshold_crcl "none" clears a threshold.
def sample_csv():
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(COLUMNS)
    w.writerow(["amoxicillin_500_capsule", "Amoxicillin", "Amoxil", "500 mg", "capsule", "PO", "308191", "no", "", "no", "capsule", "11.20", "yes"])
    w.writerow(["morphine_10_tablet", "Morphine sulfate", "", "10 mg", "tablet", "PO", "", "yes", "", "no", "tablet", "38.00", "yes"])

    return out.getvalue()


def export_csv(org):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(COLUMNS)
    yes = lambda b: "yes" if b else "no"  # noqa: E731
    for r in listing(org):
        w.writerow([r["code"], r["generic_name"], r["brand_name"], r["strength"], r["form"], r["route"], r["rxnorm_code"],
                    yes(r["dangerous_drug"]), r["renal_threshold_crcl"] if r["renal_threshold_crcl"] is not None else "",
                    yes(r["vat_exempt"]), r["unit"], r["unit_price_php"] or "", yes(r["is_active"])])
    return out.getvalue()


def _parse(text):
    """Rows of the CSV as dicts with their row number, plus file-level errors."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in ("code", "generic_name") if c not in headers]
    if missing:
        return [], [{"row": 1, "column": c, "message": "This column is required."} for c in missing]
    rows = []
    for i, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        if not any(row.values()):
            continue
        row["_row"] = i
        rows.append(row)
    if len(rows) > MAX_ROWS:
        return [], [{"row": 0, "column": "", "message": f"At most {MAX_ROWS} rows per file."}]
    return rows, []


def plan_import(user, org, text):
    """
    The dry run: every row as new / changed (old -> new) / unchanged, plus errors (by row and column) and warnings.
    Scope: a system admin imports SHARED items; a clinic user imports overrides of shared items and its own items.
    """
    rows, errors = _parse(text)
    warnings, plan, seen = [], [], set()
    as_admin = user.role == "system_admin"
    codes = [r["code"].lower() for r in rows if r.get("code")]
    existing = {o.code.lower(): o for o in Orderable.objects.annotate(_lc=Lower("code")).filter(_lc__in=codes)} if codes else {}
    for r in rows:
        n = r["_row"]
        code = r.get("code", "")
        if not code or not _SLUG.match(code):
            errors.append({"row": n, "column": "code", "message": "Required: letters, digits, - and _ only."})
            continue
        if code.lower() in seen:
            errors.append({"row": n, "column": "code", "message": "This code is already earlier in the file."})
            continue
        seen.add(code.lower())
        values, bad = {}, False
        for field in COLUMNS[1:]:
            # a blank cell keeps the current value (a new item: the default); "none" clears a renal threshold
            if field not in r or r[field] == "":
                continue
            try:
                values[field] = clean_value(field, r[field])
            except ValueError as exc:
                errors.append({"row": n, "column": field, "message": f"Must be {exc}."})
                bad = True
        if bad:
            continue
        if as_admin:
            for field in PRICE:
                if values.pop(field, None) not in (None, "", False):
                    warnings.append({"row": n, "column": field, "message": "Ignored: " + PRICES_PER_CLINIC})
        item = existing.get(code.lower())
        if item is not None and item.category != "medication":
            errors.append({"row": n, "column": "code", "message": "That code is an orderable that is not a medication."})
            continue
        if item is not None and item.organization_id is not None and (as_admin or item.organization_id != getattr(org, "pk", None)):
            message = "That code is a clinic's own item; the shared import can't change it." if as_admin else "That code belongs to another clinic."
            errors.append({"row": n, "column": "code", "message": message})
            continue
        if item is None:
            if not values.get("generic_name"):
                errors.append({"row": n, "column": "generic_name", "message": "Required for a new item."})
                continue
            plan.append({"row": n, "code": code, "status": "new", "scope": "shared" if as_admin else "clinic", "changes": {}, "values": values})
            continue
        clinic_on_shared = item.organization_id is None and not as_admin
        current = effective(item, org if clinic_on_shared else (None if item.organization_id is None else item.organization))["values"]
        changes = {}
        for field, new in values.items():
            if current.get(field) != new:
                if clinic_on_shared and field in DEFINITION:
                    warnings.append({"row": n, "column": field, "message": f"Ignored: the shared item's {field} is '{current.get(field)}' and only POWER can change it."})
                    continue
                changes[field] = [current.get(field), new]
        if values.get("rxnorm_code") and current.get("rxnorm_code") and values["rxnorm_code"] != current["rxnorm_code"]:
            warnings.append({"row": n, "column": "rxnorm_code", "message": f"RxNorm code differs from the item's ({current['rxnorm_code']}): check that this row is the same drug."})
        plan.append({"row": n, "code": code, "status": "changed" if changes else "unchanged",
                     "scope": "override" if clinic_on_shared else ("shared" if item.organization_id is None else "clinic"),
                     "changes": changes, "item": item.pk})
    # RxNorm codes reused for a different generic name in scope
    by_rx = {}
    for item in scope_items(None if as_admin else org):
        if item.code_system == "rxnorm" and item.external_code:
            by_rx[item.external_code] = (item.code.lower(), allergies._norm(item.generic_name))
    for r in rows:
        rx, code = r.get("rxnorm_code"), r.get("code", "").lower()
        if rx and rx in by_rx and by_rx[rx][0] != code and by_rx[rx][1] != allergies._norm(r.get("generic_name", "")):
            warnings.append({"row": r["_row"], "column": "rxnorm_code", "message": f"RxNorm {rx} is already used by item {by_rx[rx][0]} for a different drug."})
    counts = {s: sum(1 for p in plan if p["status"] == s) for s in ("new", "changed", "unchanged")}
    return {"rows": plan, "errors": errors, "warnings": warnings, "counts": counts, "ok": not errors}


@transaction.atomic
def apply_import(user, org, text, filename):
    """All or nothing: re-checks the file, then writes every row and keeps the file and the history."""
    plan = plan_import(user, org, text)
    if not plan["ok"]:
        raise FormularyError("The file has errors. Nothing was saved.", 400)
    imp = FormularyImport.objects.create(
        organization=None if user.role == "system_admin" else org, filename=(filename or "formulary.csv")[:255], content=text, user=user,
        created=plan["counts"]["new"], changed=plan["counts"]["changed"], unchanged=plan["counts"]["unchanged"],
    )
    for p in plan["rows"]:
        if p["status"] == "new":
            create_item(user, org, {"code": p["code"], **p["values"]}, source="import", formulary_import=imp)
        elif p["status"] == "changed":
            item = Orderable.objects.select_for_update().get(pk=p["item"])
            apply_changes(user, org, item, {f: v[1] for f, v in p["changes"].items()}, source="import", formulary_import=imp)
    return imp, plan


# --------------------------------------------------------------------------- the prescription writer and ordering

def hidden_ids(org):
    """Shared items this clinic has switched off."""
    if org is None:
        return set()
    return {o.orderable_id for o in FormularyOverride.objects.filter(organization=org) if (o.values or {}).get("is_active") is False}


def search(org, term, limit=15):
    """Active formulary items for the drug search (clinic overrides respected, hidden items left out)."""
    t = (term or "").strip().lower()
    if len(t) < 2:
        return []
    items = list(scope_items(org).filter(Q(generic_name__icontains=t) | Q(brand_name__icontains=t) | Q(code__icontains=t) | Q(name__icontains=t))[:100])
    overrides, prices = _maps(items, org)
    out = []
    for item in items:
        r = serialize(item, org, overrides, prices)
        if not r["is_active"]:
            continue
        out.append({
            "display": r["display"], "generic_name": r["generic_name"], "brand_name": r["brand_name"],
            "strength": r["strength"], "form": r["form"], "route": r["route"],
            "system": "rxnorm" if r["rxnorm_code"] else "", "code": r["rxnorm_code"], "unit": r["unit"],
            "controlled": r["dangerous_drug"], "formulary": True, "item": item.pk,
        })
    out.sort(key=lambda r: r["display"].lower())
    return out[:limit]
