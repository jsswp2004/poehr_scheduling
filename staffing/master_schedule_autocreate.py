"""
POST master-schedule/auto-create/   {month: "YYYY-MM", overwrite?: bool}

Builds the month's schedule for the nursing sections (see master_schedule_autogen
for the rules). Only dates inside the chosen month are written. By default nothing
already entered is changed; with overwrite=true the shift entries already in that
month for those people are replaced (requested-off "R" and "x" entries are kept).
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from .master_schedule_autogen import OFF_CODES, plan_schedule, shifts_for_sections
from .master_schedule_views import (
    _bad,
    _MasterBase,
    _year_month,
    ensure_default_sections,
    get_settings,
    grid_dates,
)
from .models import MasterScheduleCell, MasterScheduleRow, MasterScheduleSection

SKIP_STATUSES = {"pt", "prn"}


class MasterScheduleAutoCreateView(_MasterBase):
    def post(self, request):
        denied = self._admin_only(request)
        if denied:
            return denied
        org = self._org(request)
        if org is None:
            return _bad("No organization.")
        try:
            year, month = _year_month(request.data.get("month"), "month")
        except ValueError as e:
            return _bad(str(e))
        overwrite = request.data.get("overwrite") in (True, "true", "True", "1", 1)

        ensure_default_sections(org)
        days = grid_dates(year, month, get_settings(org).week_start)
        writable = {d for d in days if (d.year, d.month) == (year, month)}

        sections = list(MasterScheduleSection.objects.filter(organization=org))
        shift_of = shifts_for_sections([(s.id, s.name, s.level) for s in sections])
        if not shift_of:
            return _bad("There are no nursing sections on the master schedule to schedule.")

        rows = list(
            MasterScheduleRow.objects.filter(organization=org, section__in=sections)
            .select_related("section")
            .order_by("section__sort_order", "section_id", "sort_order", "id")
        )
        groups, blank = {}, 0
        for r in rows:
            shift = shift_of.get(r.section_id)
            if shift is None or (r.status or "").strip().lower() in SKIP_STATUSES:
                continue
            if r.staff_id is None:
                blank += 1
                continue
            groups.setdefault(shift, []).append(r.id)
        people = sum(len(v) for v in groups.values())
        if not people:
            return _bad("No one in the nursing sections is eligible (rows need a person and a status other than PT or PRN).")

        scheduled_ids = {rid for ids in groups.values() for rid in ids}
        existing_qs = MasterScheduleCell.objects.filter(
            row__organization=org, date__gte=days[0], date__lte=days[-1]
        )
        existing = {(c.row_id, c.date): c.code for c in existing_qs}

        to_clear = []
        if overwrite:
            for c in existing_qs.filter(row_id__in=scheduled_ids, date__in=writable):
                if c.code not in OFF_CODES:
                    to_clear.append(c.pk)
                    existing.pop((c.row_id, c.date), None)

        new = plan_schedule(days, groups, existing, writable)

        with transaction.atomic():
            if to_clear:
                MasterScheduleCell.objects.filter(pk__in=to_clear).delete()
            MasterScheduleCell.objects.bulk_create(
                [MasterScheduleCell(row_id=rid, date=d, code=code) for (rid, d), code in new.items()]
            )
        return Response(
            {
                "created": len(new),
                "cleared": len(to_clear),
                "people": people,
                "blank_rows_skipped": blank,
            },
            status=status.HTTP_200_OK,
        )
