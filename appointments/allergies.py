"""
Allergy module: coded allergy entries, substance search, reactions, order
alerts and the FHIR export.

Sources of coded data
---------------------
* Drugs: the NLM RxNav / RxNorm web service (free, no key). It is called live
  from the server, cached for 12 hours, and fails soft -- if RxNav cannot be
  reached the search still works from the local lists below, and the allergy
  can be saved as free text (or with the local name and no code).
* Foods, environmental and other substances: ``data/allergen_catalog.json``,
  built from the SNOMED CT International Patient Summary (IPS) free set,
  CC BY 4.0, (c) SNOMED International.
* Reactions: the short curated list below. Every SNOMED code in it passes the
  SNOMED check-digit test (see test_allergies.py); where a code was uncertain
  it was left blank rather than guessed.

This product uses publicly available data from the U.S. National Library of
Medicine (NLM), National Institutes of Health, Department of Health and Human
Services; NLM is not responsible for the product and does not endorse or
recommend this or any other product.

Order alerts
------------
Real cross-sensitivity data comes from paid knowledge bases (First Databank,
Medi-Span). Until one is licensed, ``DRUG_GROUPS`` below is a small, curated,
*local* list. It is a safety net, not a replacement for pharmacist review, and
a clinic should have it reviewed before relying on it.
"""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

log = logging.getLogger(__name__)

STAFF_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")

CATEGORIES = [
    ("medication", "Medication"),
    ("food", "Food"),
    ("environment", "Environment"),
    ("biologic", "Biologic / vaccine"),
    ("other", "Other"),
]
REACTION_TYPES = [("allergy", "Allergy"), ("intolerance", "Intolerance")]
CODE_SYSTEMS = ("", "rxnorm", "snomed")

SYSTEM_URI = {
    "rxnorm": "http://www.nlm.nih.gov/research/umls/rxnorm",
    "snomed": "http://snomed.info/sct",
}

DATA_DIR = Path(__file__).resolve().parent / "data"


# --------------------------------------------------------------------------
# reactions (SNOMED CT clinical findings), most common first
# --------------------------------------------------------------------------

REACTIONS = [
    ("39579001", "Anaphylaxis"),
    ("126485001", "Hives (urticaria)"),
    ("271807003", "Rash"),
    ("418290006", "Itching"),
    ("41291007", "Angioedema (swelling of face, lips or throat)"),
    ("442672001", "Swelling"),
    ("267036007", "Shortness of breath"),
    ("56018004", "Wheezing"),
    ("4386001", "Bronchospasm"),
    ("49727002", "Cough"),
    ("45007003", "Low blood pressure"),
    ("3424008", "Fast heart rate"),
    ("404640003", "Dizziness"),
    ("422587007", "Nausea"),
    ("422400008", "Vomiting"),
    ("62315008", "Diarrhea"),
    ("21522001", "Abdominal pain"),
    ("25064002", "Headache"),
    ("386661006", "Fever"),
    ("247441003", "Redness of skin (erythema)"),
    ("40275004", "Contact dermatitis"),
    ("76067001", "Sneezing"),
    ("68235000", "Nasal congestion"),
    ("73442001", "Stevens-Johnson syndrome"),
]


def reactions_list():
    return [{"code": c, "display": d, "system": "snomed"} for c, d in REACTIONS]


_REACTION_BY_CODE = {c: d for c, d in REACTIONS}


def clean_reactions(value):
    """
    Normalise a list of reactions from the client into [{code, display}].
    Entries may be a bare string (free text), or {code?, display}. A code is
    kept only if it is in the curated list, so a typo cannot become a wrong
    clinical code. Returns (list, error).
    """
    if value in (None, ""):
        return [], None
    if not isinstance(value, list):
        return None, "Reactions must be a list."
    if len(value) > 20:
        return None, "Choose at most 20 reactions."
    out, seen = [], set()
    for item in value:
        if isinstance(item, str):
            item = {"display": item}
        if not isinstance(item, dict):
            return None, "Each reaction needs a name."
        code = str(item.get("code") or "").strip()
        display = str(item.get("display") or "").strip()[:120]
        if code and code in _REACTION_BY_CODE:
            display = _REACTION_BY_CODE[code]
        else:
            code = ""
        if not display:
            continue
        key = code or display.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"code": code, "display": display})
    return out, None


