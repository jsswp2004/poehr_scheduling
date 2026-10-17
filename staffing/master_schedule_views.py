"""
Master Schedule: the monthly paper-style grid (sections, people, HP, Status and
one code per day). Managers can read it; only admins can change it.

    GET   master-schedule/?start=YYYY-MM-DD&end=YYYY-MM-DD
    PATCH master-schedule/settings/        {week_start, hp_values, status_values}
    POST  master-schedule/sections/        {name, level?, after?}  after: "start" | a section id | omitted = end
    DELETE master-schedule/sections/<id>/  (also removes the section's rows and their entries)
    POST  master-schedule/rows/            {section, staff?}
    PATCH master-schedule/rows/<id>/       {staff?, hp?, status?}
    DELETE master-schedule/rows/<id>/
    PUT   master-schedule/cells/           {row, date, code}   (code "" clears)
    POST  master-schedule/copy/            {source: "YYYY-MM", target: "YYYY-MM", overwrite?}
"""

import datetime

from django.db import transaction
from django.db.models import Max
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import org_scope
from .models import (
    MASTER_SCHEDULE_CODES,
    MASTER_SCHEDULE_DEFAULT_HP,
    MASTER_SCHEDULE_DEFAULT_SECTIONS,
    MASTER_SCHEDULE_DEFAULT_STATUS,
    MasterScheduleCell,
    MasterScheduleRow,
    MasterScheduleSection,
    MasterScheduleSettings,
    Staff,
)
from .views import ADMIN_ROLES, IsStaffingManager

MAX_RANGE_DAYS = 62
MAX_LABEL = 20


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def _date(raw, field):
    try:
        return datetime.date.fromisoformat(str(raw))
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a date like 2026-10-01.")


def grid_dates(year, month, week_start):
    """Every date the grid shows for a month: from the work-week start on or
    before the 1st through the end of the work week holding the last day.
    Mirrors gridDays() in the web app (frontend/src/utils/masterSchedule.js)."""
    first = datetime.date(year, month, 1)
    nxt = datetime.date(year + (month == 12), month % 12 + 1, 1)
    last = nxt - datetime.timedelta(days=1)
    back = (first.weekday() - week_start) % 7
    forward = ((week_start + 6) % 7 - last.weekday()) % 7
    start = first - datetime.timedelta(days=back)
    total = back + (last - first).days + 1 + forward
    return [start + datetime.timedelta(days=i) for i in range(total)]


def _year_month(raw, field):
    try:
        year, month = str(raw).split("-")
        year, month = int(year), int(month)
        if not (2000 <= year <= 2100 and 1 <= month <= 12):
            raise ValueError
        return year, month
    except (ValueError, AttributeError):
        raise ValueError(f"{field} must be a month like 2026-10.")


def get_settings(org):
    settings, _ = MasterScheduleSettings.objects.get_or_create(
        organization=org,
        defaults={
            "hp_values": list(MASTER_SCHEDULE_DEFAULT_HP),
            "status_values": list(MASTER_SCHEDULE_DEFAULT_STATUS),
        },
    )
    return settings


def ensure_default_sections(org):
    """First visit: lay out the sections from the paper template."""
    if MasterScheduleSection.objects.filter(organization=org).exists():
        return
    MasterScheduleSection.objects.bulk_create(
        [
            MasterScheduleSection(organization=org, name=name, level=level, sort_order=i)
            for i, (name, level) in enumerate(MASTER_SCHEDULE_DEFAULT_SECTIONS, start=1)
        ]
    )


def _clean_label(raw):
    value = (raw or "").strip() if isinstance(raw, str) else ""
    return value[:MAX_LABEL]


def _clean_list(values):
    out, seen = [], set()
    for v in values or []:
        label = _clean_label(v)
        if label and label not in seen:
            seen.add(label)
            out.append(label)
    return out


