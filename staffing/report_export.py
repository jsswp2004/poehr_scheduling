"""
Report files for the Staffing Reports tab: one PDF / CSV builder shared by the Export menu
(GET /api/staffing/reports/export/<kind>/?file=pdf|csv) and by emailed report subscriptions.

Each report's data comes from the very same view that feeds the Reports tab, called in-process as
the requesting user, so an exported or emailed file always matches what the screen shows and the
same organization scoping and permissions apply.
"""

import csv
import datetime
import io
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
from rest_framework.test import APIRequestFactory, force_authenticate

from . import daily_report_pdf as pdf

# kind -> (label, formats offered)
REPORTS = {
    "coverage_compliance": ("Coverage compliance", ("pdf", "csv")),
    "schedule": ("Schedule", ("pdf", "csv")),
    "master_schedule": ("Master schedule", ("pdf",)),
    "daily_forms": ("Daily staffing forms", ("pdf",)),
    "unscheduled": ("Staff with no schedule", ("pdf", "csv")),
    "labor_hours": ("Labor hours", ("pdf", "csv")),
    "shift_distribution": ("Shift-type distribution", ("pdf", "csv")),
    "message_log": ("Message delivery log", ("pdf", "csv")),
}
DAILY_FORMS = ("assignment", "shift-sheet", "hours", "worksheet")
SHIFT_ORDER = ("day", "evening", "night", "custom")
SHIFT_LABELS = {"day": "Day", "evening": "Evening", "night": "Night", "custom": "Custom"}


class ReportError(Exception):
    """A report could not be built (bad parameters, nothing to build, ...)."""


@dataclass
class Table_:
    title: str
    columns: list
    rows: list
    notes: list = field(default_factory=list)
    landscape: bool = False
    widths: list = None  # relative column widths (any scale)


@dataclass
class ReportFile:
    filename: str
    content_type: str
    data: bytes
    summary: str = ""  # one line of totals for the email body


# ------------------------------------------------------------------ calling the report views
def _call(view, user, org, path, params, **kwargs):
    request = APIRequestFactory().get(path, {k: v for k, v in params.items() if v not in (None, "")})
    force_authenticate(request, user=user)
    response = view(request, **kwargs)
    if getattr(response, "status_code", 200) >= 400:
        data = getattr(response, "data", None)
        message = data.get("error") if isinstance(data, dict) else None
        raise ReportError(message or f"The report could not be built (HTTP {response.status_code}).")
    return response


def _scoped(params, org):
    """System admins act on the organization named in ?organization=; for others it is ignored."""
    out = dict(params)
    if org is not None:
        out["organization"] = org.pk
    return out


def _fmt_day(d):
    return f"{d:%b} {d.day}, {d:%Y}"


def _fmt_range(start, end):
    s, e = datetime.date.fromisoformat(start), datetime.date.fromisoformat(end)
    return _fmt_day(s) if s == e else f"{_fmt_day(s)} - {_fmt_day(e)}"


# ------------------------------------------------------------------ one flattener per report
def _table_compliance(user, org, p):
    from .views import CoverageComplianceReportView

    data = _call(
        CoverageComplianceReportView.as_view(), user, org, "/", _scoped({"start": p["start"], "end": p["end"]}, org)
    ).data
    rows = data.get("rows", [])
    if p.get("unit") not in (None, "", "all"):
        rows = [r for r in rows if str(r.get("unit_id")) == str(p["unit"])]
    if p.get("shift"):
        rows = [r for r in rows if r.get("shift_type") == p["shift"]]
    if p.get("status") not in (None, "", "all"):
        rows = [r for r in rows if r.get("status") == p["status"]]
    body = [
        [
            r["date"],
            r.get("unit_name") or "",
            r.get("shift_type_display") or "",
            "HPPD" if r.get("mode") == "hppd" else "Fixed",
            (r.get("census") if r.get("mode") == "hppd" else "") if r.get("census") is not None else "",
            r.get("required", ""),
            r.get("assigned", ""),
            r.get("required_hours", "") if r.get("mode") == "hppd" else "",
            r.get("hours_scheduled", "") if r.get("mode") == "hppd" else "",
            r.get("status", ""),
            "; ".join([*(r.get("shortfalls") or []), r.get("note") or ""]).strip("; "),
            "Yes" if r.get("alert_sent") else "No",
        ]
        for r in rows
    ]
    notes = [
        f"{data.get('understaffed_count', 0)} understaffed, {data.get('at_risk_count', 0)} at risk, "
        f"{data.get('checked_count', 0)} checked."
    ] + list(data.get("warnings") or [])
    return Table_(
        "Coverage compliance",
        ["Date", "Unit", "Shift", "Type", "Census", "Required staff", "Assigned", "Required hrs", "Scheduled hrs", "Status", "Details", "Alert sent"],
        body,
        notes,
        landscape=True,
        widths=[7, 9, 7, 5, 5, 6, 6, 6, 6, 8, 22, 5],
    )