def reactions_text(reactions):
    return ", ".join(r["display"] for r in reactions)[:200]


# --------------------------------------------------------------------------
# local catalog (SNOMED IPS free set)
# --------------------------------------------------------------------------

_catalog_cache = None


def catalog():
    global _catalog_cache
    if _catalog_cache is None:
        try:
            with open(DATA_DIR / "allergen_catalog.json", encoding="utf-8") as fh:
                _catalog_cache = json.load(fh).get("concepts", [])
        except (OSError, ValueError):
            log.exception("allergen catalog could not be loaded")
            _catalog_cache = []
    return _catalog_cache


def _norm(text):
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


# --------------------------------------------------------------------------
# curated drug groups, brand names and cross-sensitivity (local, reviewable)
# --------------------------------------------------------------------------

DRUG_GROUPS = {
    "penicillins": {
        "label": "Penicillins",
        "aliases": ["penicillin", "penicillins", "pcn", "beta lactam penicillin"],
        "members": [
            "penicillin", "penicillin g", "penicillin v", "benzathine penicillin", "amoxicillin", "ampicillin",
            "piperacillin", "nafcillin", "oxacillin", "dicloxacillin", "ticarcillin",
        ],
    },
    "cephalosporins": {
        "label": "Cephalosporins",
        "aliases": ["cephalosporin", "cephalosporins", "cephalosporin antibiotics"],
        "members": [
            "cephalexin", "cefazolin", "cefuroxime", "cefdinir", "cefepime", "ceftriaxone", "cefotaxime",
            "ceftazidime", "cefoxitin", "cefpodoxime", "cefadroxil", "cefixime", "cephalosporin",
        ],
    },
    "carbapenems": {
        "label": "Carbapenems",
        "aliases": ["carbapenem", "carbapenems"],
        "members": ["meropenem", "imipenem", "ertapenem", "doripenem"],
    },
    "sulfonamide antibiotics": {
        "label": "Sulfonamide antibiotics",
        "aliases": ["sulfa", "sulfa drugs", "sulfonamide", "sulfonamides", "sulfonamide antibiotics", "sulpha"],
        "members": ["sulfamethoxazole", "sulfadiazine", "sulfasalazine", "sulfisoxazole", "sulfacetamide"],
    },
    "nsaids": {
        "label": "NSAIDs",
        "aliases": ["nsaid", "nsaids", "anti inflammatory", "non steroidal anti inflammatory"],
        "members": [
            "ibuprofen", "naproxen", "ketorolac", "diclofenac", "meloxicam", "indomethacin", "celecoxib",
            "aspirin", "nabumetone", "etodolac",
        ],
    },
    "opioids": {
        "label": "Opioids",
        "aliases": ["opioid", "opioids", "opiate", "opiates", "narcotic", "narcotics"],
        "members": [
            "morphine", "codeine", "hydrocodone", "oxycodone", "hydromorphone", "fentanyl", "tramadol",
            "methadone", "meperidine",
        ],
    },
    "fluoroquinolones": {
        "label": "Fluoroquinolones",
        "aliases": ["fluoroquinolone", "fluoroquinolones", "quinolone", "quinolones"],
        "members": ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin"],
    },
    "macrolides": {
        "label": "Macrolides",
        "aliases": ["macrolide", "macrolides"],
        "members": ["azithromycin", "erythromycin", "clarithromycin"],
    },
    "tetracyclines": {
        "label": "Tetracyclines",
        "aliases": ["tetracycline antibiotics", "tetracyclines"],
        "members": ["tetracycline", "doxycycline", "minocycline"],
    },
    "aminoglycosides": {
        "label": "Aminoglycosides",
        "aliases": ["aminoglycoside", "aminoglycosides"],
        "members": ["gentamicin", "tobramycin", "amikacin", "streptomycin"],
    },
    "ace inhibitors": {
        "label": "ACE inhibitors",
        "aliases": ["ace inhibitor", "ace inhibitors", "ace i"],
        "members": ["lisinopril", "enalapril", "ramipril", "captopril", "benazepril"],
    },
    "statins": {
        "label": "Statins",
        "aliases": ["statin", "statins"],
        "members": ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
    },
}

