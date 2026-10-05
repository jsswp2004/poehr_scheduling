"""
HL7 v2 ORU^R01 (lab results) reading and the ACK we send back.

parse_oru(text) turns one message into plain data -- see lab_intake.py for what
happens next:

    {"control_id", "sending_app", "sending_facility", "version",
     "patient": {"ids": [...], "last", "first", "dob", "sex"},
     "reports": [{"placer", "filler", "code", "title", "collected_at",
                  "resulted_at", "status", "comment", "has_document",
                  "items": [{"test_name", "loinc_code", "value", "units",
                             "reference_range", "abnormal_flag", "comment"}]}]}

Only what we use is read: MSH, PID, ORC, OBR, OBX, NTE. One message can hold
several OBR groups (several panels); each becomes its own report. Anything
that is not an ORU message, or has no patient, raises Hl7Error so the sender
gets a rejection rather than silent loss.
"""

import re
from datetime import date, datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

MLLP_CHARS = "\x0b\x1c"


class Hl7Error(Exception):
    """The message cannot be read (the sender should be told, not silently dropped)."""


# --------------------------------------------------------------------------
# low level
# --------------------------------------------------------------------------

def split_segments(text):
    text = str(text or "").strip(MLLP_CHARS + " \t\r\n")
    return [seg for seg in re.split(r"\r\n|\r|\n", text) if seg.strip()]


class Delims:
    def __init__(self, msh):
        if not msh.startswith("MSH") or len(msh) < 8:
            raise Hl7Error("The message does not start with an MSH segment.")
        self.field = msh[3]
        enc = msh[4:8].split(self.field)[0]
        self.comp = enc[0] if len(enc) > 0 else "^"
        self.rep = enc[1] if len(enc) > 1 else "~"
        self.esc = enc[2] if len(enc) > 2 else "\\"
        self.sub = enc[3] if len(enc) > 3 else "&"


def unescape(text, d):
    """HL7 escape sequences: \\F\\ \\S\\ \\T\\ \\R\\ \\E\\ \\.br\\ and \\Xhh\\ hex."""
    if d.esc not in text:
        return text
    pattern = re.escape(d.esc) + r"([^" + re.escape(d.esc) + r"]*)" + re.escape(d.esc)

    def sub(match):
        code = match.group(1)
        table = {"F": d.field, "S": d.comp, "T": d.sub, "R": d.rep, "E": d.esc}
        if code in table:
            return table[code]
        if code in (".br", ".BR"):
            return "\n"
        if code.startswith("X") and len(code) > 1 and len(code) % 2 == 1:
            try:
                return bytes.fromhex(code[1:]).decode("latin-1")
            except ValueError:
                return ""
        return ""  # other formatting codes (highlighting etc.) carry no data

    return re.sub(pattern, sub, text)


class Segment:
    """Fields of one segment, addressed the HL7 way: seg.f(3) is PID-3, MSH-9 is msh.f(9)."""

    def __init__(self, line, d):
        self.d = d
        self.name = line[:3]
        parts = line.split(d.field)
        if self.name == "MSH":
            # MSH-1 is the separator itself, so MSH-2 is parts[1]
            self.parts = [parts[0], d.field] + parts[1:]
        else:
            self.parts = parts

    def f(self, n):
        return self.parts[n] if n < len(self.parts) else ""

    def repetitions(self, n):
        raw = self.f(n)
        return raw.split(self.d.rep) if raw else []

    def comps(self, n, rep=0):
        reps = self.repetitions(n)
        if rep >= len(reps):
            return []
        return [unescape(c, self.d) for c in reps[rep].split(self.d.comp)]

    def text(self, n):
        return unescape(self.f(n), self.d).strip()


def comp(components, i):
    return components[i].strip() if i < len(components) else ""


def first_sub(value, d):
    return value.split(d.sub)[0] if value else ""


# --------------------------------------------------------------------------
# dates
# --------------------------------------------------------------------------

