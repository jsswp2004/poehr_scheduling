"""
Master Schedule CSV: a fill-in sheet for the Master Schedule tab.

    GET  master-schedule/csv/?month=YYYY-MM   download that month's sheet (a blank template, or the
                                              current grid when rows already exist) - managers
    POST master-schedule/upload-csv/          multipart: file, replace? ("true" clears every
                                              existing row first) - admins only

Columns: section, first_name, last_name, unit, hp, status, then one column per date
of the month's grid, headed with the date (2026-10-01; 10/1/2026 also works, so the
file survives a round trip through Excel). A day cell holds one of the Master
Schedule codes (7, 7A, 7P, 7p, 3, 11, "3 11", R, x).

How an upload is read:
  * People are matched to the roster by first and last name; anyone not on the
    roster is reported and skipped (upload the roster first).
  * `section` names an existing section. Leave it blank to stay in the section of
    the row above. Sections that share a name (AGENCY, Unit 2 ...) are taken in the
    order the file lists them. A name that matches no section creates a new one.
  * A person already on the schedule is updated in place; anyone else gets a new
    row at the end of their section. A row without a name is skipped.
  * Blank cells never change anything (blank unit / hp / status / day keeps what is
    there), so the same file can be re-uploaded safely. Use replace to start clean.
  * `unit` is a care unit name (Unit 2, 2, Unit 1A/1B ...); it decides which unit that
    person's calendar shifts go to when Create schedule runs.
"""

import csv
import datetime
import io
import re

from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .csv_dry_run import build_row_report, is_dry_run, run_rolled_back
from .master_schedule_views import (
    _bad,
    _clean_label,
    _MasterBase,
    _remember,
    _unit_ids_by_key,
    _unit_key,
    _year_month,
    ensure_default_sections,
    get_settings,
    grid_dates,
)
from .models import (
    MASTER_SCHEDULE_CODES,
    MasterScheduleCell,
    MasterScheduleRow,
    MasterScheduleSection,
    Staff,
    Unit,
)

FIXED_COLUMNS = ["section", "first_name", "last_name", "unit", "hp", "status"]
REQUIRED_COLUMNS = ["section", "first_name", "last_name"]


def _norm(text):
    return " ".join((text or "").lower().split())


def _header_date(raw):
    """A column heading as a date: 2026-10-01, or 10/1/2026 and 10/1/26 (what Excel turns it into)."""
    text = (raw or "").strip()
    try:
        return datetime.date.fromisoformat(text)
    except ValueError:
        pass
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})", text)
    if not m:
        return None
    month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    try:
        return datetime.date(year, month, day)
    except ValueError:
        return None


def _parse_code(raw):
    """A valid Master Schedule code for a day cell, or None."""
    value = " ".join((raw or "").split())
    for candidate in (value, re.sub(r"[-/]", " ", value)):
        candidate = " ".join(candidate.split())
        if candidate in MASTER_SCHEDULE_CODES:
            return candidate
        matches = [c for c in MASTER_SCHEDULE_CODES if c.lower() == candidate.lower()]
        if len(matches) == 1:
            return matches[0]
    return None