# Drugs with no group, so they are still found by name.
SINGLE_INGREDIENTS = [
    "acetaminophen", "vancomycin", "metronidazole", "clindamycin", "trimethoprim", "nitrofurantoin",
    "lidocaine", "heparin", "warfarin", "insulin", "metformin", "furosemide", "ondansetron",
    "diphenhydramine", "prednisone", "methylprednisolone", "dexamethasone", "hydrocortisone",
    "amlodipine", "metoprolol", "carvedilol", "losartan", "hydrochlorothiazide", "spironolactone",
    "digoxin", "amiodarone", "clopidogrel", "apixaban", "rivaroxaban", "enoxaparin", "omeprazole",
    "pantoprazole", "famotidine", "gabapentin", "sertraline", "fluoxetine", "lorazepam", "diazepam",
    "midazolam", "haloperidol", "levothyroxine", "albuterol", "fluconazole", "acyclovir", "oseltamivir",
    "contrast dye", "iodine", "codeine phosphate",
]

# Brand / combination names -> the ingredients they contain.
BRANDS = {
    "augmentin": ["amoxicillin"],
    "amoxil": ["amoxicillin"],
    "bactrim": ["sulfamethoxazole", "trimethoprim"],
    "septra": ["sulfamethoxazole", "trimethoprim"],
    "keflex": ["cephalexin"],
    "rocephin": ["ceftriaxone"],
    "zithromax": ["azithromycin"],
    "z pak": ["azithromycin"],
    "cipro": ["ciprofloxacin"],
    "levaquin": ["levofloxacin"],
    "zosyn": ["piperacillin"],
    "unasyn": ["ampicillin"],
    "motrin": ["ibuprofen"],
    "advil": ["ibuprofen"],
    "aleve": ["naproxen"],
    "toradol": ["ketorolac"],
    "tylenol": ["acetaminophen"],
    "percocet": ["oxycodone", "acetaminophen"],
    "vicodin": ["hydrocodone", "acetaminophen"],
    "norco": ["hydrocodone", "acetaminophen"],
    "tylenol with codeine": ["codeine", "acetaminophen"],
    "dilaudid": ["hydromorphone"],
    "ultram": ["tramadol"],
    "lipitor": ["atorvastatin"],
    "zocor": ["simvastatin"],
    "crestor": ["rosuvastatin"],
    "zestril": ["lisinopril"],
    "prinivil": ["lisinopril"],
    "ecotrin": ["aspirin"],
    "bayer": ["aspirin"],
    "benadryl": ["diphenhydramine"],
    "lasix": ["furosemide"],
    "zofran": ["ondansetron"],
}

# Group -> groups that are only *possibly* cross-sensitive.
CROSS_GROUPS = {
    "penicillins": ["cephalosporins", "carbapenems"],
    "cephalosporins": ["penicillins"],
    "carbapenems": ["penicillins"],
}

LEVELS = {
    "ingredient": "Same drug as the allergy",
    "class": "Same drug class as the allergy",
    "cross": "Possible cross-sensitivity",
}
_LEVEL_RANK = {"ingredient": 0, "class": 1, "cross": 2}


def _build_indexes():
    ingredient_groups = {}
    for gname, g in DRUG_GROUPS.items():
        for m in g["members"]:
            ingredient_groups.setdefault(_norm(m), set()).add(gname)
    ingredients = set(ingredient_groups) | {_norm(i) for i in SINGLE_INGREDIENTS}
    aliases = {}
    for gname, g in DRUG_GROUPS.items():
        for a in g["aliases"] + [gname, g["label"]]:
            aliases[_norm(a)] = gname
    return ingredient_groups, ingredients, aliases


_INGREDIENT_GROUPS, _INGREDIENTS, _ALIASES = _build_indexes()
_BRANDS = {_norm(k): [_norm(i) for i in v] for k, v in BRANDS.items()}


def _phrase_in(phrase, text):
    return f" {phrase} " in f" {text} "


