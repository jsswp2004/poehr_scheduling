"""
A pretend lab, for testing the lab interface without a real lab.

It does what a lab's interface engine does, against the real endpoints:
  1. pulls the orders waiting for it            GET  /api/lab-interface/orders/
  2. confirms each one                          POST /api/lab-interface/orders/ack/
  3. sends results back for them                POST /api/lab-interface/hl7/ (or /fhir/)
and checks that POWER answered the way it should. Run it from the command line
(manage.py lab_simulator) against a local or staging server, or in tests.

It reads our order message the way a lab would (it does not reuse our own
builders), so it also catches an order message a lab could not read.
"""

import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

SCENARIOS = {
    "normal": "All values in range; one final report.",
    "abnormal": "A high potassium: filed, flagged abnormal, waits for review.",
    "critical": "A critical potassium (HH): filed, flagged critical.",
    "prelim_final": "A preliminary report, then the final: one report, updated.",
    "correction": "A final report, then a corrected one with a different value.",
    "cancel": "A final report, then the lab cancels it: marked entered in error.",
    "duplicate": "The same message sent twice: filed once, both acknowledged.",
    "unknown_patient": "A result for someone POWER does not have: held for staff, lab still gets AA.",
    "dob_mismatch": "Right MRN, wrong date of birth: held for staff, not filed.",
    "name_mismatch": "Right MRN and date of birth, different last name: held for staff, not filed.",
    "fhir": "A normal result sent as a FHIR bundle instead of HL7.",
    "bad_key": "A wrong key: refused with 401.",
}


# ---------------------------------------------------------------- transports

