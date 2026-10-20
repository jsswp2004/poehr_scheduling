"""
Reads the CDC CVX code set (the "flat file" from www2a.cdc.gov/vaccines/IIS/IISStandards/downloads/CVX.txt) and
loads it into VaccineProduct.

One line per code, seven fields separated by "|":
    CVX code (space padded) | short description | full vaccine name | notes | status | non-vaccine flag | updated on
The file starts with a byte-order mark and uses Windows line endings. Status is Active, Inactive, Pending, Non-US or
Never Active. The non-vaccine flag is True for entries such as immune globulins.
"""

import datetime

from django.db import transaction

from .models import VaccineProduct

FIELDS = 7
STATUS = {
    "active": "active",
    "inactive": "inactive",
    "pending": "pending",
    "non-us": "non_us",
    "never active": "never_active",
}


class CvxFormatError(ValueError):
    pass


def _date(text):
    text = text.strip()
    if not text:
        return None
    for fmt in ("%Y/%m/%d", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise CvxFormatError(f"unrecognised date {text!r}")


def parse_cvx(text):
    """Return one dict per CVX line. Raises CvxFormatError (naming the line) on anything unexpected."""
    rows = []
    seen = set()
    for number, line in enumerate(text.lstrip("﻿").splitlines(), start=1):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != FIELDS:
            raise CvxFormatError(f"line {number}: expected {FIELDS} fields, found {len(parts)}")
        code, short, full, notes, status, non_vaccine, updated = (p.strip() for p in parts)
        if not code.isdigit():
            raise CvxFormatError(f"line {number}: CVX code {code!r} is not a number")
        if status.lower() not in STATUS:
            raise CvxFormatError(f"line {number}: unknown status {status!r}")
        if non_vaccine.lower() not in ("true", "false"):
            raise CvxFormatError(f"line {number}: unknown non-vaccine flag {non_vaccine!r}")
        if code in seen:
            raise CvxFormatError(f"line {number}: CVX code {code} appears twice")
        seen.add(code)
        try:
            updated_on = _date(updated)
        except CvxFormatError as exc:
            raise CvxFormatError(f"line {number}: {exc}")
        rows.append(
            {
                "cvx_code": code,
                "short_name": short,
                "full_name": full,
                "notes": notes,
                "status": STATUS[status.lower()],
                "is_vaccine": non_vaccine.lower() == "false",
                "cdc_updated_on": updated_on,
            }
        )
    return rows


@transaction.atomic
def load_cvx(rows, user=None):
    """Create or update VaccineProduct rows by CVX code. Returns {"created": n, "updated": n, "unchanged": n}."""
    counts = {"created": 0, "updated": 0, "unchanged": 0}
    existing = {p.cvx_code: p for p in VaccineProduct.objects.all()}
    for row in rows:
        product = existing.get(row["cvx_code"])
        if product is None:
            VaccineProduct.objects.create(updated_by=user, **row)
            counts["created"] += 1
            continue
        changed = [name for name, value in row.items() if getattr(product, name) != value]
        if not changed:
            counts["unchanged"] += 1
            continue
        for name in changed:
            setattr(product, name, row[name])
        product.updated_by = user
        product.save()
        counts["updated"] += 1
    return counts