def drug_terms(text):
    """(ingredients, groups) a name refers to -- brand names expanded, class names recognised."""
    t = _norm(text)
    ingredients, groups = set(), set()
    for brand, ings in _BRANDS.items():
        if _phrase_in(brand, t):
            ingredients.update(ings)
    for ing in _INGREDIENTS:
        if _phrase_in(ing, t):
            ingredients.add(ing)
    for alias, gname in _ALIASES.items():
        if _phrase_in(alias, t):
            groups.add(gname)
    # "penicillin g" should not also count as a bare "penicillin" hit's problem;
    # group membership follows from every ingredient found.
    for ing in ingredients:
        groups.update(_INGREDIENT_GROUPS.get(ing, ()))
    return ingredients, groups


def _allergy_terms(allergy):
    ingredients, groups = drug_terms(allergy.substance)
    class_only = bool(groups) and not ingredients
    return ingredients, groups, class_only


def check_order(patient, name, code_system="", code=""):
    """
    Alerts for ordering ``name`` for ``patient``: one per active allergy that
    matches, at the strongest level found. [] means nothing matched.
    """
    from .models import PatientAllergy  # models import this module's constants indirectly

    order_ings, order_groups = drug_terms(name)
    alerts = []
    for a in PatientAllergy.objects.filter(patient=patient, status="active"):
        level, matched = None, ""
        if code and code_system == "rxnorm" and a.code_system == "rxnorm" and a.code == str(code):
            level, matched = "ingredient", a.substance
        else:
            a_ings, a_groups, class_only = _allergy_terms(a)
            same = order_ings & a_ings
            if same:
                level, matched = "ingredient", sorted(same)[0]
            elif a_groups & order_groups:
                level = "class"
                matched = DRUG_GROUPS[sorted(a_groups & order_groups)[0]]["label"]
            else:
                cross = set()
                for g in a_groups:
                    cross.update(CROSS_GROUPS.get(g, ()))
                if cross & order_groups:
                    level = "cross"
                    matched = DRUG_GROUPS[sorted(cross & order_groups)[0]]["label"]
        if level:
            alerts.append({
                "allergy_id": a.pk,
                "substance": a.substance,
                "severity": a.severity,
                "reaction": a.reaction,
                "level": level,
                "level_label": LEVELS[level],
                "matched": matched,
                "message": f"{LEVELS[level]}: patient is allergic to {a.substance}"
                           + (f" ({a.reaction})" if a.reaction else "") + ".",
            })
    alerts.sort(key=lambda x: (_LEVEL_RANK[x["level"]], {"severe": 0, "moderate": 1}.get(x["severity"], 2)))
    return alerts


# --------------------------------------------------------------------------
# substance search: RxNorm (live, cached) + local lists
# --------------------------------------------------------------------------

RXNAV = "https://rxnav.nlm.nih.gov/REST"
RXNORM_TIMEOUT = 3
RXNORM_CACHE_SECONDS = 12 * 3600
_INGREDIENT_TTYS = ("IN", "MIN", "PIN")


def _rx_get(path, params=None):
    base = getattr(settings, "ALLERGY_RXNORM_BASE_URL", RXNAV)
    resp = requests.get(f"{base}{path}", params=params, timeout=RXNORM_TIMEOUT, headers={"Accept": "application/json"})
    resp.raise_for_status()
    return resp.json()


def _rx_ingredient_for(rxcui):
    """The ingredient (rxcui, name) a concept belongs to, or None."""
    props = (_rx_get(f"/rxcui/{rxcui}/properties.json") or {}).get("properties") or {}
    if props.get("tty") in _INGREDIENT_TTYS:
        return {"code": str(props.get("rxcui") or rxcui), "display": props.get("name") or ""}
    related = (_rx_get(f"/rxcui/{rxcui}/related.json", {"tty": "IN+MIN"}) or {}).get("relatedGroup") or {}
    for grp in related.get("conceptGroup") or []:
        for cp in grp.get("conceptProperties") or []:
            if cp.get("tty") in _INGREDIENT_TTYS and cp.get("rxcui"):
                return {"code": str(cp["rxcui"]), "display": cp.get("name") or ""}
    return None


