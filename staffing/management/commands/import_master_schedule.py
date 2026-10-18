"""
Fill an organization's Master Schedule from a JSON export of the paper template
(sections in order, each with rows: first, last, hp, status and one code per day).

    python manage.py import_master_schedule \
        --org-name "St. Mary's Rehabilitation and Nursing Center" --month 2026-10

The template's first day column is the first day of the month's grid (a work-week
start day), so day column 1 lands on the first grid date, column 2 on the next, and
so on. People are matched to the roster by first and last name; anyone not found is
left as a blank row (their day entries are still kept) and listed at the end.
Existing rows are never touched unless --replace is given. Safe to re-run with --dry-run.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from staffing.master_schedule_views import (
    _year_month,
    ensure_default_sections,
    get_settings,
    grid_dates,
)
from staffing.models import (
    MASTER_SCHEDULE_CODES,
    MasterScheduleCell,
    MasterScheduleRow,
    MasterScheduleSection,
    Staff,
)
from users.models import Organization

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "st_marys_master_schedule.json"


class Command(BaseCommand):
    help = "Import sections' rows, HP/Status and day entries into the Master Schedule."

    def add_arguments(self, parser):
        parser.add_argument("--org-name", required=True)
        parser.add_argument("--month", required=True, help="Month the first day column starts, e.g. 2026-10")
        parser.add_argument("--file", default=str(DEFAULT_FILE))
        parser.add_argument("--replace", action="store_true", help="Delete the organization's existing rows first.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        try:
            year, month = _year_month(opts["month"], "--month")
        except ValueError as e:
            raise CommandError(str(e))
        org = Organization.objects.filter(name=opts["org_name"]).first()
        if org is None:
            raise CommandError(f"No organization named {opts['org_name']!r}.")
        data = json.loads(Path(opts["file"]).read_text(encoding="utf-8"))

        settings = get_settings(org)
        if settings.week_start != 3:
            raise CommandError("The template starts on Thursday; set the work-week start to Thursday first.")
        grid = grid_dates(year, month, settings.week_start)
        days = min(int(data.get("days", 28)), len(grid))

        with transaction.atomic():
            ensure_default_sections(org)
            sections = list(MasterScheduleSection.objects.filter(organization=org))
            wanted = data["sections"]
            norm = lambda s: " ".join(s.lower().split())
            if [norm(s.name) for s in sections] != [norm(s["name"]) for s in wanted]:
                raise CommandError(
                    "The organization's sections don't match the template's sections in order; "
                    "use a fresh Master Schedule or adjust the sections first."
                )
            existing = MasterScheduleRow.objects.filter(organization=org)
            if existing.exists():
                if not opts["replace"]:
                    raise CommandError("Rows already exist. Re-run with --replace to rebuild them.")
                existing.delete()

            used, unmatched, rows_made, cells_made = set(), [], 0, 0
            hp_vals, st_vals = list(settings.hp_values or []), list(settings.status_values or [])
            for section, spec in zip(sections, wanted):
                for order, r in enumerate(spec["rows"], start=1):
                    staff = None
                    if r["first"] or r["last"]:
                        staff = Staff.objects.filter(
                            organization=org, first_name__iexact=r["first"], last_name__iexact=r["last"]
                        ).first()
                        if staff is None or staff.id in used:
                            unmatched.append(f"{r['first']} {r['last']}".strip() + f"  [{spec['name']}]")
                            staff = None
                        else:
                            used.add(staff.id)
                    row = MasterScheduleRow.objects.create(
                        organization=org, section=section, staff=staff,
                        hp=r["hp"], status=r["status"], sort_order=order,
                    )
                    rows_made += 1
                    if r["hp"] and r["hp"] not in hp_vals:
                        hp_vals.append(r["hp"])
                    if r["status"] and r["status"] not in st_vals:
                        st_vals.append(r["status"])
                    batch = [
                        MasterScheduleCell(row=row, date=grid[i], code=code)
                        for i, code in enumerate(r["codes"][:days])
                        if code in MASTER_SCHEDULE_CODES
                    ]
                    MasterScheduleCell.objects.bulk_create(batch)
                    cells_made += len(batch)
            settings.hp_values, settings.status_values = hp_vals, st_vals
            settings.save()

            self.stdout.write(
                f"{rows_made} rows, {cells_made} day entries, "
                f"{grid[0]} .. {grid[days - 1]} ({days} day columns)."
            )
            if unmatched:
                self.stdout.write(self.style.WARNING("Left as blank rows (not matched to the roster):"))
                for u in unmatched:
                    self.stdout.write(f"  - {u}")
            if opts["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("Dry run: nothing was saved.")