def parse_hl7_datetime(value):
    """
    YYYY[MM[DD[HH[MM[SS[.S+]]]]]][+/-ZZZZ] -> aware datetime, or None.
    Without an offset the time is taken in this server's time zone.
    """
    value = str(value or "").strip()
    m = re.fullmatch(r"(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?", value)
    if not m:
        return None
    year, month, day, hour, minute, second, offset = m.groups()
    try:
        dt = datetime(int(year), int(month or 1), int(day or 1), int(hour or 0), int(minute or 0), int(second or 0))
    except ValueError:
        return None
    if offset:
        sign = 1 if offset[0] == "+" else -1
        delta = timedelta(hours=int(offset[1:3]), minutes=int(offset[3:5]))
        return dt.replace(tzinfo=dt_timezone(sign * delta))
    return timezone.make_aware(dt, timezone.get_current_timezone())


def parse_hl7_date(value):
    value = str(value or "").strip()
    m = re.match(r"(\d{4})(\d{2})(\d{2})", value)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


# --------------------------------------------------------------------------
# result statuses and flags
# --------------------------------------------------------------------------

# OBR-25 / OBX-11 -> our report status. "cancelled" means the lab withdrew the result.
STATUS_MAP = {
    "F": "final",
    "P": "preliminary",
    "R": "preliminary",
    "A": "preliminary",
    "I": "preliminary",
    "S": "preliminary",
    "O": "preliminary",
    "C": "corrected",
    "X": "cancelled",
    "D": "cancelled",
}

# OBX-8 abnormal flags -> L / H / LL / HH / A / "" (normal)
FLAG_MAP = {
    "": "",
    "N": "",
    "L": "L",
    "H": "H",
    "LL": "LL",
    "HH": "HH",
    "CL": "LL",
    "CH": "HH",
    "<": "L",  # off-scale low / high: out of range, but not by itself "critical"
    ">": "H",
    "A": "A",
    "AA": "A",
    "R": "A",  # resistant
    # change-since-last-time and susceptibility flags say nothing about being out of range
    "U": "",
    "D": "",
    "B": "",
    "W": "",
    "S": "",
    "I": "",
}


def map_flag(raw):
    return FLAG_MAP.get(str(raw or "").strip().upper(), "A")  # an unknown abnormal code is still abnormal


# --------------------------------------------------------------------------
# values
# --------------------------------------------------------------------------

NON_VALUE_TYPES = {"ED", "RP", "RI"}  # embedded documents / pointers: not a result value


def read_value(obx, d):
    """(text, is_document). Handles numeric, text, coded (CE/CWE) and structured numeric (SN)."""
    vtype = obx.text(2).upper()
    if vtype in NON_VALUE_TYPES:
        return "", True
    reps = [r for r in obx.repetitions(5)]
    parts = []
    for raw in reps:
        c = [unescape(x, d).strip() for x in raw.split(d.comp)]
        if vtype in ("CE", "CWE", "CF", "CNE"):
            parts.append(c[1] if len(c) > 1 and c[1] else c[0] if c else "")
        elif vtype == "SN":
            parts.append("".join(c[:2]) + (f"{c[2]}{c[3]}" if len(c) > 3 and c[2] else ""))
        elif vtype == "NM":
            parts.append(c[0])
        else:
            parts.append(unescape(raw, d).strip())
    return " ".join(p for p in parts if p).strip(), False


def read_loinc(components):
    """LOINC code from an identifier (primary, then alternate triplet), or ''."""
    system = comp(components, 2).upper()
    if system in ("LN", "LOINC") and comp(components, 0):
        return comp(components, 0)
    alt_system = comp(components, 5).upper()
    if alt_system in ("LN", "LOINC") and comp(components, 3):
        return comp(components, 3)
    return ""


# --------------------------------------------------------------------------
# the message
# --------------------------------------------------------------------------