def _table_schedule(user, org, p):
    from .views import StaffShiftViewSet

    resp = _call(
        StaffShiftViewSet.as_view({"get": "list"}),
        user,
        org,
        "/",
        _scoped({"start": p["start"], "end": p["end"], "profession": p.get("profession"), "staff": p.get("staff")}, org),
    )
    rows = resp.data.get("results") if isinstance(resp.data, dict) else resp.data
    rows = sorted(rows or [], key=lambda r: (r["date"], r.get("staff_name") or ""))
    body = [
        [r["date"], r.get("staff_name") or "", r.get("profession") or "", r.get("shift_type_display") or r.get("shift_type") or "",
         r.get("start_time") or "", r.get("end_time") or ""]
        for r in rows
    ]
    return Table_("Schedule", ["Date", "Staff", "Profession", "Shift", "Start", "End"], body, widths=[10, 22, 16, 14, 10, 10])


def _table_unscheduled(user, org, p):
    from .views import UnscheduledStaffReportView

    data = _call(
        UnscheduledStaffReportView.as_view(), user, org, "/",
        _scoped({"start": p["start"], "end": p["end"], "profession": p.get("profession")}, org),
    ).data
    body = [
        [s.get("full_name") or "", s.get("profession_display") or s.get("profession") or "", s.get("email") or "", s.get("phone_number") or ""]
        for s in data.get("staff", [])
    ]
    return Table_("Staff with no schedule", ["Name", "Profession", "Email", "Phone"], body, widths=[22, 16, 28, 16])


def _table_labor(user, org, p):
    from .views import LaborHoursReportView

    data = _call(
        LaborHoursReportView.as_view(), user, org, "/",
        _scoped({"start": p["start"], "end": p["end"], "profession": p.get("profession")}, org),
    ).data
    rows = data.get("rows", [])
    body = [[r["full_name"], r["profession"], r["shift_count"], r["total_hours"]] for r in rows]
    total = round(sum(r["total_hours"] for r in rows), 1)
    notes = [f"{len(rows)} people, {total} scheduled hours in total."]
    return Table_("Labor hours", ["Staff", "Profession", "Shift count", "Total hours"], body, notes, widths=[26, 18, 12, 12])


def _table_distribution(user, org, p):
    from .views import ShiftDistributionReportView

    data = _call(
        ShiftDistributionReportView.as_view(), user, org, "/",
        _scoped({"start": p["start"], "end": p["end"], "profession": p.get("profession")}, org),
    ).data
    body = [
        [r["full_name"], r["profession"], *[r.get(t, 0) for t in SHIFT_ORDER], r["total"]] for r in data.get("rows", [])
    ]
    return Table_(
        "Shift-type distribution",
        ["Staff", "Profession", *[SHIFT_LABELS[t] for t in SHIFT_ORDER], "Total"],
        body,
        widths=[24, 16, 9, 9, 9, 9, 9],
    )


