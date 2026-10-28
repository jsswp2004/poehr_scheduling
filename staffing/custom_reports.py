"""
Custom reports (Reports module).

A *source* is a curated view over Staffing data: it lists the fields a report may use and loads one
detail row per record, always limited to one organization. A saved report (CustomReport.config) picks a
source, the columns, how to group, filters, a highlight rule, summary tiles and a sort. run_report()
turns that into rows for the viewer, the export and the print view.

Field kinds
    dimension  text or date; can be grouped on and filtered on.
    measure    a number. How it combines when rows are grouped is its `agg`:
               sum | avg | max | distinct (count of distinct values of the row key named by `of`).
               A measure with `ratio=(numerator, denominator)` is computed from the two sums.
"""

import datetime
from collections import OrderedDict, defaultdict

MAX_ROWS = 5000
MAX_RANGE_DAYS = 400

OPS = {"is", "is_not", "any_of", "contains", "gt", "gte", "lt", "lte"}
TILE_AGGS = {"sum", "avg", "max", "count"}


class ReportConfigError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Source registry
# ---------------------------------------------------------------------------
SOURCES = OrderedDict()


def dim(key, label, type_="text"):
    return {"key": key, "label": label, "kind": "dimension", "type": type_}


def measure(key, label, type_="number", agg="sum", of=None, ratio=None):
    return {"key": key, "label": label, "kind": "measure", "type": type_, "agg": agg, "of": of, "ratio": ratio}


MODULES = {"staffing": "Staffing", "communicator": "Communicator"}


def register(
    key, label, group, description, fields, load, dated=True, default_columns=None, default_group=None,
    module="staffing", right=None,
):
    """`right` is a users.rights code the user must hold to use the source; None = the Staffing report roles."""
    SOURCES[key] = {
        "key": key,
        "module": module,
        "right": right,
        "label": label,
        "group": group,
        "description": description,
        "fields": fields,
        "load": load,
        "dated": dated,
        "default_columns": default_columns or [f["key"] for f in fields],
        "default_group": default_group,
    }


def source_summary(src):
    """What the builder needs to know about a source (no loader)."""
    return {
        "key": src["key"],
        "module": src["module"],
        "module_label": MODULES.get(src["module"], src["module"]),
        "label": src["label"],
        "group": src["group"],
        "description": src["description"],
        "dated": src["dated"],
        "default_columns": src["default_columns"],
        "default_group": src["default_group"],
        "fields": [
            {k: f[k] for k in ("key", "label", "kind", "type")} | ({"agg": f["agg"]} if f["kind"] == "measure" else {})
            for f in src["fields"]
        ],
    }


def source_allowed(src, user):
    """Can this user use the source? Staffing sources follow the Staffing report roles; others a rights code."""
    if src["right"]:
        from users.rights import user_has_right

        return user_has_right(user, src["right"])
    from .views import MANAGER_ROLES

    return getattr(user, "role", None) in MANAGER_ROLES


def get_source(key):
    src = SOURCES.get(key)
    if not src:
        raise ReportConfigError("Unknown report source.")
    return src


def field_map(src):
    return {f["key"]: f for f in src["fields"]}


# ---------------------------------------------------------------------------
# Loaders: one dict per record
# ---------------------------------------------------------------------------
def _staff_name(s):
    return f"{s.last_name}, {s.first_name}"


def _role_label(s):
    from .models import NURSING_ROLE_CHOICES

    return dict(NURSING_ROLE_CHOICES).get(s.nursing_role, s.nursing_role)


def _monday(d):
    return d - datetime.timedelta(days=d.weekday())


def _shift_rows(org, start, end):
    """Non-cancelled shifts with a duration, a person entered twice for one slot counted once."""
    from .models import StaffShift
    from .views import _shift_duration_hours, _slot_key

    qs = (
        StaffShift.objects.filter(organization=org, date__gte=start, date__lte=end, is_cancelled=False)
        .select_related("staff", "unit")
        .order_by("date", "start_time")
    )
    seen = set()
    for sh in qs:
        key = _slot_key(sh)
        if key in seen:
            continue
        seen.add(key)
        yield sh, (_shift_duration_hours(sh) or 0.0)