def parse_oru(text):
    lines = split_segments(text)
    if not lines or not lines[0].startswith("MSH"):
        raise Hl7Error("The message does not start with an MSH segment.")
    d = Delims(lines[0])
    msh = Segment(lines[0], d)

    message_type = msh.comps(9)
    if comp(message_type, 0).upper() != "ORU":
        raise Hl7Error(f"Only ORU result messages are accepted (received {'^'.join(message_type) or 'no type'}).")

    out = {
        "control_id": msh.text(10),
        "sending_app": comp(msh.comps(3), 0),
        "sending_facility": comp(msh.comps(4), 0),
        "version": comp(msh.comps(12), 0),
        "patient": None,
        "reports": [],
    }

    current = None
    orc = {}
    last_item = None
    for line in lines[1:]:
        name = line[:3]
        if name == "PID":
            seg = Segment(line, d)
            ids = []
            for n in (3, 2):
                for rep in range(len(seg.repetitions(n))):
                    value = comp(seg.comps(n, rep), 0)
                    if value and value not in ids:
                        ids.append(value)
            name_parts = seg.comps(5)
            out["patient"] = {
                "ids": ids,
                "last": first_sub(comp(name_parts, 0), d),
                "first": comp(name_parts, 1),
                "dob": parse_hl7_date(seg.f(7)),
                "sex": seg.text(8),
            }
        elif name == "ORC":
            seg = Segment(line, d)
            orc = {"placer": comp(seg.comps(2), 0), "filler": comp(seg.comps(3), 0)}
        elif name == "OBR":
            seg = Segment(line, d)
            service = seg.comps(4)
            current = {
                "placer": comp(seg.comps(2), 0) or orc.get("placer", ""),
                "filler": comp(seg.comps(3), 0) or orc.get("filler", ""),
                "code": comp(service, 0),
                "loinc_code": read_loinc(service),
                "title": comp(service, 1) or comp(service, 0),
                "collected_at": parse_hl7_datetime(seg.f(7)),
                "resulted_at": parse_hl7_datetime(seg.f(22)),
                "status": STATUS_MAP.get(seg.text(25).upper(), ""),
                "comment": "",
                "has_document": False,
                "items": [],
                "_obx_statuses": [],
            }
            out["reports"].append(current)
            orc = {}
            last_item = None
        elif name == "OBX" and current is not None:
            seg = Segment(line, d)
            obx_status = seg.text(11).upper()
            current["_obx_statuses"].append(obx_status)
            value, is_document = read_value(seg, d)
            if is_document:
                current["has_document"] = True
                last_item = None
                continue
            if obx_status in ("X", "D") or not value:
                last_item = None
                continue
            ident = seg.comps(3)
            item = {
                "test_name": comp(ident, 1) or comp(ident, 0),
                "loinc_code": read_loinc(ident),
                "value": value,
                "units": comp(seg.comps(6), 0),
                "reference_range": seg.text(7),
                "abnormal_flag": map_flag(seg.text(8)),
                "comment": "",
            }
            current["items"].append(item)
            last_item = item
        elif name == "NTE" and current is not None:
            seg = Segment(line, d)
            note = seg.text(3)
            if note:
                target = last_item if last_item is not None else current
                target["comment"] = (target["comment"] + "\n" + note).strip()

    if out["patient"] is None:
        raise Hl7Error("The message has no PID (patient) segment.")
    if not out["reports"]:
        raise Hl7Error("The message has no OBR (result report) segment.")

    for report in out["reports"]:
        statuses = report.pop("_obx_statuses")
        if not report["status"]:
            # no OBR-25: take the least-final OBX status
            mapped = [STATUS_MAP.get(s, "final") for s in statuses] or ["preliminary"]
            if "preliminary" in mapped:
                report["status"] = "preliminary"
            elif "corrected" in mapped:
                report["status"] = "corrected"
            else:
                report["status"] = "final"
    return out


# --------------------------------------------------------------------------
# the acknowledgment we send back
# --------------------------------------------------------------------------

def _esc(text):
    return str(text or "").replace("\\", "\\E\\").replace("|", "\\F\\").replace("^", "\\S\\").replace("&", "\\T\\").replace("~", "\\R\\").replace("\r", " ").replace("\n", " ")


def build_ack(code, control_id="", text="", sending_app="", sending_facility="", version="2.5.1"):
    """
    AA = accepted (including results kept for a person to match), AE = could not
    process right now (the sender should retry), AR = rejected (do not retry).
    """
    now = timezone.now().strftime("%Y%m%d%H%M%S")
    msh = f"MSH|^~\\&|POWER|POWER|{_esc(sending_app)}|{_esc(sending_facility)}|{now}||ACK^R01|ACK{now}|P|{version or '2.5.1'}"
    msa = f"MSA|{code}|{_esc(control_id)}" + (f"|{_esc(text)}" if text else "")
    return msh + "\r" + msa + "\r"
