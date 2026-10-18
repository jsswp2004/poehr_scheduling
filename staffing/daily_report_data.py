"""
Plain-Python data layer for the daily staffing reports (no Django imports, so it
is easy to test). The view feeds it shift records; it works out who was on which
shift, on which unit, in which report line, and how many hours fall inside the
shift window.

Shift windows (the report date's own day): Days 07:00-15:00, Evenings 15:00-23:00,
Nights 23:00-07:00 (the next morning). A person's hours on a report are the hours of
their calendar shift that overlap that window, so a 7A (7am-7pm) person counts 8 hours
on Days and 4 on Evenings, and a 7P (7pm-7am) person counts 4 on Evenings and 8 on
Nights.
"""

import datetime as dt
import re
from dataclasses import dataclass, field

SHIFTS = ("day", "evening", "night")
SHIFT_WINDOWS = {"day": (7, 15), "evening": (15, 23), "night": (23, 31)}  # hours after midnight of the date
SHIFT_NAMES = {"day": "Days", "evening": "Evenings", "night": "Nights"}
SHIFT_FORM_TIMES = {
    "day": "7:00 A.M. - 3:30 P.M.",
    "evening": "3:00 P.M. - 11:30 P.M.",
    "night": "11:00 P.M. - 7:30 A.M.",
}
SHIFT_HOURS_LABEL = {"day": "7 AM - 3 PM", "evening": "3 PM - 11 PM", "night": "11 PM - 7 AM"}

# Order people appear in on a report line list.
LINE_ORDER = ["SUPERVISOR", "ADON", "UM", "RN", "LPN", "NURSE", "CMA", "CGA", "CLERK", "MDS", "SKIN", "RCA", "STAFFING", "OTHER"]
DIRECT_LINES = {"RN", "LPN", "NURSE", "CMA", "CGA"}  # people who work a unit's floor
BUCKETS = ("RN", "LPN", "CMA", "CGA")  # what the hours tables count

_SPECIAL = [
    ("ADON", re.compile(r"\badon\b|assistant director", re.I)),
    ("UM", re.compile(r"unit manager|\bum\b", re.I)),
    ("SUPERVISOR", re.compile(r"supervisor", re.I)),
    ("MDS", re.compile(r"\bmds\b", re.I)),
    ("CLERK", re.compile(r"clerk", re.I)),
    ("STAFFING", re.compile(r"staffing coordinator|scheduler", re.I)),
    ("SKIN", re.compile(r"wound|skin", re.I)),
    ("RCA", re.compile(r"\brca\b|restorative", re.I)),
]

# Headings the paper forms use for St. Mary's units.
_LEVELS = {"1a/1b": "LEVEL 1A", "1a": "LEVEL 1A", "1": "LEVEL 1A", "2": "LEVEL II", "3": "LEVEL III", "4": "LEVEL IV"}


def unit_key(name):
    key = re.sub(r"\s+", "", (name or "").lower())
    return key[4:] if key.startswith("unit") else key


def level_label(unit_name):
    return _LEVELS.get(unit_key(unit_name)) or (unit_name or "").upper()


def unit_sort_key(name):
    m = re.search(r"\d+", name or "")
    return (int(m.group()) if m else 10**6, (name or "").lower())


def classify(profession, nursing_role):
    """(report line, hours bucket or None) for one person."""
    prof = profession or ""
    for line, rx in _SPECIAL:
        if rx.search(prof):
            return line, None
    if nursing_role == "rn":
        return "RN", "RN"
    if nursing_role == "lpn":
        return "LPN", "LPN"
    if re.search(r"\bcma\b|medication aide|medicine aide", prof, re.I):
        return "CMA", "CMA"
    if nursing_role == "cna" or re.search(r"\bg?cna\b|\bgna\b|\bcga\b|aide|assistant", prof, re.I):
        return "CGA", "CGA"
    if re.search(r"nurse|\brn\b|\blpn\b", prof, re.I):
        return "NURSE", None  # a nurse whose RN / LPN role has not been set
    return "OTHER", None