def load_shifts(org, start, end):
    from .models import StaffShift

    origin = dict(StaffShift.SOURCE_CHOICES)
    rows = []
    for sh, hours in _shift_rows(org, start, end):
        rows.append(
            {
                "date": sh.date.isoformat(),
                "week": _monday(sh.date).isoformat(),
                "unit": sh.unit.name if sh.unit_id else "No unit",
                "shift": sh.get_shift_type_display(),
                "staff": _staff_name(sh.staff),
                "_staff": sh.staff_id,
                "profession": sh.staff.profession,
                "role": _role_label(sh.staff),
                "origin": origin.get(sh.source, sh.source),
                "shifts": 1,
                "hours": hours,
            }
        )
    return rows


def load_hours_overtime(org, start, end):
    """One row per person per Monday-Sunday week (whole weeks that touch the range)."""
    from .availability_views import WEEKLY_CAP_HOURS

    wk_start = _monday(start)
    wk_end = _monday(end) + datetime.timedelta(days=6)
    people = {}
    for sh, hours in _shift_rows(org, wk_start, wk_end):
        wk = _monday(sh.date)
        p = people.setdefault(
            (sh.staff_id, wk),
            {"staff": sh.staff, "week": wk, "hours": 0.0, "shifts": 0, "by_unit": defaultdict(float)},
        )
        p["hours"] += hours
        p["shifts"] += 1
        p["by_unit"][sh.unit.name if sh.unit_id else "No unit"] += hours
    rows = []
    for (_sid, wk), p in sorted(people.items(), key=lambda kv: (kv[0][1], _staff_name(kv[1]["staff"]))):
        ot = max(p["hours"] - WEEKLY_CAP_HOURS, 0.0)
        main_unit = max(p["by_unit"].items(), key=lambda kv: kv[1])[0] if p["by_unit"] else "No unit"
        rows.append(
            {
                "week": wk.isoformat(),
                "unit": main_unit,
                "staff": _staff_name(p["staff"]),
                "_staff": p["staff"].id,
                "profession": p["staff"].profession,
                "role": _role_label(p["staff"]),
                "shifts": p["shifts"],
                "hours": p["hours"],
                "regular_hours": p["hours"] - ot,
                "overtime_hours": ot,
            }
        )
    return rows


def load_unscheduled(org, start, end):
    from .models import Staff, StaffShift

    scheduled = set(
        StaffShift.objects.filter(organization=org, date__gte=start, date__lte=end, is_cancelled=False)
        .values_list("staff_id", flat=True)
        .distinct()
    )
    rows = []
    for s in Staff.objects.filter(organization=org, is_active=True).order_by("last_name", "first_name"):
        if s.id in scheduled:
            continue
        rows.append(
            {
                "staff": _staff_name(s),
                "_staff": s.id,
                "profession": s.profession,
                "role": _role_label(s),
                "login": "Yes" if s.user_id else "No",
                "people": 1,
            }
        )
    return rows


def load_roster(org, start, end):
    from .models import Staff

    rows = []
    for s in Staff.objects.filter(organization=org).order_by("last_name", "first_name"):
        rows.append(
            {
                "staff": _staff_name(s),
                "_staff": s.id,
                "profession": s.profession,
                "role": _role_label(s),
                "status": "Active" if s.is_active else "Inactive",
                "login": "Yes" if s.user_id else "No",
                "reminders": "On" if s.reminders_enabled else "Off",
                "added": s.created_at.date().isoformat(),
                "people": 1,
            }
        )
    return rows


