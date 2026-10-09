"""
How a signed prescription leaves the system.

Today: print (a PDF, logged) and fax (a person sends the PDF and records it). The two later
paths plug in here without changing the writer or the screens:

    fax API   -> set RX_FAX_PROVIDER = "phaxio" / "documo" / "telnyx" and add an adapter below
    e-Rx      -> set RX_ERX_PROVIDER = "weno" / "dosespot" and add an adapter below

`capabilities()` is what the screens read to decide which buttons to show.
"""

from django.conf import settings


class TransportNotConfigured(Exception):
    pass


def fax_provider():
    return getattr(settings, "RX_FAX_PROVIDER", "manual") or "manual"


def erx_provider():
    return getattr(settings, "RX_ERX_PROVIDER", "") or ""


def capabilities():
    fax = fax_provider()
    erx = erx_provider()
    return {
        "print": {"available": True},
        "fax": {"available": True, "provider": fax, "automatic": fax != "manual"},
        "erx": {"available": bool(erx), "provider": erx},
        "controlled_substances": False,  # needs e-prescribing with two-factor signing
    }


def send_fax(rx, pdf_bytes, fax_number):
    """Hand the PDF to the fax provider. Only the manual mode exists so far."""
    if fax_provider() == "manual":
        raise TransportNotConfigured("Faxing is manual: send the PDF yourself, then record it on the prescription.")
    raise TransportNotConfigured(f"Fax provider '{fax_provider()}' has no adapter yet.")


def send_erx(rx):
    raise TransportNotConfigured("Electronic prescribing is not connected yet.")