def rxnorm_search(term, limit=8):
    """
    Drug ingredients matching ``term`` from RxNorm. Returns (results, state),
    state being "ok", "off" or "unavailable". Never raises.
    """
    if not getattr(settings, "ALLERGY_RXNORM_ENABLED", True):
        return [], "off"
    key = "allergy:rxnorm:" + _norm(term)
    hit = cache.get(key)
    if hit is not None:
        return hit, "ok"
    try:
        data = _rx_get("/approximateTerm.json", {"term": term, "maxEntries": 12})
        cands = (data.get("approximateGroup") or {}).get("candidate") or []
        rxcuis = []
        for c in cands:
            if c.get("rxcui") and c["rxcui"] not in rxcuis:
                rxcuis.append(c["rxcui"])
        with ThreadPoolExecutor(max_workers=4) as pool:
            found = list(pool.map(_rx_ingredient_for, rxcuis[:limit]))
        results, seen = [], set()
        for f in found:
            if f and f["display"] and f["code"] not in seen:
                seen.add(f["code"])
                results.append({"display": f["display"].title() if f["display"].islower() else f["display"],
                                "code": f["code"], "system": "rxnorm", "category": "medication",
                                "source": "rxnorm"})
        cache.set(key, results, RXNORM_CACHE_SECONDS)
        return results, "ok"
    except Exception as exc:  # network, timeout, bad JSON -- the form must keep working
        log.warning("RxNorm lookup failed for %r: %s", term, exc)
        return [], "unavailable"


def local_drug_matches(term, limit=8):
    t = _norm(term)
    names = {}
    for g in DRUG_GROUPS.values():
        names[_norm(g["label"])] = g["label"] + " (class)"
        for m in g["members"]:
            names[_norm(m)] = m.title()
    for s in SINGLE_INGREDIENTS:
        names[_norm(s)] = s.title()
    for brand, ings in BRANDS.items():
        names[_norm(brand)] = brand.title()
    ranked = sorted((k for k in names if t in k), key=lambda k: (not k.startswith(t), len(k), k))
    return [{"display": names[k], "code": "", "system": "", "category": "medication", "source": "local"}
            for k in ranked[:limit]]


def search_substances(term, category=""):
    term = (term or "").strip()
    if len(term) < 2:
        return {"results": [], "rxnorm": "idle"}
    t = _norm(term)
    results, state = [], "idle"
    if category in ("", "medication"):
        rx, state = rxnorm_search(term)
        results.extend(rx)
        have = {_norm(r["display"]) for r in results}
        results.extend(r for r in local_drug_matches(term) if _norm(r["display"]) not in have)
    if category in ("", "food", "environment", "biologic", "other"):
        matches = [c for c in catalog() if t in _norm(c["display"]) and (not category or c["category"] == category)]
        matches.sort(key=lambda c: (not _norm(c["display"]).startswith(t), len(c["display"]), c["display"]))
        results.extend({**c, "source": "catalog"} for c in matches[:12])
    return {"results": results[:25], "rxnorm": state}


# --------------------------------------------------------------------------
# saving: validate the coded part of an entry
# --------------------------------------------------------------------------

def clean_coding(data):
    """
    Pull category / code_system / code / reaction_type out of a request.
    Returns (fields dict, error). Free text with no code is always allowed.
    """
    category = str(data.get("category") or "").strip().lower()
    if category and category not in dict(CATEGORIES):
        return None, "Unknown category."
    system = str(data.get("code_system") or "").strip().lower()
    code = str(data.get("code") or "").strip()
    if system not in CODE_SYSTEMS:
        return None, "Code system must be rxnorm or snomed."
    if bool(system) != bool(code):
        return None, "Send both a code system and a code, or neither."
    if code and not re.fullmatch(r"[0-9]{1,18}", code):
        return None, "Codes are numeric."
    rtype = str(data.get("reaction_type") or "allergy").strip().lower()
    if rtype not in dict(REACTION_TYPES):
        return None, "Type must be allergy or intolerance."
    return {"category": category, "code_system": system, "code": code, "reaction_type": rtype}, None


# --------------------------------------------------------------------------
# FHIR AllergyIntolerance
# --------------------------------------------------------------------------

_FHIR_CATEGORY = {"medication": "medication", "food": "food", "environment": "environment", "biologic": "biologic"}
_CLINICAL = "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical"
_VERIFY = "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification"
NO_KNOWN_ALLERGY = ("716186003", "No known allergy")