def load_coverage_alerts(org, start, end):
    from .models import CoverageAlert

    qs = (
        CoverageAlert.objects.filter(requirement__organization=org, date__gte=start, date__lte=end)
        .select_related("requirement", "requirement__unit")
        .order_by("date")
    )
    rows = []
    for a in qs:
        req = a.requirement
        required = req.min_staff_required
        rows.append(
            {
                "date": a.date.isoformat(),
                "unit": req.unit.name if req.unit_id else "Whole organization",
                "shift": req.get_shift_type_display(),
                "alerted": a.sent_at.date().isoformat() if a.sent_at else None,
                "alerts": 1,
                "required": required,
                "assigned": a.staff_assigned_count,
                "shortfall": max(required - a.staff_assigned_count, 0),
            }
        )
    return rows


def load_census_hppd(org, start, end):
    """Census per unit per day, with the direct-care hours (RN, LPN, CNA) scheduled on that unit that day."""
    from .models import UnitCensus

    hours = defaultdict(float)
    for sh, h in _shift_rows(org, start, end):
        if sh.unit_id and sh.staff.nursing_role in ("rn", "lpn", "cna"):
            hours[(sh.unit_id, sh.date)] += h
    qs = UnitCensus.objects.filter(unit__organization=org, date__gte=start, date__lte=end).select_related("unit").order_by("date")
    rows = []
    for c in qs:
        rows.append(
            {
                "date": c.date.isoformat(),
                "week": _monday(c.date).isoformat(),
                "unit": c.unit.name,
                "days": 1,
                "census": c.census,
                "nursing_hours": hours.get((c.unit_id, c.date), 0.0),
            }
        )
    return rows


def load_time_off(org, start, end):
    from .models import StaffTimeOffRequest

    kinds = dict(StaffTimeOffRequest.KIND_CHOICES)
    statuses = dict(StaffTimeOffRequest.STATUS_CHOICES)
    qs = (
        StaffTimeOffRequest.objects.filter(organization=org, start_date__lte=end, end_date__gte=start)
        .select_related("staff", "decided_by", "cover_staff")
        .order_by("start_date")
    )
    rows = []
    for r in qs:
        decider = ""
        if r.decided_by_id:
            decider = (r.decided_by.get_full_name() or r.decided_by.get_username() or "").strip()
        rows.append(
            {
                "staff": _staff_name(r.staff),
                "_staff": r.staff_id,
                "profession": r.staff.profession,
                "type": kinds.get(r.kind, r.kind),
                "status": statuses.get(r.status, r.status),
                "start": r.start_date.isoformat(),
                "end": r.end_date.isoformat(),
                "decided_by": decider or None,
                "covered_by": _staff_name(r.cover_staff) if r.cover_staff_id else None,
                "requests": 1,
                "days": (r.end_date - r.start_date).days + 1,
            }
        )
    return rows


_STAFF_DIMS = [dim("staff", "Staff member"), dim("profession", "Profession"), dim("role", "Care role")]

