"""
PDF renderers for the daily staffing reports (reportlab). Four reports, laid out
like the facility's paper forms but cleaner:

    assignment   Daily Staffing Assignment Sheet (one page per unit)
    shift_sheet  Daily Staffing Sheet for one shift
    hours        Current Staffing Hours for one shift
    worksheet    Nursing Staffing Worksheet (all three shifts, plus the hours summary)

Every page has the organization's logo as its header and a footer with who printed
it, when, and "Page n of N".
"""

from dataclasses import dataclass
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .daily_report_data import (
    BUCKETS,
    DIRECT_LINES,
    SHIFT_FORM_TIMES,
    SHIFT_HOURS_LABEL,
    SHIFT_NAMES,
    SHIFTS,
    fmt_hours,
    level_label,
    stats,
)

NAVY = colors.HexColor("#1F3B63")
ACCENT = colors.HexColor("#2E86B8")
MUTED = colors.HexColor("#5B6B7B")
LINE = colors.HexColor("#B8C2CC")
BAND = colors.HexColor("#EEF3F8")
INK = colors.HexColor("#1B2530")
GOOD = colors.HexColor("#1E7A46")
BAD = colors.HexColor("#B3261E")


@dataclass
class PrintContext:
    facility: str
    printed_by: str
    printed_at: str  # already formatted in the reader's time zone, e.g. "Saturday, Oct 17, 2026 at 11:24 PM EDT"
    printed_time: str = ""  # just the time of day, e.g. "11:24 PM EDT"
    logo: bytes | None = None


def _style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=12, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


S_TITLE = _style("title", fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=NAVY)
S_SUB = _style("sub", fontSize=9, textColor=MUTED, leading=11)
S_LABEL = _style("label", fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=MUTED)
S_VALUE = _style("value", fontName="Helvetica-Bold", fontSize=10.5, leading=13)
S_CELL = _style("cell", fontSize=9.5, leading=12)
S_SMALL = _style("small", fontSize=8, leading=10, textColor=MUTED)
S_HEAD = _style("head", fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=colors.white)
S_HEADC = _style("headc", fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=colors.white, alignment=TA_CENTER)
S_CENTER = _style("center", alignment=TA_CENTER)
S_BLOCK = _style("block", fontName="Helvetica-Bold", fontSize=11, leading=13, textColor=NAVY)
S_BLOCKR = _style("blockr", fontSize=8, leading=10, textColor=MUTED, alignment=TA_RIGHT)
S_LINE_LABEL = _style("linelabel", fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=NAVY)
S_LINE_VALUE = _style("linevalue", fontSize=9.5, leading=11)
S_WS = _style("ws", fontSize=8.5, leading=10.5)
S_NOTE = _style("note", fontSize=8, leading=10, textColor=MUTED)


def esc(text):
    return escape(text or "")


def _person(p, role=False):
    text = esc(p.name)
    if role and p.line in ("RN", "LPN"):
        text += f' <font size="7.5" color="#5B6B7B">{p.line}</font>'
    if p.time_label:
        text += f' <font size="7.5" color="#5B6B7B">({p.time_label})</font>'
    return text


def _people_text(people, role=False):
    return ", ".join(_person(p, role) for p in people)


# ---------------------------------------------------------------- page frame
def _draw_header(c, ctx, page_w, page_h, margin):
    c.saveState()
    top = page_h - 0.35 * inch
    drawn = False
    if ctx.logo:
        try:
            reader = ImageReader(BytesIO(ctx.logo))
            iw, ih = reader.getSize()
            h = 0.62 * inch
            w = h * iw / ih
            if w > 3.0 * inch:
                w, h = 3.0 * inch, 3.0 * inch * ih / iw
            c.drawImage(reader, margin, top - h, width=w, height=h, mask="auto")
            bottom = top - h
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(margin, top - 0.28 * inch, ctx.facility)
        bottom = top - 0.4 * inch
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.4)
    c.line(margin, bottom - 0.12 * inch, page_w - margin, bottom - 0.12 * inch)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(margin, bottom - 0.16 * inch, page_w - margin, bottom - 0.16 * inch)
    c.restoreState()


