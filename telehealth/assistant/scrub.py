"""Remove patient identifiers from what staff type before it reaches the model.

Known patients (today's visits) are swapped for their reference code, so "admit Cy Longest"
becomes "admit v_1a2b3c4d". Phone numbers, emails, dates, ids and long digit runs are masked.
This is a safety net, not a guarantee: the UI also tells staff not to type identifiers.
"""
import re

# Words that are also workflow vocabulary: never treat them as a patient's name part.
_COMMON = {"patient", "visit", "waiting", "room", "link", "call", "today", "test", "video", "send", "admit"}

_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[id]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
    (re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)"), "[phone]"),
    (re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"), "[date]"),
    (re.compile(r"\d{6,}"), "[number]"),
]


def _name_terms(display_name: str):
    name = (display_name or "").strip()
    if not name:
        return []
    terms = [name]
    parts = [p for p in re.split(r"[\s,]+", name) if len(p) >= 4 and p.lower() not in _COMMON]
    return terms + parts


def scrub(text: str, known: dict) -> str:
    """`known` maps reference code -> patient display name."""
    out = text or ""
    # Longest names first so "Cy Longest" is replaced whole before "Longest" alone.
    replacements = sorted(
        ((term, ref) for ref, name in known.items() for term in _name_terms(name)),
        key=lambda pair: len(pair[0]),
        reverse=True,
    )
    for term, ref in replacements:
        out = re.sub(rf"(?<!\w){re.escape(term)}(?!\w)", ref, out, flags=re.IGNORECASE)
    for pattern, mask in _PATTERNS:
        out = pattern.sub(mask, out)
    return out