def _remember(settings, field, value):
    """Add a newly typed HP/Status value to the organization's dictionary."""
    if not value:
        return
    current = list(getattr(settings, field) or [])
    if value not in current:
        current.append(value)
        setattr(settings, field, current)
        settings.save(update_fields=[field])


def _staff_name(staff):
    return f"{staff.first_name} {staff.last_name}".strip() if staff else ""


class _MasterBase(APIView):
    permission_classes = [IsStaffingManager]

    def _org(self, request):
        return org_scope.acting_org(request, allow_body=True)

    def _admin_only(self, request):
        if request.user.role not in ADMIN_ROLES:
            return _bad("Only admins can change the master schedule.", status.HTTP_403_FORBIDDEN)
        return None


class MasterScheduleView(_MasterBase):
    def get(self, request):
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            start = _date(request.query_params.get("start"), "start")
            end = _date(request.query_params.get("end"), "end")
        except ValueError as e:
            return _bad(str(e))
        if end < start or (end - start).days >= MAX_RANGE_DAYS:
            return _bad(f"Choose a range of at most {MAX_RANGE_DAYS} days.")

        with transaction.atomic():
            ensure_default_sections(org)
            settings = get_settings(org)

        rows = list(
            MasterScheduleRow.objects.filter(organization=org).select_related("staff")
        )
        by_section = {}
        for r in rows:
            by_section.setdefault(r.section_id, []).append(r)
        sections = [
            {
                "id": s.id,
                "name": s.name,
                "level": s.level,
                "rows": [
                    {
                        "id": r.id,
                        "staff_id": r.staff_id,
                        "staff_name": _staff_name(r.staff),
                        "hp": r.hp,
                        "status": r.status,
                    }
                    for r in by_section.get(s.id, [])
                ],
            }
            for s in MasterScheduleSection.objects.filter(organization=org)
        ]
        cells = {}
        for c in MasterScheduleCell.objects.filter(
            row__organization=org, date__gte=start, date__lte=end
        ).values("row_id", "date", "code"):
            cells.setdefault(str(c["row_id"]), {})[c["date"].isoformat()] = c["code"]

        staff = [
            {"id": s.id, "name": _staff_name(s), "profession": s.profession}
            for s in Staff.objects.filter(organization=org, is_active=True).order_by(
                "last_name", "first_name"
            )
        ]
        return Response(
            {
                "settings": {
                    "week_start": settings.week_start,
                    "hp_values": settings.hp_values,
                    "status_values": settings.status_values,
                },
                "codes": MASTER_SCHEDULE_CODES,
                "staff": staff,
                "sections": sections,
                "cells": cells,
            }
        )