def _numbered_canvas(ctx, page_w, margin):
    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            super().save()

        def _footer(self, total):
            self.saveState()
            self.setStrokeColor(LINE)
            self.setLineWidth(0.5)
            self.line(margin, 0.62 * inch, page_w - margin, 0.62 * inch)
            self.setFillColor(MUTED)
            self.setFont("Helvetica", 8)
            self.drawString(margin, 0.45 * inch, f"Printed by {ctx.printed_by}  |  {ctx.printed_at}")
            self.drawRightString(page_w - margin, 0.45 * inch, f"Page {self._pageNumber} of {total}")
            self.restoreState()

    return NumberedCanvas


def _build(story, ctx, title, orient="portrait"):
    pagesize = landscape(letter) if orient == "landscape" else letter
    page_w, page_h = pagesize
    margin = 0.6 * inch
    top, bottom = 1.3 * inch, 0.8 * inch
    frame = Frame(margin, bottom, page_w - 2 * margin, page_h - top - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    buf = BytesIO()
    doc = BaseDocTemplate(
        buf,
        pagesize=pagesize,
        title=title,
        author=ctx.printed_by,
        pageTemplates=[PageTemplate(id="page", frames=[frame], onPage=lambda c, d: _draw_header(c, ctx, page_w, page_h, margin))],
    )
    doc.build(story, canvasmaker=_numbered_canvas(ctx, page_w, margin))
    return buf.getvalue()


def _content_width(orient="portrait"):
    return (landscape(letter)[0] if orient == "landscape" else letter[0]) - 1.2 * inch


def _title_block(title, ctx, subtitle=None):
    return [Paragraph(esc(title), S_TITLE), Paragraph(esc(subtitle or ctx.facility), S_SUB), Spacer(1, 8)]


def _info_grid(rows, width):
    """rows: lists of (label, value-html) pairs, one or two per row."""
    lw = 1.4 * inch
    data, spans = [], []
    for r, pairs in enumerate(rows):
        if len(pairs) == 1:
            data.append([Paragraph(esc(pairs[0][0]), S_LABEL), Paragraph(pairs[0][1] or "&nbsp;", S_VALUE), "", ""])
            spans.append(("SPAN", (1, r), (3, r)))
        else:
            (l1, v1), (l2, v2) = pairs
            data.append([Paragraph(esc(l1), S_LABEL), Paragraph(v1 or "&nbsp;", S_VALUE), Paragraph(esc(l2), S_LABEL), Paragraph(v2 or "&nbsp;", S_VALUE)])
            spans.append(("BACKGROUND", (2, r), (2, r), BAND))
    half = (width - 2 * lw) / 2
    t = Table(data, colWidths=[lw, half, lw, half], rowHeights=[26] * len(rows))
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.6, LINE),
                ("BACKGROUND", (0, 0), (0, -1), BAND),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
            + spans
        )
    )
    return t


def _fmt_date(d):
    return d.strftime("%A, %B ") + str(d.day) + d.strftime(", %Y")


def _beds(unit):
    if unit.census is None:
        return "&mdash;"
    return f"{unit.census}" + (f" / {unit.beds}" if unit.beds else "")


def _on_unit(people, unit_id):
    return [p for p in people if p.unit_id == unit_id]


def _unassigned(people):
    return [p for p in people if p.unit_id is None and p.line in DIRECT_LINES]