class HttpTransport:
    def __init__(self, base_url, key, timeout=30):
        self.base, self.key, self.timeout = base_url.rstrip("/"), key, timeout

    def request(self, method, path, body=None, content_type="text/plain", key=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("X-Interface-Key", self.key if key is None else key)
        if data is not None:
            req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace")


class ClientTransport:
    """The same calls through a Django test client (used by the automated tests)."""

    def __init__(self, client, key):
        self.client, self.key = client, key

    def request(self, method, path, body=None, content_type="text/plain", key=None):
        extra = {"HTTP_X_INTERFACE_KEY": self.key if key is None else key}
        if method == "GET":
            r = self.client.get(path, **extra)
        else:
            r = self.client.post(path, data=body or "", content_type=content_type, **extra)
        return r.status_code, r.content.decode("utf-8", "replace")


# ---------------------------------------------------------------- reading an order the way a lab does

@dataclass
class LabOrder:
    control_id: str
    placer: str
    mrn: str
    last: str
    first: str
    dob: str
    sex: str
    code: str
    test_name: str
    action: str


def read_order(message):
    """Pull the fields a lab needs out of an ORM^O01. Raises ValueError if they are missing."""
    segs = {}
    for line in re.split(r"[\r\n]+", message["body"]):
        if line:
            segs.setdefault(line[:3], line.split("|"))
    for need in ("MSH", "PID", "ORC", "OBR"):
        if need not in segs:
            raise ValueError(f"order message has no {need} segment")
    pid, orc, obr = segs["PID"], segs["ORC"], segs["OBR"]
    get = lambda seg, i: seg[i] if len(seg) > i else ""
    mrn = get(pid, 3).split("^")[0]
    name = get(pid, 5).split("^")
    placer = get(orc, 2)
    if not (mrn and placer):
        raise ValueError("order message lacks the MRN or the order number")
    test = get(obr, 4).split("^")
    return LabOrder(
        control_id=message["control_id"], placer=placer, mrn=mrn, last=name[0], first=name[1] if len(name) > 1 else "",
        dob=get(pid, 7), sex=get(pid, 8), code=test[0], test_name=test[1] if len(test) > 1 else test[0], action=get(orc, 1),
    )


# ---------------------------------------------------------------- building results

def _oru(order, control, status, values, filler, mrn=None, last=None, first=None, dob=None, placer=None):
    now = datetime.now().strftime("%Y%m%d%H%M%S")
    obx = []
    for i, (code, name, value, units, rng, flag) in enumerate(values, 1):
        obx.append(f"OBX|{i}|NM|{code}^{name}^LN||{value}|{units}|{rng}|{flag}|||{status}")
    segs = [
        f"MSH|^~\\&|SIMLAB|SIM|POWER|CLINIC|{now}||ORU^R01|{control}|P|2.5.1",
        f"PID|1||{mrn or order.mrn}^^^POWER^MR||{last or order.last}^{first or order.first}||{dob or order.dob}|{order.sex or 'U'}",
        f"ORC|RE|{order.placer if placer is None else placer}|{filler}",
        f"OBR|1|{order.placer if placer is None else placer}|{filler}|{order.code}^{order.test_name}^L|||{now}|||||||||||||||{now}|||{status}",
        *obx,
    ]
    return "\r".join(segs) + "\r"


NORMAL = [("2823-3", "Potassium", "4.1", "mmol/L", "3.5-5.0", ""), ("2951-2", "Sodium", "140", "mmol/L", "135-145", "")]
HIGH_K = [("2823-3", "Potassium", "5.9", "mmol/L", "3.5-5.0", "H"), ("2951-2", "Sodium", "140", "mmol/L", "135-145", "")]
CRIT_K = [("2823-3", "Potassium", "7.1", "mmol/L", "3.5-5.0", "HH"), ("2951-2", "Sodium", "140", "mmol/L", "135-145", "")]
FIXED_K = [("2823-3", "Potassium", "4.9", "mmol/L", "3.5-5.0", ""), ("2951-2", "Sodium", "140", "mmol/L", "135-145", "")]


def _fhir(order, control, filler, values):
    obs = []
    for i, (code, name, value, units, rng, flag) in enumerate(values, 1):
        lo, hi = (rng.split("-") + [None])[:2] if "-" in rng else (None, None)
        o = {"resourceType": "Observation", "id": f"o{i}", "status": "final",
             "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": name}]},
             "valueQuantity": {"value": float(value), "unit": units}}
        if lo and hi:
            o["referenceRange"] = [{"low": {"value": float(lo)}, "high": {"value": float(hi)}}]
        if flag:
            o["interpretation"] = [{"coding": [{"code": flag}]}]
        obs.append(o)
    dob = f"{order.dob[:4]}-{order.dob[4:6]}-{order.dob[6:8]}" if len(order.dob) == 8 else None
    patient = {"resourceType": "Patient", "id": "p1", "identifier": [{"value": order.mrn}],
               "name": [{"family": order.last, "given": [order.first]}]}
    if dob:
        patient["birthDate"] = dob
    report = {"resourceType": "DiagnosticReport", "id": "r1", "status": "final", "identifier": [{"value": filler}],
              "code": {"text": order.test_name}, "subject": {"reference": "Patient/p1"},
              "result": [{"reference": f"Observation/o{i}"} for i in range(1, len(obs) + 1)]}
    return json.dumps({"resourceType": "Bundle", "id": control, "type": "message",
                       "entry": [{"resource": patient}] + [{"resource": o} for o in obs] + [{"resource": report}]})


# ---------------------------------------------------------------- running

@dataclass
class Check:
    scenario: str
    step: str
    ok: bool
    detail: str = ""


@dataclass
class Report:
    checks: list = field(default_factory=list)
    pulled: int = 0

    def add(self, scenario, step, ok, detail=""):
        self.checks.append(Check(scenario, step, bool(ok), detail))

    @property
    def passed(self):
        return all(c.ok for c in self.checks)


def _ack_code(text):
    m = re.search(r"MSA\|(\w\w)\|([^|\r\n]*)(?:\|([^\r\n]*))?", text or "")
    return (m.group(1), m.group(3) or "") if m else ("", text or "")


def _send_hl7(t, report, scenario, step, msg, expect_http=200, expect_ack="AA", expect_text=None):
    status, text = t.request("POST", "/api/lab-interface/hl7/", msg)
    code, detail = _ack_code(text)
    ok = status == expect_http and (expect_ack is None or code == expect_ack) and (not expect_text or expect_text in detail)
    report.add(scenario, step, ok, f"HTTP {status}, ACK {code or '-'}: {detail}".strip())
    return ok


