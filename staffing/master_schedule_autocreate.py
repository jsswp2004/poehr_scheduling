"""
POST master-schedule/create-schedule/   {month: "YYYY-MM", overwrite?: bool}

Builds the Calendar tab's shifts from the Master Schedule for one month. A day
code in a person's row (for example 7A on Monday Oct 5) becomes a calendar shift
for that person on that date (7:00 AM - 7:00 PM); see master_schedule_autogen
for what every code means. Only dates inside the chosen month are used.

Units: the Unit column on a person's row decides which care unit their shifts go
to. When that is blank, a person listed under a unit sub-heading (Unit 2, Unit 3,
Unit 1A/1B ...) gets the care unit with that name (see Units & Census); people
under any other section with no Unit chosen have no unit. Section and unit names
are compared ignoring case, spaces and a leading "Unit", so "Unit 2" matches
"Unit 2" or "2".

Safe to run again: a shift the person already has on that date and shift type
(from this button, a recurring pattern or a manual assignment) is left alone and
nothing is duplicated. With overwrite=true, shifts that an earlier run created
from the Master Schedule are brought back in line with it (removed if the code
was cleared or changed, times and unit refreshed). Even without overwrite, a shift from
an earlier run that has no unit gets its unit filled in once the unit exists; shifts made any other way are
never touched.
"""

import datetime

from django.db import transaction
from rest_framework.response import Response

from .master_schedule_autogen import CODE_SHIFTS, MASTER_NOTE
from .master_schedule_views import _bad, _MasterBase, _unit_ids_by_key, _unit_key, _year_month
from .models import MasterScheduleCell, StaffShift, Unit


class MasterScheduleCreateScheduleView(_MasterBase):
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

        first = datetime.date(year, month, 1)
        last = datetime.date(year + (month == 12), month % 12 + 1, 1) - datetime.timedelta(days=1)

        unit_by_key = _unit_ids_by_key(org)

        cells = MasterScheduleCell.objects.filter(
            row__organization=org, date__gte=first, date__lte=last, code__in=list(CODE_SHIFTS)
        ).select_related("row", "row__section")

        wanted = {}  # (staff_id, date, shift_type) -> (start, end, unit_id)
        blank_rows, no_unit = set(), set()
        for c in cells:
            if c.row.staff_id is None:
                blank_rows.add(c.row_id)
                continue
            section_name = c.row.section.name
            # the row's own Unit wins; otherwise the unit matching the section name
            unit_id = c.row.unit_id or unit_by_key.get(_unit_key(section_name))
            if unit_id is None and section_name.strip().lower().startswith("unit"):
                no_unit.add(section_name.strip())
            for shift_type, start, end in CODE_SHIFTS[c.code]:
                wanted[(c.row.staff_id, c.date, shift_type)] = (start, end, unit_id)

        existing = {}
        for s in StaffShift.objects.filter(organization=org, date__gte=first, date__lte=last):
            existing.setdefault((s.staff_id, s.date, s.shift_type), s)

        to_create, to_update, to_delete, already = [], [], [], 0
        for key, (start, end, unit_id) in wanted.items():
            have = existing.get(key)
            if have is None:
                staff_id, day, shift_type = key
                to_create.append(
                    StaffShift(
                        organization=org, staff_id=staff_id, date=day, shift_type=shift_type,
                        unit_id=unit_id, start_time=start, end_time=end,
                        source="manual", notes=MASTER_NOTE,
                    )
                )
                continue
            already += 1
            if have.notes != MASTER_NOTE:
                continue  # entered by hand or from a pattern: never touched
            if overwrite and (have.start_time, have.end_time, have.unit_id) != (start, end, unit_id):
                have.start_time, have.end_time, have.unit_id = start, end, unit_id
                to_update.append(have)
            elif have.unit_id is None and unit_id is not None:
                # an earlier run had no unit to put it on; fill it in, never override a unit someone chose
                have.unit_id = unit_id
                to_update.append(have)
        if overwrite:
            for key, shift in existing.items():
                if key not in wanted and shift.notes == MASTER_NOTE and shift.source == "manual":
                    to_delete.append(shift.pk)

        with transaction.atomic():
            StaffShift.objects.bulk_create(to_create)
            StaffShift.objects.bulk_update(to_update, ["start_time", "end_time", "unit"])
            if to_delete:
                StaffShift.objects.filter(pk__in=to_delete).delete()

        return Response(
            {
                "created": len(to_create),
                "already_scheduled": already,
                "updated": len(to_update),
                "removed": len(to_delete),
                "people": len({k[0] for k in wanted}),
                "blank_rows_skipped": len(blank_rows),
                "unmatched_units": sorted(no_unit),
                "without_unit": sum(1 for v in wanted.values() if v[2] is None),
                "units_on_file": sorted(u.name for u in Unit.objects.filter(organization=org, is_active=True)),
            }
        )