register(
    "shifts", "Shifts", "Schedule", "One row per scheduled shift.",
    [dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("unit", "Unit"), dim("shift", "Shift")]
    + _STAFF_DIMS
    + [dim("origin", "How it was scheduled"),
       measure("shifts", "Shifts"), measure("hours", "Hours", "hours"),
       measure("people", "Staff scheduled", agg="distinct", of="_staff")],
    load_shifts,
    default_columns=["unit", "shifts", "hours", "people"], default_group="unit",
)
register(
    "unscheduled", "Unscheduled staff", "Schedule", "Active staff with no shift in the date range.",
    _STAFF_DIMS + [dim("login", "Has app login"), measure("people", "Staff")],
    load_unscheduled,
    default_columns=["staff", "profession", "role", "login"],
)
register(
    "roster", "Staff roster", "Schedule", "One row per person on the roster. Not limited by date.",
    _STAFF_DIMS + [dim("status", "Status"), dim("login", "Has app login"), dim("reminders", "Shift reminders"),
                   dim("added", "Added on", "date"), measure("people", "Staff")],
    load_roster, dated=False,
    default_columns=["staff", "profession", "role", "status", "login", "reminders"],
)
register(
    "coverage_alerts", "Coverage alerts", "Coverage", "Each understaffing alert that was sent, with the shortfall.",
    [dim("date", "Date", "date"), dim("unit", "Unit"), dim("shift", "Shift"), dim("alerted", "Alert sent on", "date"),
     measure("alerts", "Alerts"), measure("required", "Required", agg="max"),
     measure("assigned", "Assigned", agg="max"), measure("shortfall", "Shortfall")],
    load_coverage_alerts,
    default_columns=["date", "unit", "shift", "required", "assigned", "shortfall"],
)
register(
    "census_hppd", "Census and nursing hours", "Coverage", "Daily census per unit against the direct-care hours scheduled.",
    [dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("unit", "Unit"),
     measure("days", "Unit-days"), measure("census", "Resident days"),
     measure("nursing_hours", "Nursing hours", "hours"),
     measure("hppd", "Hours per resident day", "ratio", ratio=("nursing_hours", "census"))],
    load_census_hppd,
    default_columns=["unit", "census", "nursing_hours", "hppd"], default_group="unit",
)
register(
    "hours_overtime", "Hours and overtime", "Hours", "One row per person per week. Overtime is hours above 36 in a week.",
    [dim("week", "Week of", "date"), dim("unit", "Main unit")] + _STAFF_DIMS
    + [measure("shifts", "Shifts"), measure("hours", "Hours", "hours"),
       measure("regular_hours", "Regular hours", "hours"), measure("overtime_hours", "Overtime hours", "hours"),
       measure("overtime_pct", "Overtime %", "percent", ratio=("overtime_hours", "hours")),
       measure("people", "Staff", agg="distinct", of="_staff")],
    load_hours_overtime,
    default_columns=["unit", "hours", "overtime_hours", "overtime_pct", "people"], default_group="unit",
)
register(
    "time_off", "Time-off requests", "Time off", "Planned time off and call-outs that overlap the date range.",
    _STAFF_DIMS[:2] + [dim("type", "Type"), dim("status", "Status"), dim("start", "From", "date"), dim("end", "To", "date"),
                       dim("decided_by", "Decided by"), dim("covered_by", "Covered by"),
                       measure("requests", "Requests"), measure("days", "Days")],
    load_time_off,
    default_columns=["staff", "type", "status", "start", "end", "days"],
)


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------
def _clean_filter(f, fields, label="Filter"):
    if not isinstance(f, dict):
        raise ReportConfigError(f"{label} is not valid.")
    key, op = f.get("field"), f.get("op")
    if key not in fields:
        raise ReportConfigError(f"{label}: unknown field.")
    if op not in OPS:
        raise ReportConfigError(f"{label}: unknown comparison.")
    value = f.get("value")
    if op == "any_of":
        if not isinstance(value, list):
            raise ReportConfigError(f"{label}: choose one or more values.")
        value = [str(v) for v in value][:200]
    elif fields[key]["kind"] == "measure" or op in ("gt", "gte", "lt", "lte"):
        try:
            value = float(value)
        except (TypeError, ValueError):
            raise ReportConfigError(f"{label}: enter a number.")
    else:
        value = "" if value is None else str(value)
    return {"field": key, "op": op, "value": value}


