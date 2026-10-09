"""The prescription as a one-page PDF (letter size) for printing or faxing."""

from datetime import datetime
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

from . import prescriptions as rxs

WATERMARKS = {"draft": "DRAFT - NOT VALID", "cancelled": "CANCELLED"}


def _fmt_date(value):
    if not value:
        return ""
    try:
        d = datetime.fromisoformat(value) if isinstance(value, str) else value
        return d.strftime("%m/%d/%Y")
    except (TypeError, ValueError):
        return str(value)


def _qty(rx):
    if rx.quantity is None:
        return ""
    q = rx.quantity.normalize()
    text = format(q, "f")
    return f"{text} {rx.quantity_unit}".strip()


def build_pdf(rx, reprint=False):
    """Returns the PDF bytes. A draft is watermarked; a signed Rx uses what was frozen when it was signed."""
    snap = rx.clinical_snapshot or rxs.clinical_snapshot(rx)
    pres, pat = snap["prescriber"], snap["patient"]
    pharm = rx.pharmacy_snapshot or (rxs.pharmacy_json(rx.pharmacy) if rx.pharmacy_id else {})

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setTitle(f"Prescription {rx.pk}")
    W, H = letter
    left, right = 0.75 * inch, W - 0.75 * inch
    y = H - 0.8 * inch

    # prescriber header
    c.setFont("Helvetica-Bold", 15)
    c.drawString(left, y, pres.get("practice_name") or snap.get("organization", ""))
    y -= 16
    c.setFont("Helvetica", 9.5)
    for line in (
        pres.get("address", ""),
        "  ".join(x for x in (f"Phone {pres['phone']}" if pres.get("phone") else "", f"Fax {pres['fax']}" if pres.get("fax") else "") if x),
    ):
        if line:
            c.drawString(left, y, line)
            y -= 12
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, f"{pres.get('name', '')}")
    c.setFont("Helvetica", 9.5)
    ids = f"NPI {pres.get('npi', '')}"
    if pres.get("license_number"):
        ids += f"   License {pres.get('license_state', '')} {pres['license_number']}".replace("  ", " ")
    c.drawString(left + c.stringWidth(pres.get("name", "") + "   ", "Helvetica-Bold", 10), y, ids)
    y -= 8
    c.setLineWidth(1.2)
    c.line(left, y, right, y)
    y -= 20

    # patient block
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, "PATIENT")
    c.drawString(W / 2 + 0.2 * inch, y, "DATE")
    y -= 14
    c.setFont("Helvetica", 11)
    c.drawString(left, y, pat.get("name", ""))
    c.drawString(W / 2 + 0.2 * inch, y, timezone.localtime(rx.signed_at).strftime("%m/%d/%Y") if rx.signed_at else timezone.localdate().strftime("%m/%d/%Y"))
    y -= 14
    c.setFont("Helvetica", 9.5)
    dob = _fmt_date(pat.get("date_of_birth"))
    c.drawString(left, y, "  ".join(x for x in (f"DOB {dob}" if dob else "", f"Sex {pat['sex']}" if pat.get("sex") else "", f"MRN {pat['mrn']}" if pat.get("mrn") else "") if x))
    y -= 12
    if pat.get("address") or pat.get("phone"):
        c.drawString(left, y, "  ".join(x for x in (pat.get("address", ""), pat.get("phone", "")) if x))
        y -= 12
    y -= 6
    c.setLineWidth(0.5)
    c.line(left, y, right, y)
    y -= 34

    # Rx
    c.setFont("Times-BoldItalic", 34)
    c.drawString(left, y - 8, "Rx")
    body_left = left + 0.65 * inch
    c.setFont("Helvetica-Bold", 14)
    name_line = " ".join(x for x in (rx.drug_name, rx.strength, rx.form) if x)
    c.drawString(body_left, y, name_line)
    y -= 24

    style = ParagraphStyle("sig", fontName="Helvetica", fontSize=12, leading=16)
    sig_text = (rx.sig or rxs.build_sig(rx)).replace("&", "&amp;").replace("<", "&lt;")
    para = Paragraph(f"<b>Sig:</b> {sig_text}", style)
    w, h = para.wrap(right - body_left, 200)
    para.drawOn(c, body_left, y - h + 12)
    y -= h + 14

    c.setFont("Helvetica", 11.5)
    rows = [("Dispense", _qty(rx)), ("Days' supply", str(rx.days_supply or "")), ("Refills", str(rx.refills))]
    for label, value in rows:
        c.setFont("Helvetica-Bold", 11.5)
        c.drawString(body_left, y, f"{label}:")
        c.setFont("Helvetica", 11.5)
        c.drawString(body_left + 1.1 * inch, y, value)
        y -= 17
    if rx.dispense_as_written:
        c.setFont("Helvetica-Bold", 11.5)
        c.drawString(body_left, y, "DISPENSE AS WRITTEN - brand medically necessary")
        y -= 17
    if rx.indication_text or rx.indication_code:
        c.setFont("Helvetica", 10.5)
        c.drawString(body_left, y, "Indication: " + " ".join(x for x in (rx.indication_code, rx.indication_text) if x))
        y -= 15
    if rx.note_to_pharmacist:
        note = Paragraph("<b>Note to pharmacist:</b> " + rx.note_to_pharmacist.replace("&", "&amp;").replace("<", "&lt;"),
                         ParagraphStyle("n", fontName="Helvetica", fontSize=10.5, leading=13))
        w, h = note.wrap(right - body_left, 100)
        note.drawOn(c, body_left, y - h + 10)
        y -= h + 8

    # allergies
    y -= 6
    c.setLineWidth(0.5)
    c.line(left, y, right, y)
    y -= 15
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(left, y, "Allergies:")
    c.setFont("Helvetica", 9.5)
    if snap.get("allergies"):
        text = "; ".join(a["substance"] + (f" ({a['reaction']})" if a.get("reaction") else "") for a in snap["allergies"])
    elif snap.get("no_known_allergies"):
        text = "No known allergies"
    else:
        text = "Not documented"
    para = Paragraph(text.replace("&", "&amp;").replace("<", "&lt;"), ParagraphStyle("a", fontName="Helvetica", fontSize=9.5, leading=12))
    w, h = para.wrap(right - left - 0.8 * inch, 80)
    para.drawOn(c, left + 0.8 * inch, y - h + 10)
    y -= max(h, 12) + 6

    # pharmacy
    if pharm:
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(left, y, "Pharmacy:")
        c.setFont("Helvetica", 9.5)
        parts = [pharm.get("name", ""), rxs.pharmacy_line(pharm), f"Ph {pharm['phone']}" if pharm.get("phone") else "", f"Fax {pharm['fax']}" if pharm.get("fax") else ""]
        c.drawString(left + 0.8 * inch, y, "  |  ".join(p for p in parts if p))
        y -= 18

    # signature
    y = min(y - 20, 2.0 * inch)
    c.setLineWidth(0.8)
    c.line(left, y, left + 3.2 * inch, y)
    y -= 12
    c.setFont("Helvetica", 9)
    if rx.status in ("signed", "sent", "cancelled") and rx.signed_at:
        c.setFont("Helvetica-Oblique", 11)
        c.drawString(left, y + 16, pres.get("name", ""))
        c.setFont("Helvetica", 8.5)
        c.drawString(left, y, f"Electronically signed {timezone.localtime(rx.signed_at).strftime('%m/%d/%Y %H:%M')}  -  {pres.get('name', '')}, NPI {pres.get('npi', '')}")
    else:
        c.drawString(left, y, "Prescriber signature")
    y -= 12
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.grey)
    c.drawString(left, 0.55 * inch, f"Rx #{rx.pk}  -  generated {timezone.localtime().strftime('%m/%d/%Y %H:%M')}  -  not valid for controlled substances")
    c.setFillColor(colors.black)

    mark = WATERMARKS.get(rx.status)
    if not mark and reprint:
        mark = "COPY"
    if mark:
        c.saveState()
        c.setFillColor(colors.Color(0.8, 0.1, 0.1, alpha=0.18) if rx.status != "sent" else colors.Color(0.4, 0.4, 0.4, alpha=0.18))
        c.setFont("Helvetica-Bold", 60 if len(mark) < 12 else 44)
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, mark)
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()