def _table_message_log(user, org, p):
    from .views import MessageDeliveryLogReportView

    data = _call(
        MessageDeliveryLogReportView.as_view(), user, org, "/",
        _scoped({"start": p["start"], "end": p["end"], "staff": p.get("staff")}, org),
    ).data
    body = [
        [r["sent_at"][:16].replace("T", " "), r["channel"], r["category"], r["recipient"], r.get("staff_name") or "", r["subject"], r["status"]]
        for r in data.get("rows", [])
    ]
    notes = ["Only the first 1000 messages are listed."] if data.get("truncated") else []
    return Table_(
        "Message delivery log",
        ["Sent at", "Channel", "Category", "Recipient", "Staff", "Subject", "Status"],
        body,
        notes,
        landscape=True,
        widths=[12, 7, 16, 18, 14, 24, 8],
    )


def _table_master(user, org, p):
    from .master_schedule_views import MasterScheduleView

    data = _call(MasterScheduleView.as_view(), user, org, "/", _scoped({"start": p["start"], "end": p["end"]}, org)).data
    start, end = datetime.date.fromisoformat(p["start"]), datetime.date.fromisoformat(p["end"])
    days = [start + datetime.timedelta(days=i) for i in range((end - start).days + 1)]
    cells = data.get("cells", {})
    body = []
    for section in data.get("sections", []):
        body.append(("section", section["name"]))
        for r in section["rows"]:
            row_cells = cells.get(str(r["id"]), {})
            body.append(
                ["", r.get("staff_name") or "", r.get("hp") or "", r.get("status") or "", *[row_cells.get(d.isoformat(), "") for d in days]]
            )
    columns = ["", "Name", "HP", "Status", *[f"{d.day}" for d in days]]
    legend = data.get("codes")
    notes = []
    if isinstance(legend, dict) and legend:
        notes.append("Codes: " + ", ".join(f"{k} = {v}" for k, v in legend.items()))
    return Table_("Master schedule", columns, body, notes, landscape=True)


BUILDERS = {
    "coverage_compliance": _table_compliance,
    "schedule": _table_schedule,
    "unscheduled": _table_unscheduled,
    "labor_hours": _table_labor,
    "shift_distribution": _table_distribution,
    "message_log": _table_message_log,
    "master_schedule": _table_master,
}


# ------------------------------------------------------------------ renderers
def render_csv(table):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(table.columns)
    for row in table.rows:
        if isinstance(row, tuple):  # master schedule section heading
            writer.writerow([row[1]])
        else:
            writer.writerow(row)
    return buf.getvalue().encode("utf-8-sig")


def _logo_bytes(org):
    try:
        if org is not None and org.logo:
            with org.logo.open("rb") as f:
                return f.read()
    except Exception:
        pass
    return None


def _zone(name):
    try:
        return ZoneInfo(name) if name else timezone.get_current_timezone()
    except Exception:
        return timezone.get_current_timezone()


def _context(user, org, tz):
    now = timezone.now().astimezone(_zone(tz))
    return pdf.PrintContext(
        facility=org.name if org is not None else "",
        printed_by=(user.get_full_name() or user.get_username() or "").strip() or "POWER Staffing",
        printed_at=_stamp(now),
        printed_time=now.strftime("%I:%M %p").lstrip("0"),
        logo=_logo_bytes(org),
    )


def _stamp(now):
    hour = now.hour % 12 or 12
    clock = f"{hour}:{now:%M} {now:%p} {now.tzname() or ''}".strip()
    return f"{now:%A, %b} {now.day}, {now:%Y} at {clock}"