# ---------------------------------------------------------- 1. assignment sheet
def _roster_table(headers, rows, widths, min_rows, row_h=24):
    data = [[Paragraph(esc(h), S_HEAD if i == 0 else S_HEADC) for i, h in enumerate(headers)]]
    for row in rows:
        data.append(row)
    while len(data) - 1 < min_rows:
        data.append([""] * len(headers))
    t = Table(data, colWidths=widths, rowHeights=[20] + [row_h] * (len(data) - 1), repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(2, len(data), 2):
        style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F8FAFC")))
    t.setStyle(TableStyle(style))
    return t


def _assignment_page(ctx, day, shift, unit):
    width = _content_width()
    everyone = day.people.get(shift, [])
    people = _unassigned(everyone) + [p for p in everyone if p.unit_id is None and p.line == "UM"] if unit is None else _on_unit(everyone, unit.id)
    unit_name = "Not assigned to a unit" if unit is None else unit.name
    nurses = [p for p in people if p.line in ("RN", "LPN", "NURSE")]
    aides = [p for p in people if p.line == "CMA"]
    cgas = [p for p in people if p.line == "CGA"]
    managers = [p for p in people if p.line == "UM"]
    rns = [p for p in people if p.is_rn]
    staff_n = sum(1 for p in people if p.bucket)
    hours = sum(p.hours for p in people if p.bucket)
    if unit is not None and unit.census:
        ratio = f"{staff_n} staff to {unit.census} residents (1 : {unit.census / staff_n:.1f})" if staff_n else f"0 staff to {unit.census} residents"
    elif unit is not None:
        ratio = f"{staff_n} staff to &mdash; residents"
    else:
        ratio = f"{staff_n} staff"

    story = _title_block("DAILY STAFFING ASSIGNMENT SHEET", ctx)
    census_cell = _beds(unit) if unit is not None else "&mdash;"
    story.append(
        _info_grid(
            [
                [("DATE", esc(_fmt_date(day.date))), ("SHIFT", esc(f"{SHIFT_NAMES[shift]}  ({SHIFT_FORM_TIMES[shift]})"))],
                [("UNIT", esc(unit_name)), ("CENSUS", census_cell)],
                [("TOTAL STAFFING RATIO", ratio)],
                [("REGISTERED NURSE", _people_text(rns))],
                [("UNIT MANAGER", _people_text(managers))],
            ],
            width,
        )
    )
    story.append(Spacer(1, 12))

    def name_cell(p, role=False):
        return Paragraph(_person(p, role), S_CELL)

    def hrs(p):
        return Paragraph(fmt_hours(p.hours), S_CENTER)

    w1 = [2.3 * inch, 0.9 * inch, 2.1 * inch, 0.9 * inch]
    w1.append(width - sum(w1))
    story.append(_roster_table(["CHARGE NURSE", "Licensure", "Room Assignment", "Ratio", "Hours"], [[name_cell(p), Paragraph(p.bucket or "&mdash;", S_CENTER), "", "", hrs(p)] for p in nurses], w1, 3))
    story.append(Spacer(1, 12))
    w2 = [2.9 * inch, 2.4 * inch, 0.9 * inch]
    w2.append(width - sum(w2))
    story.append(_roster_table(["MEDICINE AIDE  (GNA / CMA)", "Room Assignment", "Ratio", "Hours"], [[name_cell(p), "", "", hrs(p)] for p in aides], w2, 1))
    story.append(Spacer(1, 12))
    story.append(_roster_table(["NURSING ASSISTANTS  (GNA)", "Room Assignment", "Ratio", "Hours"], [[name_cell(p), "", "", hrs(p)] for p in cgas], w2, 5))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"Direct-care hours on this unit this shift: <b>{fmt_hours(hours)}</b>. Room assignment and ratio are filled in by hand. *Retain for 12 months.", S_NOTE))
    return story


