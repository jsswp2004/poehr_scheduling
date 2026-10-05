# POWER lab results interface

How a lab (or the interface engine in front of it) sends results into POWER.
This is a paid per-clinic add-on: it works only for organizations whose
`lab_interface_enabled` switch is on (set by a system admin).

## 1. Give the clinic a connection and a key

```
python manage.py lab_connection create --org <ORG_ID> --name "Quest" --lab "Quest Diagnostics" --enable
python manage.py lab_connection list
python manage.py lab_connection rotate  --id <ID>     # new key; the old one stops working
python manage.py lab_connection disable --id <ID>
```

The key (starts `lab_`) is printed once. Only a hash is stored. One
connection belongs to one clinic: a result arriving on a connection can only
ever be filed to that clinic's patients.

## 2. Endpoints

| Format | URL | Body | Reply |
|---|---|---|---|
| HL7 v2 ORU^R01 | `POST https://<api-host>/api/lab-interface/hl7/` | raw HL7 text, segments separated by CR (LF also accepted; MLLP framing bytes are ignored) | HL7 ACK, `text/plain` |
| FHIR R4 | `POST https://<api-host>/api/lab-interface/fhir/` | a `Bundle` (Patient, DiagnosticReport, Observation) as JSON | `OperationOutcome`-style JSON |

Header on every call: `X-Interface-Key: <key>`. Body limit 5 MB.

The host accepts HTTPS only, not raw TCP/MLLP. A lab that sends MLLP needs an
interface engine (e.g. Mirth Connect) that receives MLLP and re-posts the
message to the URL above, or an aggregator that can post over HTTPS.

## 3. Replies and what the sender should do

| HTTP | HL7 ACK | Meaning | Sender |
|---|---|---|---|
| 200 | `AA` | Accepted. Includes results held for staff to match, and duplicates. | Done, do not resend |
| 400 | `AR` | Not a readable ORU / missing PID or OBR / bad JSON | Fix, do not retry as is |
| 401 | none | Missing, wrong or disabled key | Check the key |
| 403 | `AR` | Add-on is not enabled for this clinic | Contact the clinic |
| 413 | `AR` | Body over 5 MB | Split |
| 5xx | none | Our side failed | Retry later (safe: duplicates are ignored) |

## 4. What the message should contain

- **MSH-10 message control id**, unique per message from that sender. A repeat is
  acknowledged but not filed again. (No control id: a hash of the body is used.)
- **Patient**: PID-3 should carry the **MRN we gave the clinic** (shown as MRN-000123 on
  the chart). PID-5 name and PID-7 date of birth are always checked.
- **Order**: OBR-2 (placer order number) should echo our order number, `ORD-00000123`
  form. This links the result to the order and completes it when final.
- **Lab report id**: OBR-3 (filler order number / accession). The same accession sent
  again updates the existing report (preliminary to final, or a correction) instead of
  creating a second one. A changed result resets any earlier review so it is looked at again.
- **Results**: one OBX per value with value, units, reference range and abnormal flags
  (H, L, HH, LL, A, and `<` `>`). LOINC in OBX-3 is kept. Result status in OBR-25 / OBX-11:
  F final, P preliminary, C corrected, X cancelled (marks the report entered in error).
- Embedded PDFs / images (OBX type ED/RP) are **not imported**; the report gets a note that
  the lab also sent a document. Use scan upload for the paper copy.
- Several OBR groups in one message become several reports for the one patient.
- Times without a time zone are read in the server's time zone.

## 5. How a result is matched (conservative on purpose)

1. Our order number (OBR-2) finds the order and its patient.
2. The MRN finds a patient in this clinic.
3. If neither, an **exact** last name + first name + date of birth, only when exactly one
   patient in the clinic matches.

A result is **not** filed automatically when: order and MRN point to different patients,
the date of birth differs from the chart, the MRN or name+DOB matches more than one
patient, or nothing matches. These are kept (the lab still gets `AA`) and appear in the
Lab Results inbox under "Results waiting for a patient" for staff with the
`lab_results.enter` right, who either assign it by MRN or dismiss it with a reason.
Every filed report records where it came from, and each message is kept as received.

## 6. Quick test

```
curl -X POST https://<api-host>/api/lab-interface/hl7/ \
  -H "X-Interface-Key: lab_xxx" -H "Content-Type: text/plain" \
  --data-binary $'MSH|^~\\&|QUEST|QDX|POWER|CLINIC|20261001101500||ORU^R01|T1|P|2.5.1\rPID|1||MRN-000001^^^CLINIC^MR||DOE^JANE||19800115|F\rOBR|1||ACC1|80048^BMP^CPT|||20261001080000|||||||||||||||20261001101000|||F\rOBX|1|NM|2823-3^Potassium^LN||5.4|mmol/L|3.5-5.0|H|||F\r'
```

Expect `MSA|AA|T1`. Use a test patient's real MRN; a made-up one lands in the waiting list.