def render_pdf(table, subtitle, ctx):
    esc = pdf.esc
    orient = "landscape" if table.landscape else "portrait"
    width = pdf._content_width(orient)
    story = [Paragraph(esc(table.title), pdf.S_TITLE), Paragraph(esc(subtitle), pdf.S_SUB), Spacer(1, 6)]
    for note in table.notes:
        story.append(Paragraph(esc(note), pdf._style("note", fontSize=9, leading=12, textColor=pdf.MUTED)))
    if table.notes:
        story.append(Spacer(1, 6))

    cell = pdf._style("cell", fontSize=8, leading=10)
    head = pdf._style("head", fontSize=8, leading=10, fontName="Helvetica-Bold", textColor=colors.white)
    section_style = pdf._style("sect", fontSize=8.5, leading=11, fontName="Helvetica-Bold", textColor=pdf.NAVY)

    if not table.rows:
        story.append(Paragraph("No rows for this report and date range.", cell))
        return pdf._build(story, ctx, table.title, orient)

    ncols = len(table.columns)
    if table.widths and len(table.widths) == ncols:
        total = float(sum(table.widths))
        col_w = [width * w / total for w in table.widths]
    else:  # master schedule: name wider, day columns narrow
        fixed = [0.1 * inch, 1.5 * inch, 0.5 * inch, 0.7 * inch]
        rest = max(ncols - 4, 1)
        day_w = max((width - sum(fixed)) / rest, 0.14 * inch)
        col_w = fixed + [day_w] * rest

    data = [[Paragraph(esc(str(c)), head) for c in table.columns]]
    spans, section_rows = [], []
    for row in table.rows:
        if isinstance(row, tuple):
            data.append([Paragraph(esc(row[1]), section_style)] + [""] * (ncols - 1))
            spans.append(("SPAN", (0, len(data) - 1), (-1, len(data) - 1)))
            section_rows.append(len(data) - 1)
        else:
            data.append([Paragraph(esc("" if v is None else str(v)), cell) for v in row])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), pdf.NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, pdf.LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i in section_rows:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#E8EEF7")))
        elif i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F7F9FC")))
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle(style + spans))
    story.append(tbl)
    return pdf._build(story, ctx, table.title, orient)


# ------------------------------------------------------------------ the entry point
def build_report(kind, fmt, user, org, params, tz=None):
    """Return a ReportFile for `kind` ("labor_hours", ...) as `fmt` ("pdf" or "csv")."""
    if kind not in REPORTS:
        raise ReportError(f"Unknown report '{kind}'.")
    label, formats = REPORTS[kind]
    if fmt not in formats:
        raise ReportError(f"{label} cannot be exported as {fmt.upper()}.")
    p = dict(params or {})

    if kind == "daily_forms":
        return _daily_forms_pdf(user, org, p, tz)

    if not p.get("start") or not p.get("end"):
        raise ReportError("A start and end date are required.")
    try:
        datetime.date.fromisoformat(p["start"])
        datetime.date.fromisoformat(p["end"])
    except ValueError:
        raise ReportError("Dates must look like 2026-10-17.")

    table = BUILDERS[kind](user, org, p)
    subtitle = f"{org.name + '  |  ' if org is not None else ''}{_fmt_range(p['start'], p['end'])}"
    stem = f"{kind}_{p['start']}_to_{p['end']}" if p["start"] != p["end"] else f"{kind}_{p['start']}"
    count = sum(1 for r in table.rows if not isinstance(r, tuple))
    summary = (table.notes[0] if table.notes else f"{count} row{'s' if count != 1 else ''}.")
    if fmt == "csv":
        return ReportFile(f"{stem}.csv", "text/csv", render_csv(table), summary)
    return ReportFile(f"{stem}.pdf", "application/pdf", render_pdf(table, subtitle, _context(user, org, tz)), summary)


def _daily_forms_pdf(user, org, p, tz):
    from .daily_reports_views import DailyStaffingReportView

    form = p.get("form") or "assignment"
    if form not in DAILY_FORMS:
        raise ReportError("Choose which daily form to send.")
    date = p.get("date") or p.get("start")
    if not date:
        raise ReportError("A date is required.")
    params = _scoped(
        {"date": date, "shift": p.get("shift") or "day", "unit": p.get("unit") or "all", "tz": tz},
        org,
    )
    response = _call(DailyStaffingReportView.as_view(), user, org, "/", params, kind=form)
    data = response.content
    name = f"{form}_{date}" + ("" if form == "worksheet" else f"_{params['shift']}") + ".pdf"
    return ReportFile(name, "application/pdf", data, f"Daily staffing form for {_fmt_day(datetime.date.fromisoformat(date))}.")


def http_response(report, inline=False):
    response = HttpResponse(report.data, content_type=report.content_type)
    disposition = "inline" if inline else "attachment"
    response["Content-Disposition"] = f'{disposition}; filename="{report.filename}"'
    response["Cache-Control"] = "no-store"
    return response