def render_assignment(ctx, day, shift, unit_id=None):
    if unit_id is not None:
        units = [u for u in day.units if u.id == unit_id]
        pages = units
    else:
        pages = list(day.units)
        if _unassigned(day.people.get(shift, [])):
            pages.append(None)
    story = []
    for i, unit in enumerate(pages):
        if i:
            story.append(PageBreak())
        story += _assignment_page(ctx, day, shift, unit)
    if not story:
        story = _title_block("DAILY STAFFING ASSIGNMENT SHEET", ctx) + [Paragraph("No units are set up for this organization yet.", S_CELL)]
    return _build(story, ctx, "Daily Staffing Assignment Sheet")


# ----------------------------------------------------------- 2. shift sheet
_NURSE_LINES = ("RN", "LPN", "NURSE")
SLOTS = {
    "day": {"LEVEL 1A": dict(UM=0, N=1, CMA=1, CGA=2), "LEVEL II": dict(N=2, CGA=3), "LEVEL III": dict(UM=1, N=1, CGA=3), "LEVEL IV": dict(N=2, CGA=4)},
    "evening": {"LEVEL 1A": dict(N=1, CMA=1, CGA=2), "LEVEL II": dict(N=1, CMA=1, CGA=3), "LEVEL III": dict(N=1, CGA=3), "LEVEL IV": dict(N=1, CMA=1, CGA=3)},
    "night": {lv: dict(N=1, CGA=2) for lv in ("LEVEL 1A", "LEVEL II", "LEVEL III", "LEVEL IV")},
}
DEFAULT_SLOTS = dict(N=1, CGA=2)
_LINE_LABELS = [("UM", "UM"), ("N", "RN/LPN"), ("CMA", "CMA"), ("CGA", "CGA")]