def clean_config(source_key, config):
    """Validate and normalise a report config. Raises ReportConfigError."""
    src = get_source(source_key)
    fields = field_map(src)
    config = config if isinstance(config, dict) else {}
    group_by = config.get("group_by") or None
    if group_by is not None and (group_by not in fields or fields[group_by]["kind"] != "dimension"):
        raise ReportConfigError("Choose a text or date field to group by.")
    columns = []
    for key in config.get("columns") or src["default_columns"]:
        if key not in fields or key in columns:
            continue
        # Grouped reports show the group field plus measures only.
        if group_by and fields[key]["kind"] == "dimension" and key != group_by:
            continue
        columns.append(key)
    if group_by and group_by not in columns:
        columns.insert(0, group_by)
    if not columns:
        raise ReportConfigError("Choose at least one column.")
    filters = [_clean_filter(f, fields) for f in (config.get("filters") or [])][:12]
    highlight = config.get("highlight")
    if highlight:
        highlight = _clean_filter(highlight, fields, "Highlight")
        if highlight["op"] == "any_of":
            raise ReportConfigError("Highlight needs a single value.")
        if highlight["field"] not in columns:
            highlight = None
    else:
        highlight = None
    tiles = []
    for t in (config.get("tiles") or [])[:6]:
        if not isinstance(t, dict):
            continue
        field, agg = t.get("field"), t.get("agg") or "sum"
        if field == "_rows":
            tiles.append({"field": "_rows", "agg": "count", "label": str(t.get("label") or "Rows")[:40]})
            continue
        if field == "_flagged":
            tiles.append({"field": "_flagged", "agg": "count", "label": str(t.get("label") or "Highlighted rows")[:40]})
            continue
        if field not in fields or fields[field]["kind"] != "measure" or agg not in TILE_AGGS - {"count"}:
            continue
        tiles.append({"field": field, "agg": agg, "label": str(t.get("label") or fields[field]["label"])[:40]})
    sort = config.get("sort")
    if isinstance(sort, dict) and sort.get("field") in columns:
        sort = {"field": sort["field"], "dir": "asc" if sort.get("dir") == "asc" else "desc"}
    else:
        sort = None
    return {
        "columns": columns,
        "group_by": group_by,
        "filters": filters,
        "highlight": highlight,
        "tiles": tiles,
        "sort": sort,
        "totals": bool(config.get("totals", True)),
    }


# ---------------------------------------------------------------------------
# Running a report
# ---------------------------------------------------------------------------
def _match(row, f, fields):
    val = row.get(f["field"])
    op, want = f["op"], f["value"]
    if op == "any_of":
        return str(val) in want if want else True
    if op == "is":
        return (str(val) if val is not None else "") == want if not isinstance(want, float) else val == want
    if op == "is_not":
        return (str(val) if val is not None else "") != want if not isinstance(want, float) else val != want
    if op == "contains":
        return str(want).lower() in str(val or "").lower()
    if val is None:
        return False
    try:
        val = float(val)
    except (TypeError, ValueError):
        return False
    return {"gt": val > want, "gte": val >= want, "lt": val < want, "lte": val <= want}[op]


def _agg_rows(rows, f, fields):
    """One measure over a list of detail rows."""
    if f.get("ratio"):
        num = sum(r.get(f["ratio"][0]) or 0 for r in rows)
        den = sum(r.get(f["ratio"][1]) or 0 for r in rows)
        if not den:
            return None
        return num / den * (100.0 if f["type"] == "percent" else 1.0)
    vals = [r.get(f["key"]) for r in rows if r.get(f["key"]) is not None]
    agg = f["agg"]
    if agg == "distinct":
        return len({r.get(f["of"]) for r in rows if r.get(f["of"]) is not None})
    if not vals:
        return 0 if agg == "sum" else None
    if agg == "sum":
        return sum(vals)
    if agg == "avg":
        return sum(vals) / len(vals)
    if agg == "max":
        return max(vals)
    return None


def _round(v, f):
    if v is None:
        return None
    if f["type"] in ("hours", "ratio", "percent"):
        return round(v, 2 if f["type"] != "percent" else 1)
    return round(v, 2) if isinstance(v, float) and v != int(v) else (int(v) if isinstance(v, float) else v)


def _single(row, f):
    """A detail row's own value for a measure column (ungrouped view)."""
    if f.get("ratio"):
        den = row.get(f["ratio"][1]) or 0
        if not den:
            return None
        return (row.get(f["ratio"][0]) or 0) / den * (100.0 if f["type"] == "percent" else 1.0)
    if f["agg"] == "distinct":
        return 1
    return row.get(f["key"])


