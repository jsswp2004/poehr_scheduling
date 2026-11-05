"""
Scheduled email of a saved Reports-module report (custom or linked), as a PDF and/or CSV.

Who may receive patient names: when a report holds patient data and the schedule leaves Hide PHI off, every
recipient must be an active user of the same organization who may run that report themselves. This is checked
when the schedule is saved and again on every send, so a person who loses the right stops receiving names.
With Hide PHI on (the default), names become "Patient N" and note, order and result text becomes "[Hidden]",
and any email address may be added.

Every send for a patient-data report is written to the report audit log, as the schedule's owner.
"""

from django.utils import timezone

from . import custom_reports as engine, report_export
from .models import ReportAuditLog

Table_ = report_export.Table_


def _crv():
    from . import custom_report_views  # imported late: that module imports the staffing views

    return custom_report_views


def source_info(report, user):
    """(source dict, whether it holds patient data) for a saved report, as `user` sees it."""
    crv = _crv()
    src, _cfg = crv._prepare(report.source, report.config, user, report.organization)
    src = src or engine.SOURCES[report.source]
    return src, bool(src["patient_data"])


def owner_problem(report, user):
    """A message when `user` may not run `report`, else ''."""
    crv = _crv()
    if user is None or not user.is_active:
        return "The person who set up this schedule is no longer active."
    if not crv._can_see(user, report):
        return "The schedule's owner can no longer see this report."
    if not crv._source_ok(report.source, user, report):
        return "The schedule's owner no longer has access to this data."
    return ""


def _user_for_email(org, email):
    from users.models import CustomUser

    return (
        CustomUser.objects.filter(organization=org, is_active=True, email__iexact=email).order_by("id").first()
    )


def recipient_ok(report, email):
    """Can this address receive the report with patient names? (An active user who may run it themselves.)"""
    crv = _crv()
    user = _user_for_email(report.organization, email)
    return bool(user and crv._can_see(user, report) and crv._source_ok(report.source, user, report))


def phi_recipient_problems(report, emails):
    """Addresses that may not receive patient names, for a schedule with Hide PHI off. [] when all are fine."""
    return [e for e in emails if not recipient_ok(report, e)]


def needs_phi_check(report, hide_phi, user):
    """True when the schedule shows patient names for a patient-data report."""
    if hide_phi:
        return False
    try:
        return source_info(report, user)[1]
    except engine.ReportConfigError:
        return False


def _cell(value, col):
    if value is None:
        return ""
    if col["type"] == "percent" and isinstance(value, (int, float)):
        return f"{value}%"
    return value


def _widths(columns, rows):
    """Relative column widths from the content, so a report with any number of columns lays out sensibly.
    (Without them the PDF falls back to the master-schedule layout, which squeezes the first columns to nothing.)"""
    out = []
    for i, c in enumerate(columns):
        longest = max([len(str(c["label"])) // 2] + [len(str(r[i])) for r in rows[:200] if i < len(r)])
        out.append(min(max(longest, 6), 32))
    return out


def result_table(report, result, start, end):
    columns = result["columns"]
    keys = [c["key"] for c in columns]
    rows = [[_cell(r.get(k), c) for k, c in zip(keys, columns)] for r in result["rows"]]
    if result.get("totals"):
        rows.append([_cell(result["totals"].get(k), c) for k, c in zip(keys, columns)])
    notes = [f"{t['label']}: {t['value']}" for t in result.get("tiles") or []]
    notes.append(f"{result['row_count']} row{'s' if result['row_count'] != 1 else ''}.")
    if result.get("phi") == "hidden":
        notes.append("Patient names and free text are hidden.")
    elif result.get("phi") == "shown":
        notes.append("This report contains patient information. Handle it as you would the chart.")
    if result.get("truncated"):
        notes.append("Only the first rows are shown. Narrow the date range for the rest.")
    return Table_(report.name, [c["label"] for c in columns], rows, notes, landscape=len(columns) > 6, widths=_widths(columns, rows))


def build_files(sub, start, end, user):
    """[ReportFile...] for a subscription on a saved report, built as `user` (the schedule's owner)."""
    crv = _crv()
    report = sub.custom_report
    problem = owner_problem(report, user)
    if problem:
        raise report_export.ReportError(problem)
    src, cfg = crv._prepare(report.source, report.config, user, sub.organization, bool(sub.hide_phi))
    dated = report.source == "linked" or engine.get_source(report.source)["dated"]
    result = engine.run_report(
        report.source, sub.organization, cfg, start if dated else None, end if dated else None,
        None, user=user, hide_phi=bool(sub.hide_phi), src=src,
    )
    if (src or engine.SOURCES[report.source])["patient_data"]:
        ReportAuditLog.objects.create(
            organization=sub.organization, user=user, report=report, report_name=report.name[:120],
            source=report.source, action="run", phi_hidden=result.get("phi") == "hidden",
            row_count=result.get("row_count", 0), range_start=start if dated else None, range_end=end if dated else None,
        )
    table = result_table(report, result, start, end)
    if dated:
        subtitle = f"{sub.organization.name}  |  {report_export._fmt_range(start.isoformat(), end.isoformat())}"
        stem = f"{report.name.strip().replace(' ', '_')[:60]}_{start}_to_{end}" if start != end else f"{report.name.strip().replace(' ', '_')[:60]}_{start}"
    else:
        subtitle = f"{sub.organization.name}  |  Current snapshot"
        stem = f"{report.name.strip().replace(' ', '_')[:60]}_{timezone.localdate()}"
    stem = "".join(ch for ch in stem if ch.isalnum() or ch in "_-.")
    summary = table.notes[-1] if table.notes else ""
    files = []
    for fmt in sub.formats or []:
        if fmt == "csv":
            files.append(report_export.ReportFile(f"{stem}.csv", "text/csv", report_export.render_csv(table), summary))
        elif fmt == "pdf":
            ctx = report_export._context(user, sub.organization, sub.timezone)
            files.append(
                report_export.ReportFile(f"{stem}.pdf", "application/pdf", report_export.render_pdf(table, subtitle, ctx), summary)
            )
    return files