def _level_block(title, caption, people, slots, width):
    groups = {
        "UM": [p for p in people if p.line == "UM"],
        "N": [p for p in people if p.line in _NURSE_LINES],
        "CMA": [p for p in people if p.line == "CMA"],
        "CGA": [p for p in people if p.line == "CGA"],
    }
    rows = []
    for key, label in _LINE_LABELS:
        actual = groups[key]
        for i in range(max(slots.get(key, 0), len(actual))):
            value = _person(actual[i], role=True) if i < len(actual) else ""
            rows.append([Paragraph(label, S_LINE_LABEL), Paragraph(value or "&nbsp;", S_LINE_VALUE)])
    head = Table([[Paragraph(esc(title), S_BLOCK), Paragraph(esc(caption), S_BLOCKR)]], colWidths=[width * 0.4, width * 0.6])
    head.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.2, ACCENT), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    if not rows:
        rows = [[Paragraph("&nbsp;", S_LINE_LABEL), Paragraph("No staff scheduled", S_SMALL)]]
    body = Table(rows, colWidths=[0.7 * inch, width - 0.7 * inch], rowHeights=[17] * len(rows))
    body.setStyle(TableStyle([("LINEBELOW", (1, 0), (1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    outer = Table([[head], [body]], colWidths=[width])
    outer.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return outer


def _line_list(label, people, width, role=False, slots=1):
    rows = []
    for i in range(max(slots, len(people), 1)):
        value = _person(people[i], role) if i < len(people) else ""
        rows.append([Paragraph(label if i == 0 else "", S_LINE_LABEL), Paragraph(value or "&nbsp;", S_LINE_VALUE)])
    t = Table(rows, colWidths=[0.95 * inch, width - 0.95 * inch], rowHeights=[17] * len(rows))
    t.setStyle(TableStyle([("LINEBELOW", (1, 0), (1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return t


def render_shift_sheet(ctx, day, shift):
    width = _content_width()
    people = day.people.get(shift, [])
    story = _title_block("DAILY STAFFING SHEET", ctx, f"{SHIFT_NAMES[shift]}  |  {SHIFT_FORM_TIMES[shift]}")
    sup = [p for p in people if p.line == "SUPERVISOR"]
    adon = [p for p in people if p.line == "ADON"]
    rns = [p for p in people if p.is_rn]
    rows = [[("DATE", esc(_fmt_date(day.date)))], [("SUPERVISOR", _people_text(sup))]]
    if shift == "day":
        rows.append([("ADON", _people_text(adon))])
    rows.append([("RN ON DUTY", _people_text(rns))])
    story.append(_info_grid(rows, width))
    story.append(Spacer(1, 10))

    gap = 0.35 * inch
    colw = (width - gap) / 2
    blocks = []
    for u in day.units:
        caption = f"{u.name}   |   Census {_beds(u).replace('&mdash;', '-')}"
        slots = SLOTS[shift].get(u.level, DEFAULT_SLOTS)
        blocks.append(_level_block(u.level, caption, _on_unit(people, u.id), slots, colw))
    floating = _unassigned(people) + [p for p in people if p.unit_id is None and p.line == "UM"]
    if floating:
        blocks.append(_level_block("UNASSIGNED", "no unit chosen on the schedule", floating, {}, colw))
    if blocks:
        pairs = []
        for i in range(0, len(blocks), 2):
            pairs.append(blocks[i : i + 2] + ([""] if len(blocks[i : i + 2]) == 1 else []))
        grid = Table(pairs, colWidths=[colw, colw], hAlign="LEFT")
        grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), gap / 2), ("LEFTPADDING", (1, 0), (1, -1), gap / 2), ("RIGHTPADDING", (1, 0), (1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        story.append(grid)
    else:
        story.append(Paragraph("No units are set up for this organization yet.", S_CELL))

    support_left, support_right = [], []
    if shift == "day":
        support_left = [_line_list("MDS", [p for p in people if p.line == "MDS"], colw), Spacer(1, 6), _line_list("SKIN", [p for p in people if p.line == "SKIN"], colw)]
        clerks = [p for p in people if p.line == "CLERK"]
        support_right = [Paragraph("UNIT CLERKS", S_BLOCK), Spacer(1, 2)]
        for u in day.units:
            support_right.append(_line_list(u.name.replace("Unit ", ""), _on_unit(clerks, u.id), colw))
        loose = [p for p in clerks if p.unit_id is None]
        if loose:
            support_right.append(_line_list("Other", loose, colw))
    elif shift == "evening":
        rcas = [p for p in people if p.line == "RCA"]
        support_right = [Paragraph("RCA", S_BLOCK), Spacer(1, 2)]
        for u in day.units:
            support_right.append(_line_list(u.name.replace("Unit ", ""), _on_unit(rcas, u.id), colw))
        loose = [p for p in rcas if p.unit_id is None]
        if loose:
            support_right.append(_line_list("Other", loose, colw))
    if support_left or support_right:
        sup_t = Table([[support_left, support_right]], colWidths=[colw + gap / 2, colw + gap / 2], hAlign="LEFT")
        sup_t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), gap / 2), ("LEFTPADDING", (1, 0), (1, -1), gap / 2), ("RIGHTPADDING", (1, 0), (1, -1), 0)]))
        story += [Spacer(1, 6), sup_t]
    others = [p for p in people if p.line in ("STAFFING", "OTHER") or (p.line == "CLERK" and shift not in ("day",)) or (p.line in ("MDS", "SKIN") and shift != "day") or (p.line == "RCA" and shift != "evening")]
    if others:
        story += [Spacer(1, 8), _line_list("OTHER STAFF", others, width, slots=1)]
    story += [Spacer(1, 10), Paragraph("Staff listed with a time in brackets work only part of this shift. People with no unit on the schedule are shown under Not assigned to a unit.", S_NOTE)]
    return _build(story, ctx, f"Daily Staffing Sheet - {SHIFT_NAMES[shift]}")


# --------------------------------------------------------------- 3. hours
def _row_counts(people):
    out, n, hrs = stats(people)
    cells = []
    for b in BUCKETS:
        cells += [str(out[b][0]), fmt_hours(out[b][1])]
    return cells + [str(n), fmt_hours(hrs)], hrs


def render_hours(ctx, day, shift):
    orient = "landscape"
    width = _content_width(orient)
    people = day.people.get(shift, [])
    story = _title_block("CURRENT STAFFING HOURS", ctx)
    census = day.total_census
    story.append(
        _info_grid(
            [
                [("DATE", esc(_fmt_date(day.date))), ("SHIFT", esc(f"{SHIFT_NAMES[shift]}  ({SHIFT_HOURS_LABEL[shift]})"))],
                [("TIME", esc(ctx.printed_time)), ("CENSUS", str(census) if census is not None else "&mdash;")],
            ],
            width,
        )
    )
    story.append(Spacer(1, 14))
    head = ["UNIT", "CENSUS", "RN", "RN HRS", "LPN", "LPN HRS", "CMA", "CMA HRS", "CGA", "CGA HRS", "TOTAL STAFF", "TOTAL HOURS"]
    data = [[Paragraph(h, S_HEAD if i == 0 else S_HEADC) for i, h in enumerate(head)]]
    for u in day.units:
        cells, _ = _row_counts(_on_unit(people, u.id))
        data.append([Paragraph(esc(u.name), S_CELL), Paragraph(_beds(u), S_CENTER)] + [Paragraph(c, S_CENTER) for c in cells])
    loose = [p for p in people if p.unit_id is None and p.bucket]
    if loose:
        cells, _ = _row_counts(loose)
        data.append([Paragraph("Not assigned to a unit", S_CELL), Paragraph("&mdash;", S_CENTER)] + [Paragraph(c, S_CENTER) for c in cells])
    cells, total_hours = _row_counts(people)
    bold = _style("boldc", fontName="Helvetica-Bold", alignment=TA_CENTER)
    boldl = _style("boldl", fontName="Helvetica-Bold")
    data.append([Paragraph("ALL UNITS", boldl), Paragraph(str(census) if census is not None else "&mdash;", bold)] + [Paragraph(c, bold) for c in cells])
    first, rest = 1.9 * inch, 0.78 * inch
    widths = [first, 0.8 * inch] + [0.62 * inch] * 8 + [rest, rest]
    widths[-1] = width - sum(widths[:-1])
    t = Table(data, colWidths=widths, rowHeights=[30] + [26] * (len(data) - 1), repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("GRID", (0, 0), (-1, -1), 0.6, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, -1), 6),
                ("BACKGROUND", (0, -1), (-1, -1), BAND),
                ("LINEABOVE", (0, -1), (-1, -1), 1.2, NAVY),
                ("BACKGROUND", (-2, 1), (-1, -2), colors.HexColor("#F8FAFC")),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 10))
    ppd = f" Direct-care hours per resident this shift: <b>{total_hours / census:.2f}</b>." if census else ""
    story.append(
        Paragraph(
            "Counts are people on the schedule; hours are the part of each person's shift that falls inside this shift window, so a 12-hour shift is split across the shifts it covers. "
            "Only RN, LPN, CMA and CGA/GNA are counted." + ppd + "  *Retain for 18 months.",
            S_NOTE,
        )
    )
    return _build(story, ctx, f"Current Staffing Hours - {SHIFT_NAMES[shift]}", orient)


# ------------------------------------------------------------ 4. worksheet
def _ws_lines(people):
    lines = []
    for label, keys in (("UM", ("UM",)), ("Clerk", ("CLERK",)), ("RN/LPN", _NURSE_LINES), ("CMA", ("CMA",)), ("GNA", ("CGA",))):
        for p in people:
            if p.line in keys:
                role = f" <font size='7' color='#5B6B7B'>{p.line}</font>" if p.line in ("RN", "LPN") else ""
                lines.append(f"<b>{label}</b>&nbsp; {esc(p.name)}{role}" + (f" <font size='7' color='#5B6B7B'>({p.time_label})</font>" if p.time_label else ""))
    return "<br/>".join(lines) if lines else '<font color="#8895A3">&mdash;</font>'


def render_worksheet(ctx, day):
    width = _content_width()
    col = width / 3
    everyone = {s: day.people.get(s, []) for s in SHIFTS}
    story = _title_block("NURSING STAFFING WORKSHEET", ctx)
    top = Table(
        [
            [
                Paragraph("<b>DAY SUP:</b>  " + _people_text([p for p in everyone["day"] if p.line == "SUPERVISOR"]), S_WS),
                Paragraph("<b>EVE SUP:</b>  " + _people_text([p for p in everyone["evening"] if p.line == "SUPERVISOR"]), S_WS),
                Paragraph("<b>NOC SUP:</b>  " + _people_text([p for p in everyone["night"] if p.line == "SUPERVISOR"]), S_WS),
            ],
            [Paragraph(f"<b>RN:</b>  " + _people_text([p for p in everyone[s] if p.is_rn]), S_WS) for s in SHIFTS],
            [Paragraph("<b>ADON:</b>  " + _people_text([p for p in everyone["day"] if p.line == "ADON"]), S_WS), "", ""],
        ],
        colWidths=[col] * 3,
    )
    top.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("BACKGROUND", (0, 0), (-1, -1), BAND), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [
        _info_grid([[("DATE", esc(_fmt_date(day.date)))]], width),
        Spacer(1, 6),
        top,
        Spacer(1, 8),
    ]
    for u in day.units:
        banner = [Paragraph(esc(u.name.upper()), _style("ban", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white, alignment=TA_CENTER)), "", ""]
        heads = [Paragraph(h, S_LABEL) for h in ("DAYS", "EVENINGS", "NIGHTS")]
        body = [Paragraph(_ws_lines(_on_unit(everyone[s], u.id)), S_WS) for s in SHIFTS]
        cen = [Paragraph(f"CENSUS <b>{u.census if u.census is not None else '-'}</b>" + (f" / {u.beds}" if u.beds else ""), S_CENTER) for _ in SHIFTS]
        t = Table([banner, heads, body, cen], colWidths=[col] * 3)
        t.setStyle(
            TableStyle(
                [
                    ("SPAN", (0, 0), (-1, 0)),
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("GRID", (0, 1), (-1, -1), 0.6, LINE),
                    ("BACKGROUND", (0, 1), (-1, 1), BAND),
                    ("BACKGROUND", (0, -1), (-1, -1), BAND),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story += [KeepTogether([t]), Spacer(1, 6)]
    loose_lines = [Paragraph(_ws_lines([p for p in everyone[s] if p.unit_id is None and (p.line in DIRECT_LINES or p.line == "UM")]), S_WS) for s in SHIFTS]
    if any(_unassigned(everyone[s]) for s in SHIFTS):
        t = Table([[Paragraph("NOT ASSIGNED TO A UNIT", _style("ban2", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.white, alignment=TA_CENTER)), "", ""], loose_lines], colWidths=[col] * 3)
        t.setStyle(TableStyle([("SPAN", (0, 0), (-1, 0)), ("BACKGROUND", (0, 0), (-1, 0), MUTED), ("GRID", (0, 1), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story += [KeepTogether([t]), Spacer(1, 6)]

    # notes + sign-off
    notes = Table([[Paragraph(h, S_HEADC) for h in ("DAYS", "EVE", "NIGHTS")], ["", "", ""]], colWidths=[col] * 3, rowHeights=[18, 52])
    notes.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), 0.6, LINE)]))
    allp = [p for s in SHIFTS for p in everyone[s]]
    wound = [p for p in everyone["day"] if p.line == "SKIN"]
    mds = [p for p in everyone["day"] if p.line == "MDS"]
    total_census = day.total_census
    left = [Paragraph(f"<b>WOUND / SKIN:</b>  {_people_text(wound)}", S_WS), Spacer(1, 4), Paragraph(f"<b>MDS:</b>  {_people_text(mds)}", S_WS)]
    right = [Paragraph("<b>UM ON CALL:</b> ______________________", S_WS), Spacer(1, 4), Paragraph("<b>RN ON CALL:</b> ______________________", S_WS)]
    foot = Table([[left, right]], colWidths=[width * 0.5, width * 0.5])
    foot.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("GRID", (0, 0), (-1, -1), 0.6, LINE), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    if total_census:
        hrs_needed = total_census * 3.0
        calc = f"<b>Total census:</b> {total_census} &times; 3.0 = {fmt_hours(hrs_needed)} hours &divide; 8 = <b>{hrs_needed / 8:.1f} staff</b> (minimum number of staff needed in 24 hours)"
        scheduled = sum(1 for p in allp if p.bucket)
        calc += f"<br/>Direct-care staff scheduled in the 24 hours: <b>{scheduled}</b>"
    else:
        calc = "<b>Total census:</b> no census entered for this date."
    story += [KeepTogether([notes, Spacer(1, 6), foot, Spacer(1, 6), Paragraph(calc, S_WS)]), Spacer(1, 12)]

    # hours summary
    per = {s: stats(everyone[s]) for s in SHIFTS}
    head = ["HOURS", "DAYS", "EVE", "NIGHTS", "24-HR TOTAL"]
    data = [[Paragraph(h, S_HEAD if i == 0 else S_HEADC) for i, h in enumerate(head)]]
    for b, label in zip(BUCKETS, ("RN", "LPN", "CMA", "GNA")):
        vals = [per[s][0][b][1] for s in SHIFTS]
        data.append([Paragraph(label, S_CELL)] + [Paragraph(fmt_hours(v), S_CENTER) for v in vals] + [Paragraph(fmt_hours(sum(vals)), S_CENTER)])
    tot = [per[s][2] for s in SHIFTS]
    boldc = _style("bc2", fontName="Helvetica-Bold", alignment=TA_CENTER)
    data.append([Paragraph("<b>Total</b>", S_CELL)] + [Paragraph(fmt_hours(v), boldc) for v in tot] + [Paragraph(fmt_hours(sum(tot)), boldc)])
    data.append([Paragraph("Census", S_CELL)] + [Paragraph(str(total_census) if total_census is not None else "-", S_CENTER)] * 4)
    ppd = [f"{v / total_census:.2f}" if total_census else "-" for v in tot + [sum(tot)]]
    data.append([Paragraph("<b>PPD</b>", S_CELL)] + [Paragraph(v, boldc) for v in ppd])
    rn247 = [per[s][0]["RN"][1] > 0 or any(p.is_rn for p in everyone[s]) for s in SHIFTS]
    mark = lambda ok: Paragraph(f'<font color="{"#1E7A46" if ok else "#B3261E"}"><b>{"Yes" if ok else "No"}</b></font>', S_CENTER)
    data.append([Paragraph("RN 24/7", S_CELL)] + [mark(v) for v in rn247] + [mark(all(rn247))])
    t = Table(data, colWidths=[width * 0.28] + [width * 0.18] * 4, rowHeights=[22] + [22] * (len(data) - 1))
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("GRID", (0, 0), (-1, -1), 0.6, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, -1), 6),
                ("BACKGROUND", (0, 5), (-1, 5), BAND),
                ("BACKGROUND", (0, 7), (-1, 7), BAND),
            ]
        )
    )
    story.append(
        KeepTogether(
            [
                Paragraph("SHIFT HOURS SUMMARY", S_BLOCK),
                Spacer(1, 4),
                t,
                Spacer(1, 6),
                Paragraph("Hours are the part of each person's shift inside the shift window (a 12-hour shift is split across the shifts it covers); RN, LPN, CMA and GNA only. PPD = hours per resident day. RN 24/7 is Yes when an RN is on the schedule in every shift.", S_NOTE),
            ]
        )
    )
    return _build(story, ctx, "Nursing Staffing Worksheet")