def window(date, shift):
    a, b = SHIFT_WINDOWS[shift]
    midnight = dt.datetime.combine(date, dt.time(0))
    return midnight + dt.timedelta(hours=a), midnight + dt.timedelta(hours=b)


def shift_interval(date, shift_type, start_time, end_time):
    """(start, end) datetimes of a calendar shift, or None when it has no times and no standard window."""
    if start_time and end_time:
        s = dt.datetime.combine(date, start_time)
        e = dt.datetime.combine(date, end_time)
        if e <= s:
            e += dt.timedelta(days=1)
        return s, e
    if shift_type in SHIFT_WINDOWS:
        return window(date, shift_type)
    return None


def overlap(a_start, a_end, b_start, b_end):
    """(start, end, hours) of the overlap of two intervals."""
    s, e = max(a_start, b_start), min(a_end, b_end)
    hours = max(0.0, (e - s).total_seconds() / 3600)
    return s, e, hours


def short_time(t):
    h, m = t.hour, t.minute
    suffix = "a" if h < 12 else "p"
    h12 = h % 12 or 12
    return f"{h12}{suffix}" if m == 0 else f"{h12}:{m:02d}{suffix}"


@dataclass
class Person:
    staff_id: int
    name: str
    last: str
    profession: str
    line: str
    bucket: str | None
    is_rn: bool
    unit_id: int | None
    unit_name: str
    hours: float
    time_label: str  # "" when they cover the whole shift window, else e.g. "7p-11p"


@dataclass
class UnitInfo:
    id: int
    name: str
    beds: int | None = None
    census: int | None = None

    @property
    def level(self):
        return level_label(self.name)


@dataclass
class DayData:
    date: dt.date
    facility: str
    units: list = field(default_factory=list)  # UnitInfo, in display order
    people: dict = field(default_factory=dict)  # shift -> [Person]

    def unit(self, unit_id):
        return next((u for u in self.units if u.id == unit_id), None)

    @property
    def total_census(self):
        vals = [u.census for u in self.units if u.census is not None]
        return sum(vals) if vals else None


def people_for(records, date, shift):
    """
    records: dicts with staff_id, first_name, last_name, profession, nursing_role,
    unit_id, unit_name, date, shift_type, start_time, end_time. Returns the people
    who work any part of this shift window on this date.
    """
    w_start, w_end = window(date, shift)
    out, seen = [], set()
    for r in records:
        interval = shift_interval(r["date"], r["shift_type"], r.get("start_time"), r.get("end_time"))
        if interval is None:
            continue
        s, e, hours = overlap(interval[0], interval[1], w_start, w_end)
        if hours <= 0:
            continue
        key = (r["staff_id"], interval[0], interval[1])
        if key in seen:
            continue
        seen.add(key)
        line, bucket = classify(r["profession"], r["nursing_role"])
        full = s == w_start and e == w_end
        out.append(
            Person(
                staff_id=r["staff_id"],
                name=f"{r['first_name']} {r['last_name']}".strip(),
                last=r["last_name"] or "",
                profession=r["profession"] or "",
                line=line,
                bucket=bucket,
                is_rn=r["nursing_role"] == "rn",
                unit_id=r.get("unit_id"),
                unit_name=r.get("unit_name") or "",
                hours=round(hours, 2),
                time_label="" if full else f"{short_time(s)}-{short_time(e)}",
            )
        )
    out.sort(key=lambda p: (LINE_ORDER.index(p.line), p.last.lower(), p.name.lower()))
    return out


def stats(people):
    """{bucket: (people, hours)} plus totals, over the direct-care buckets."""
    out = {b: [0, 0.0] for b in BUCKETS}
    for p in people:
        if p.bucket:
            out[p.bucket][0] += 1
            out[p.bucket][1] += p.hours
    total_people = sum(v[0] for v in out.values())
    total_hours = sum(v[1] for v in out.values())
    return out, total_people, total_hours


def fmt_hours(h):
    return f"{h:.1f}".rstrip("0").rstrip(".") if abs(h - round(h)) > 1e-9 else str(int(round(h)))