def run_report(source_key, org, config, start, end, narrow=None):
    """
    Returns {"columns", "rows", "totals", "tiles", "truncated", "source"}.
    `narrow` is a list of extra filters from the viewer's pickers (never widens the saved filters).
    """
    src = get_source(source_key)
    fields = field_map(src)
    cfg = clean_config(source_key, config)
    if src["dated"]:
        if start is None or end is None or end < start:
            raise ReportConfigError("Choose a start and end date.")
        if (end - start).days > MAX_RANGE_DAYS:
            raise ReportConfigError(f"Choose a range of {MAX_RANGE_DAYS} days or fewer.")
    detail = src["load"](org, start, end)
    filters = cfg["filters"] + [_clean_filter(f, fields, "Filter") for f in (narrow or [])][:12]
    detail = [r for r in detail if all(_match(r, f, fields) for f in filters)]

    cols = [fields[k] for k in cfg["columns"]]
    group_by = cfg["group_by"]
    out = []
    if group_by:
        groups = OrderedDict()
        for r in detail:
            g = r.get(group_by)
            groups.setdefault("—" if g in (None, "") else g, []).append(r)
        for g, rows in groups.items():
            row = {}
            for c in cols:
                row[c["key"]] = g if c["key"] == group_by else _round(_agg_rows(rows, c, fields), c)
            out.append(row)
    else:
        for r in detail:
            row = {}
            for c in cols:
                v = r.get(c["key"]) if c["kind"] == "dimension" else _round(_single(r, c), c)
                row[c["key"]] = v
            out.append(row)

    hl = cfg["highlight"]
    flagged = 0
    for row in out:
        flag = bool(hl and row.get(hl["field"]) is not None and _match(row, hl, fields))
        row["_flag"] = flag
        flagged += flag

    sort = cfg["sort"]
    if sort:
        k = sort["field"]
        have = [r for r in out if r.get(k) is not None]
        none = [r for r in out if r.get(k) is None]
        have.sort(key=lambda r: (str(r[k]) if not isinstance(r[k], (int, float)) else r[k]), reverse=sort["dir"] == "desc")
        out = have + none
    elif group_by and fields[group_by]["type"] == "date":
        out.sort(key=lambda r: str(r.get(group_by)))

    truncated = len(out) > MAX_ROWS
    out = out[:MAX_ROWS]

    totals = None
    if cfg["totals"]:
        totals = {}
        for c in cols:
            if c["kind"] == "measure":
                totals[c["key"]] = _round(_agg_rows(detail, c, fields), c)
            else:
                totals[c["key"]] = None
        first_dim = next((c["key"] for c in cols if c["kind"] == "dimension"), None)
        if first_dim:
            totals[first_dim] = "Total"

    tiles = []
    for t in cfg["tiles"]:
        if t["field"] == "_rows":
            tiles.append({"label": t["label"], "value": len(out), "type": "number", "tone": None})
        elif t["field"] == "_flagged":
            tiles.append({"label": t["label"], "value": flagged, "type": "number", "tone": "bad" if flagged else None})
        else:
            f = dict(fields[t["field"]])
            if not f.get("ratio") and f["agg"] != "distinct":
                f["agg"] = t["agg"]
            tiles.append({"label": t["label"], "value": _round(_agg_rows(detail, f, fields), f), "type": f["type"], "tone": None})

    return {
        "source": {"key": src["key"], "label": src["label"], "dated": src["dated"]},
        "columns": [{"key": c["key"], "label": c["label"], "type": c["type"], "kind": c["kind"]} for c in cols],
        "rows": out,
        "totals": totals,
        "tiles": tiles,
        "highlight": hl,
        "truncated": truncated,
        "row_count": len(out),
    }


# Sources for other modules register themselves on import.
from . import custom_report_sources_communicator  # noqa: E402,F401