class MasterScheduleSettingsView(_MasterBase):
    def patch(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        settings = get_settings(org)
        data = request.data
        if "week_start" in data:
            try:
                ws = int(data["week_start"])
            except (TypeError, ValueError):
                return _bad("week_start must be a number from 0 (Monday) to 6 (Sunday).")
            if not 0 <= ws <= 6:
                return _bad("week_start must be a number from 0 (Monday) to 6 (Sunday).")
            settings.week_start = ws
        if "hp_values" in data:
            settings.hp_values = _clean_list(data["hp_values"])
        if "status_values" in data:
            settings.status_values = _clean_list(data["status_values"])
        settings.save()
        return Response(
            {
                "week_start": settings.week_start,
                "hp_values": settings.hp_values,
                "status_values": settings.status_values,
            }
        )


class MasterScheduleSectionsView(_MasterBase):
    def post(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        name = (request.data.get("name") or "").strip()
        if not name:
            return _bad("A section name is required.")
        if len(name) > 100:
            return _bad("Section names can be at most 100 characters.")
        level = 1 if str(request.data.get("level", 0)) == "1" else 0

        existing = list(MasterScheduleSection.objects.filter(organization=org))
        after = request.data.get("after")
        if after in (None, "", "end"):
            index = len(existing)
        elif after == "start":
            index = 0
        else:
            try:
                after_id = int(after)
            except (TypeError, ValueError):
                return _bad("after must be 'start', 'end' or a section id.")
            positions = [i for i, s in enumerate(existing) if s.id == after_id]
            if not positions:
                return _bad("The section to place this after was not found.", status.HTTP_404_NOT_FOUND)
            index = positions[0] + 1

        with transaction.atomic():
            section = MasterScheduleSection.objects.create(
                organization=org, name=name, level=level, sort_order=0
            )
            ordered = existing[:index] + [section] + existing[index:]
            for i, s in enumerate(ordered, start=1):
                s.sort_order = i
            MasterScheduleSection.objects.bulk_update(ordered, ["sort_order"])
        return Response(
            {"id": section.id, "name": section.name, "level": section.level, "rows": [], "index": index},
            status=status.HTTP_201_CREATED,
        )


class MasterScheduleSectionDetailView(_MasterBase):
    def delete(self, request, pk):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        section = MasterScheduleSection.objects.filter(pk=pk, organization=org).first()
        if section is None:
            return _bad("Section not found.", status.HTTP_404_NOT_FOUND)
        # Rows and their day entries go with it; people stay on the roster.
        section.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _row_payload(row):
    return {
        "id": row.id,
        "staff_id": row.staff_id,
        "staff_name": _staff_name(row.staff),
        "hp": row.hp,
        "status": row.status,
    }


def _resolve_staff(org, raw, exclude_row=None):
    """(staff, error) for a staff id from the client; None is allowed (blank row)."""
    if raw in (None, ""):
        return None, None
    try:
        staff = Staff.objects.get(pk=int(raw), organization=org)
    except (Staff.DoesNotExist, TypeError, ValueError):
        return None, "That person is not on this organization's roster."
    taken = MasterScheduleRow.objects.filter(organization=org, staff=staff)
    if exclude_row is not None:
        taken = taken.exclude(pk=exclude_row.pk)
    if taken.exists():
        return None, f"{_staff_name(staff)} is already on the master schedule."
    return staff, None


class MasterScheduleRowsView(_MasterBase):
    def post(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            section = MasterScheduleSection.objects.get(
                pk=int(request.data.get("section")), organization=org
            )
        except (MasterScheduleSection.DoesNotExist, TypeError, ValueError):
            return _bad("Section not found.", status.HTTP_404_NOT_FOUND)
        staff, err = _resolve_staff(org, request.data.get("staff"))
        if err:
            return _bad(err)
        settings = get_settings(org)
        hp = _clean_label(request.data.get("hp"))
        st = _clean_label(request.data.get("status"))
        last = MasterScheduleRow.objects.filter(section=section).aggregate(m=Max("sort_order"))["m"] or 0
        row = MasterScheduleRow.objects.create(
            organization=org, section=section, staff=staff, hp=hp, status=st, sort_order=last + 1
        )
        _remember(settings, "hp_values", hp)
        _remember(settings, "status_values", st)
        return Response(_row_payload(row), status=status.HTTP_201_CREATED)


class MasterScheduleRowDetailView(_MasterBase):
    def _row(self, request, pk):
        org = self._org(request)
        if org is None:
            return None, None
        return org, MasterScheduleRow.objects.filter(pk=pk, organization=org).select_related("staff").first()

    def patch(self, request, pk):
        denied = self._admin_only(request)
        if denied:
            return denied
        org, row = self._row(request, pk)
        if row is None:
            return _bad("Row not found.", status.HTTP_404_NOT_FOUND)
        settings = get_settings(org)
        data = request.data
        if "staff" in data:
            staff, err = _resolve_staff(org, data.get("staff"), exclude_row=row)
            if err:
                return _bad(err)
            row.staff = staff
        if "hp" in data:
            row.hp = _clean_label(data.get("hp"))
            _remember(settings, "hp_values", row.hp)
        if "status" in data:
            row.status = _clean_label(data.get("status"))
            _remember(settings, "status_values", row.status)
        row.save()
        return Response(_row_payload(row))

    def delete(self, request, pk):
        denied = self._admin_only(request)
        if denied:
            return denied
        _, row = self._row(request, pk)
        if row is None:
            return _bad("Row not found.", status.HTTP_404_NOT_FOUND)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MasterScheduleCellsView(_MasterBase):
    def put(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            row = MasterScheduleRow.objects.get(pk=int(request.data.get("row")), organization=org)
        except (MasterScheduleRow.DoesNotExist, TypeError, ValueError):
            return _bad("Row not found.", status.HTTP_404_NOT_FOUND)
        try:
            day = _date(request.data.get("date"), "date")
        except ValueError as e:
            return _bad(str(e))
        code = request.data.get("code")
        code = code if isinstance(code, str) else ""
        if code == "":
            MasterScheduleCell.objects.filter(row=row, date=day).delete()
            return Response({"row": row.id, "date": day.isoformat(), "code": ""})
        if code not in MASTER_SCHEDULE_CODES:
            return _bad(f"Code must be one of: {', '.join(MASTER_SCHEDULE_CODES)}.")
        MasterScheduleCell.objects.update_or_create(row=row, date=day, defaults={"code": code})
        return Response({"row": row.id, "date": day.isoformat(), "code": code})


class MasterScheduleCopyMonthView(_MasterBase):
    """
    Copy one month's day entries into another, work week by work week: the
    first week shown for the source month goes into the first week shown for
    the target month, and so on (if the target shows more weeks than the
    source, the source weeks repeat from the top). Only dates that really
    belong to the target month are written, so the days at the edges that
    belong to the neighbouring months are never touched.

    By default only empty cells are filled. With overwrite=true the target
    month becomes an exact copy (cells that are blank in the source are
    cleared).
    """

    def post(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            sy, sm = _year_month(request.data.get("source"), "source")
            ty, tm = _year_month(request.data.get("target"), "target")
        except ValueError as e:
            return _bad(str(e))
        if (sy, sm) == (ty, tm):
            return _bad("Choose a different month to copy from.")
        overwrite = request.data.get("overwrite") in (True, "true", "True", "1", 1)

        week_start = get_settings(org).week_start
        src_days = grid_dates(sy, sm, week_start)
        tgt_days = grid_dates(ty, tm, week_start)
        # (target date, source date) for the target month's own days only
        pairs = [
            (t, src_days[i % len(src_days)])
            for i, t in enumerate(tgt_days)
            if (t.year, t.month) == (ty, tm)
        ]

        row_ids = list(MasterScheduleRow.objects.filter(organization=org).values_list("id", flat=True))
        src_cells = {
            (c.row_id, c.date): c.code
            for c in MasterScheduleCell.objects.filter(
                row_id__in=row_ids, date__gte=src_days[0], date__lte=src_days[-1]
            )
        }
        existing = {
            (c.row_id, c.date): c
            for c in MasterScheduleCell.objects.filter(
                row_id__in=row_ids, date__in=[t for t, _ in pairs]
            )
        }

        to_create, to_update, to_delete = [], [], []
        for row_id in row_ids:
            for tdate, sdate in pairs:
                code = src_cells.get((row_id, sdate))
                cur = existing.get((row_id, tdate))
                if code:
                    if cur is None:
                        to_create.append(MasterScheduleCell(row_id=row_id, date=tdate, code=code))
                    elif overwrite and cur.code != code:
                        cur.code = code
                        to_update.append(cur)
                elif overwrite and cur is not None:
                    to_delete.append(cur.pk)

        with transaction.atomic():
            MasterScheduleCell.objects.bulk_create(to_create)
            MasterScheduleCell.objects.bulk_update(to_update, ["code"])
            if to_delete:
                MasterScheduleCell.objects.filter(pk__in=to_delete).delete()
        return Response(
            {"created": len(to_create), "updated": len(to_update), "cleared": len(to_delete)}
        )