def run_scenario(t, report, name, order, stamp):
    n = [0]

    def cid():
        n[0] += 1
        return f"SIM{stamp}{name[:4].upper()}{order.placer[-6:]}{n[0]}"

    filler = f"SIM-{stamp}-{order.placer[-6:]}"
    if name == "normal":
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", NORMAL, filler), expect_text="Filed 1")
    elif name == "abnormal":
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", HIGH_K, filler), expect_text="Filed 1")
    elif name == "critical":
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", CRIT_K, filler), expect_text="Filed 1")
    elif name == "prelim_final":
        _send_hl7(t, report, name, "send preliminary", _oru(order, cid(), "P", NORMAL, filler), expect_text="Filed 1")
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", NORMAL, filler), expect_text="Filed 1")
    elif name == "correction":
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", HIGH_K, filler), expect_text="Filed 1")
        _send_hl7(t, report, name, "send correction", _oru(order, cid(), "C", FIXED_K, filler), expect_text="Filed 1")
    elif name == "cancel":
        _send_hl7(t, report, name, "send final", _oru(order, cid(), "F", NORMAL, filler))
        _send_hl7(t, report, name, "send cancellation", _oru(order, cid(), "X", NORMAL, filler))
    elif name == "duplicate":
        same = _oru(order, cid(), "F", NORMAL, filler)
        _send_hl7(t, report, name, "send", same, expect_text="Filed 1")
        _send_hl7(t, report, name, "send again", same, expect_text="Duplicate")
    elif name == "unknown_patient":
        _send_hl7(t, report, name, "send", _oru(order, cid(), "F", NORMAL, filler, mrn="NOT-A-MRN", last="Nobody", first="Test", dob="19010101", placer=""),
                  expect_text="No patient")
    elif name == "dob_mismatch":
        _send_hl7(t, report, name, "send", _oru(order, cid(), "F", NORMAL, filler, dob="19010101"), expect_text="date of birth")
    elif name == "name_mismatch":
        _send_hl7(t, report, name, "send", _oru(order, cid(), "F", NORMAL, filler, last="Someoneelse"), expect_text="last name")
    elif name == "fhir":
        status, text = t.request("POST", "/api/lab-interface/fhir/", _fhir(order, cid(), filler, NORMAL), "application/json")
        try:
            body = json.loads(text)
        except ValueError:
            body = {}
        report.add(name, "send bundle", status == 200 and body.get("status") == "processed", f"HTTP {status}, {body.get('status') or text[:80]}")
    else:
        raise ValueError(f"unknown scenario {name!r}")


def run(t, scenarios=("normal",), wait=0):
    """
    One pass: pull orders, confirm them, answer each with the scenarios (order i gets
    scenario i, cycling), and check every reply. Also checks the bad-key refusal.
    """
    report = Report()
    scenarios = list(scenarios)
    stamp = time.strftime("%H%M%S")

    if "bad_key" in scenarios:
        status, _ = t.request("POST", "/api/lab-interface/hl7/", "MSH|^~\\&|X", key="definitely-wrong")
        report.add("bad_key", "send with wrong key", status == 401, f"HTTP {status}")
        scenarios.remove("bad_key")

    status, text = t.request("GET", "/api/lab-interface/orders/?fmt=hl7")
    if status != 200:
        report.add("orders", "pull", False, f"HTTP {status}: {text[:150]}")
        return report
    messages = json.loads(text)["messages"]
    report.pulled = len(messages)
    new_orders = []
    for m in messages:
        try:
            order = read_order(m)
        except ValueError as exc:
            report.add("orders", f"read {m['control_id']}", False, str(exc))
            continue
        status, text = t.request("POST", "/api/lab-interface/orders/ack/",
                                 json.dumps({"control_id": m["control_id"], "status": "accepted"}), "application/json")
        report.add("orders", f"confirm {m['control_id']} ({order.action})", status == 200, f"HTTP {status}")
        if order.action == "NW":
            new_orders.append(order)

    if scenarios and not new_orders:
        report.add("orders", "orders to answer", False, "No new orders were waiting. Sign a lab order in POWER first (or use --seed).")
    for i, order in enumerate(new_orders):
        if not scenarios:
            break
        name = scenarios[i % len(scenarios)]
        run_scenario(t, report, name, order, stamp)
    return report
