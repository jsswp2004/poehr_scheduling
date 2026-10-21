"""
Shared helpers for the CSV upload endpoints' dry-run ("check before importing") mode.

A dry run executes the real import logic inside a database transaction and rolls it
back at the end, so what the check reports is exactly what an import would do, and
nothing is saved. Send ``dry_run=true`` with the multipart upload.
"""

import re

from django.db import transaction

MAX_ROWS = 1000
_ROW_PREFIX = re.compile(r"^Row (\d+):\s*")


def is_dry_run(request):
    return request.data.get("dry_run") in (True, "true", "True", "1", 1)


def run_rolled_back(run, request):
    """Call run(request, True) and undo every database change it made."""
    with transaction.atomic():
        response = run(request, True)
        transaction.set_rollback(True)
    return response


def build_row_report(report, errors):
    """
    Per-row results for the upload screen.

    ``report`` maps a file line number to what was recorded for a row that was read
    (name, action, ...; an optional ``notes`` list of warnings). ``errors`` is the
    endpoint's list of "Row N: ..." messages. A row with no report entry was skipped.
    """
    notes = {}
    for message in errors:
        m = _ROW_PREFIX.match(message)
        if m:
            notes.setdefault(int(m.group(1)), []).append(message[m.end():])
    rows = []
    for line in sorted(set(report) | set(notes)):
        info = dict(report.get(line, {}))
        messages = list(info.pop("notes", [])) + notes.get(line, [])
        if not report.get(line):
            state = "skipped"
        elif messages:
            state = "attention"
        else:
            state = "ready"
        rows.append({**info, "row": line, "messages": messages, "state": state})
    return rows[:MAX_ROWS]