def to_fhir(a, patient_ref):
    res = {
        "resourceType": "AllergyIntolerance",
        "id": str(a.pk),
        "clinicalStatus": {"coding": [{"system": _CLINICAL, "code": "active" if a.status == "active" else "inactive"}]},
        "verificationStatus": {"coding": [{"system": _VERIFY, "code": "confirmed"}]},
        "type": a.reaction_type or "allergy",
        "criticality": {"severe": "high", "moderate": "low", "mild": "low"}.get(a.severity, "unable-to-assess"),
        "code": {"text": a.substance},
        "patient": {"reference": patient_ref},
    }
    if a.category in _FHIR_CATEGORY:
        res["category"] = [_FHIR_CATEGORY[a.category]]
    if a.code_system in SYSTEM_URI and a.code:
        res["code"]["coding"] = [{"system": SYSTEM_URI[a.code_system], "code": a.code, "display": a.substance}]
    manifestations = []
    for r in a.reactions or []:
        m = {"text": r["display"]}
        if r.get("code"):
            m["coding"] = [{"system": SYSTEM_URI["snomed"], "code": r["code"], "display": r["display"]}]
        manifestations.append(m)
    if not manifestations and a.reaction:
        manifestations.append({"text": a.reaction})
    if manifestations:
        reaction = {"manifestation": manifestations}
        if a.severity in ("mild", "moderate", "severe"):
            reaction["severity"] = a.severity
        res["reaction"] = [reaction]
    if a.created_at:
        res["recordedDate"] = a.created_at.isoformat()
    return res


def fhir_bundle(patient, records, no_known):
    ref = f"Patient/{patient.pk}"
    entries = [{"resource": to_fhir(a, ref)} for a in records]
    if no_known and not any(a.status == "active" for a in records):
        code, display = NO_KNOWN_ALLERGY
        entries.append({"resource": {
            "resourceType": "AllergyIntolerance",
            "clinicalStatus": {"coding": [{"system": _CLINICAL, "code": "active"}]},
            "verificationStatus": {"coding": [{"system": _VERIFY, "code": "confirmed"}]},
            "code": {"coding": [{"system": SYSTEM_URI["snomed"], "code": code, "display": display}], "text": display},
            "patient": {"reference": ref},
        }})
    return {"resourceType": "Bundle", "type": "collection", "total": len(entries), "entry": entries}


# --------------------------------------------------------------------------
# views
# --------------------------------------------------------------------------

class _StaffView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if getattr(request.user, "role", None) not in STAFF_ROLES:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Not allowed.")


class AllergySubstanceSearchView(_StaffView):
    """GET /api/allergy-substances/?q=amox&category=medication"""

    def get(self, request):
        return Response(search_substances(request.query_params.get("q", ""), request.query_params.get("category", "")))


class AllergyReactionsView(_StaffView):
    """GET /api/allergy-reactions/ -> the choices the Allergies form offers."""

    def get(self, request):
        return Response({
            "reactions": reactions_list(),
            "severities": [{"value": "mild", "label": "Mild"}, {"value": "moderate", "label": "Moderate"},
                           {"value": "severe", "label": "Severe"}],
            "categories": [{"value": v, "label": l} for v, l in CATEGORIES],
            "types": [{"value": v, "label": l} for v, l in REACTION_TYPES],
        })


class AllergyCheckView(_StaffView):
    """POST /api/allergy-check/ {patient, name, code_system?, code?} -> {alerts: [...]}"""

    def post(self, request):
        from .patient_header import _patient_for

        patient, error = _patient_for(request, request.data.get("patient"))
        if error:
            return error
        name = str(request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Send the name of the drug."}, status=400)
        alerts = check_order(patient, name, str(request.data.get("code_system") or ""), str(request.data.get("code") or ""))
        return Response({"alerts": alerts})


class PatientAllergyFhirView(_StaffView):
    """GET /api/patient-header/<id>/allergies/fhir/ -> a FHIR Bundle of AllergyIntolerance."""

    def get(self, request, patient_id):
        from .models import PatientAllergy, PatientAllergyStatus
        from .patient_header import _patient_for

        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        records = list(PatientAllergy.objects.filter(patient=patient).order_by("status", "substance", "id"))
        nka = PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists()
        return Response(fhir_bundle(patient, records, nka), content_type="application/fhir+json")