class MasterScheduleCsvTemplateView(_MasterBase):
    def get(self, request):
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            year, month = _year_month(request.query_params.get("month"), "month")
        except ValueError as e:
            return _bad(str(e))
        with transaction.atomic():
            ensure_default_sections(org)
            settings = get_settings(org)
        grid = grid_dates(year, month, settings.week_start)

        unit_names = {u.id: u.name for u in Unit.objects.filter(organization=org)}
        unit_ids = _unit_ids_by_key(org)
        by_section = {}
        for r in MasterScheduleRow.objects.filter(organization=org).select_related("staff"):
            by_section.setdefault(r.section_id, []).append(r)
        cells = {}
        for c in MasterScheduleCell.objects.filter(
            row__organization=org, date__gte=grid[0], date__lte=grid[-1]
        ).values("row_id", "date", "code"):
            cells.setdefault(c["row_id"], {})[c["date"]] = c["code"]

        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(FIXED_COLUMNS + [d.isoformat() for d in grid])
        for section in MasterScheduleSection.objects.filter(organization=org):
            section_unit = unit_names.get(unit_ids.get(_unit_key(section.name)), "")
            rows = by_section.get(section.id, [])
            if not rows:
                # an empty section still gets a line so its name is in the sheet
                writer.writerow([section.name, "", "", section_unit, "", ""] + [""] * len(grid))
                continue
            for r in rows:
                unit = unit_names.get(r.unit_id, "") or section_unit
                first = r.staff.first_name if r.staff else ""
                last = r.staff.last_name if r.staff else ""
                writer.writerow(
                    [section.name, first, last, unit, r.hp, r.status]
                    + [cells.get(r.id, {}).get(d, "") for d in grid]
                )
        # utf-8 BOM so Excel opens it with the right encoding
        response = HttpResponse("﻿" + out.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="master_schedule_{year}-{month:02d}.csv"'
        return response


class MasterScheduleUploadCsvView(_MasterBase):
    parser_classes = [MultiPartParser]

    def post(self, request):
        # dry_run=true: run the whole import, report per row, then roll it all back.
        if is_dry_run(request):
            return run_rolled_back(self._run, request)
        return self._run(request, False)

    def _run(self, request, dry_run=False):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        upload = request.FILES.get("file")
        if not upload:
            return _bad("No file provided.")
        replace = request.data.get("replace") in (True, "true", "True", "1", 1)
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as e:
            return _bad(f"File encoding error: {e}")

        reader = csv.reader(io.StringIO(text))
        header = next(reader, None)
        if not header:
            return _bad("The file is empty.")
        index, date_cols, ignored = {}, {}, []
        for i, raw in enumerate(header):
            name = raw.strip().lower().replace(" ", "_")
            if name in FIXED_COLUMNS:
                index.setdefault(name, i)
                continue
            day = _header_date(raw)
            if day is not None:
                date_cols.setdefault(day, i)
            elif raw.strip():
                ignored.append(raw.strip())
        missing = [c for c in REQUIRED_COLUMNS if c not in index]
        if missing:
            return _bad(f"Missing column(s): {', '.join(missing)}. Download the template for the right layout.")

        errors = []
        counts = {"rows_created": 0, "rows_updated": 0, "rows_moved": 0, "cells_set": 0, "skipped_blank": 0}
        sections_added = []
        report = {}

        with transaction.atomic():
            ensure_default_sections(org)
            settings = get_settings(org)
            if replace:
                MasterScheduleRow.objects.filter(organization=org).delete()
            sections = list(MasterScheduleSection.objects.filter(organization=org))
            used_sections, next_order = set(), {}
            unit_ids = _unit_ids_by_key(org)
            on_schedule = {
                r.staff_id: r
                for r in MasterScheduleRow.objects.filter(organization=org, staff__isnull=False)
            }
            roster = {}
            for s in Staff.objects.filter(organization=org):
                roster.setdefault((_norm(s.first_name), _norm(s.last_name)), []).append(s)

            def cell(raw, col):
                i = index.get(col)
                return raw[i].strip() if i is not None and i < len(raw) else ""

            def order_for(section):
                if section.id not in next_order:
                    top = MasterScheduleRow.objects.filter(section=section).aggregate(m=Max("sort_order"))["m"]
                    next_order[section.id] = (top or 0) + 1
                value = next_order[section.id]
                next_order[section.id] = value + 1
                return value

            current_name, current_section, seen_staff = None, None, set()
            for line_no, raw in enumerate(reader, start=2):
                if not any(c.strip() for c in raw):
                    continue
                name = cell(raw, "section")
                if name and _norm(name) != _norm(current_name):
                    pick = next((s for s in sections if s.id not in used_sections and _norm(s.name) == _norm(name)), None)
                    if pick is None:
                        top = max([s.sort_order for s in sections] or [0])
                        pick = MasterScheduleSection.objects.create(
                            organization=org, name=name[:100], level=0, sort_order=top + 1
                        )
                        sections.append(pick)
                        sections_added.append(pick.name)
                    used_sections.add(pick.id)
                    current_name, current_section = name, pick
                first, last = cell(raw, "first_name"), cell(raw, "last_name")
                day_values = {
                    day: raw[i].strip() for day, i in date_cols.items() if i < len(raw) and raw[i].strip()
                }
                if not first and not last:
                    if day_values:
                        errors.append(f"Row {line_no}: day entries but no name, so the row was skipped.")
                    counts["skipped_blank"] += 1
                    continue
                if not first or not last:
                    errors.append(f"Row {line_no}: both first_name and last_name are needed.")
                    continue
                if current_section is None:
                    errors.append(f"Row {line_no}: section is required for the first row.")
                    continue

                who = f"{first} {last}"
                people = roster.get((_norm(first), _norm(last)), [])
                if len(people) > 1:
                    people = [p for p in people if p.is_active]
                if len(people) != 1:
                    errors.append(
                        f"Row {line_no}: {who} is not on the roster."
                        if not people
                        else f"Row {line_no}: more than one person named {who} is on the roster."
                    )
                    continue
                staff = people[0]
                if staff.id in seen_staff:
                    errors.append(f"Row {line_no}: {who} is listed more than once; this line was skipped.")
                    continue
                seen_staff.add(staff.id)

                unit_id, unit_given = None, cell(raw, "unit")
                if unit_given:
                    unit_id = unit_ids.get(_unit_key(unit_given))
                    if unit_id is None:
                        errors.append(f"Row {line_no}: no care unit named '{unit_given}' (Units & Census); {who}'s unit was left as it was.")
                hp, status = _clean_label(cell(raw, "hp")), _clean_label(cell(raw, "status"))

                row = on_schedule.get(staff.id)
                row_is_new = row is None
                if row is None:
                    row = MasterScheduleRow.objects.create(
                        organization=org, section=current_section, staff=staff, unit_id=unit_id,
                        hp=hp, status=status, sort_order=order_for(current_section),
                    )
                    on_schedule[staff.id] = row
                    counts["rows_created"] += 1
                else:
                    if row.section_id != current_section.id:
                        row.section, row.sort_order = current_section, order_for(current_section)
                        counts["rows_moved"] += 1
                    if unit_id is not None:
                        row.unit_id = unit_id
                    if hp:
                        row.hp = hp
                    if status:
                        row.status = status
                    row.save()
                    counts["rows_updated"] += 1
                _remember(settings, "hp_values", hp)
                _remember(settings, "status_values", status)

                wanted = {}
                for day, value in day_values.items():
                    code = _parse_code(value)
                    if code is None:
                        errors.append(
                            f"Row {line_no}: '{value}' on {day.isoformat()} ({who}) is not a schedule code "
                            f"({', '.join(MASTER_SCHEDULE_CODES)}); that day was skipped."
                        )
                    else:
                        wanted[day] = code
                have = {c.date: c for c in MasterScheduleCell.objects.filter(row=row, date__in=list(wanted))}
                create, update = [], []
                for day, code in wanted.items():
                    existing = have.get(day)
                    if existing is None:
                        create.append(MasterScheduleCell(row=row, date=day, code=code))
                    elif existing.code != code:
                        existing.code = code
                        update.append(existing)
                MasterScheduleCell.objects.bulk_create(create)
                MasterScheduleCell.objects.bulk_update(update, ["code"])
                counts["cells_set"] += len(create) + len(update)
                report[line_no] = {
                    "name": who,
                    "section": current_section.name,
                    "unit": unit_given,
                    "action": "added" if row_is_new else "updated",
                    "cells": len(create) + len(update),
                }

        return Response(
            {
                **counts,
                "sections_added": sections_added,
                "ignored_columns": ignored,
                "replaced": replace,
                "errors": errors,
                "rows": build_row_report(report, errors),
                "dry_run": dry_run,
            }
        )
