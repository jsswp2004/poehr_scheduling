"""
End-to-end tests for calculated items: the builders accept and validate a
calculation, the server stores the right total/interpretation on every save
(flowsheet columns and notes), and the CSV upload/download keeps calculations
intact. Uses a PHQ-9 -- nine 0-3 items, total, severity bands, and a caution on
item 9 -- as the reference case.
"""

import csv
import io
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .calculations import INTERPRETATION_SUFFIX
from .flowsheet_template_csv import parse_flowsheet_csv
from .flowsheet_template_import import apply_flowsheet_import, export_flowsheet_csv
from .models import (
    Appointment,
    ClinicalNote,
    Dictionary,
    FlowsheetRowDefinition,
    FlowsheetTemplate,
    NoteFieldDefinition,
    NoteTemplate,
)
from .note_template_csv import parse_template_csv
from .note_template_import import apply_template_import, export_template_csv

PHQ_KEYS = [f"phq9_q{i}" for i in range(1, 10)]
CAUTION = "Further assessment for suicide risk is needed."
BANDS = [
    {"min": 0, "max": 4, "label": "None-minimal"},
    {"min": 5, "max": 9, "label": "Mild"},
    {"min": 10, "max": 14, "label": "Moderate"},
    {"min": 15, "max": 19, "label": "Moderately severe"},
    {"min": 20, "max": 27, "label": "Severe"},
]


def phq_calc(**overrides):
    calc = {
        "operation": "sum",
        "sources": PHQ_KEYS,
        "require_all": True,
        "decimals": 0,
        "bands": BANDS,
        "alerts": [{"source": "phq9_q9", "min": 1, "message": CAUTION}],
    }
    calc.update(overrides)
    return calc


class Base(TestCase):
    @staticmethod
    def client_for(user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return client

    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(name="Clinic")
        self.admin = User.objects.create_user(
            username="adm", email="a@x.com", password="pw-12345-xyz", role="admin", organization=self.org
        )
        self.nurse = User.objects.create_user(
            username="nur", email="n@x.com", password="pw-12345-xyz", role="nurse", organization=self.org
        )
        self.patient = User.objects.create_user(
            username="pat", email="p@x.com", password="pw-12345-xyz", role="patient", organization=self.org
        )
        self.appt = Appointment.objects.create(
            organization=self.org,
            patient=self.patient,
            provider=self.nurse,
            title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        # Real JWTs (not force_authenticate): the tenant-scoped Appointment
        # manager only sees the user's organization when the request was
        # authenticated through TenantAwareJWTAuthentication.
        self.admin_client = self.client_for(self.admin)
        self.nurse_client = self.client_for(self.nurse)

        self.scores = Dictionary.objects.create(code="phq_scores", name="PHQ-9 scores")
        for n, label in enumerate(["Not at all", "Several days", "More than half the days", "Nearly every day"]):
            self.scores.items.create(value=str(n), label=label, sort_order=n)
        self.words = Dictionary.objects.create(code="words", name="Words")
        self.words.items.create(value="yes", label="Yes", sort_order=0)
        self.words.items.create(value="no", label="No", sort_order=1)


# ---------------------------------------------------------------- flowsheets


class FlowsheetBuilderTests(Base):
    def rows_payload(self, calc=None, extra=None):
        rows = [
            {
                "client_id": f"new-{k}",
                "section_label": "PHQ-9",
                "key": k,
                "label": k.upper(),
                "field_type": "dropdown",
                "dictionary": self.scores.id,
            }
            for k in PHQ_KEYS
        ]
        rows.append(
            {
                "client_id": "new-total",
                "section_label": "PHQ-9",
                "key": "phq9_total",
                "label": "Total score",
                "field_type": "calculated",
                "calc": calc or phq_calc(),
            }
        )
        return rows + (extra or [])

    def create(self, rows=None, code="phq9"):
        return self.admin_client.post(
            "/api/admin/flowsheet-templates/",
            {"code": code, "name": "PHQ-9", "is_active": True, "sort_order": 0, "rows": rows or self.rows_payload()},
            format="json",
        )

    def test_builder_saves_and_returns_the_calculation(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        row = FlowsheetRowDefinition.objects.get(template__code="phq9", key="phq9_total")
        self.assertEqual(row.field_type, "calculated")
        self.assertEqual(row.calc["operation"], "sum")
        self.assertEqual(row.calc["alerts"][0]["message"], CAUTION)
        self.assertIsNone(row.dictionary)
        # the grouped read the panel and the editor use carries calc, id and dictionary
        read = self.admin_client.get("/api/admin/flowsheet-templates/phq9/").json()
        rows = read["row_definitions"][0]["rows"]
        total = next(x for x in rows if x["key"] == "phq9_total")
        self.assertEqual(total["calc"]["bands"][4]["label"], "Severe")
        q1 = next(x for x in rows if x["key"] == "phq9_q1")
        self.assertEqual(q1["dictionary"], self.scores.id)
        self.assertIsNotNone(q1["id"])
        self.assertEqual(len(q1["options"]), 4)

    def test_changing_the_calculation_bumps_the_version_but_a_label_does_not(self):
        self.create()
        t = FlowsheetTemplate.objects.get(code="phq9")
        self.assertEqual(t.version, 1)
        rows = self.rows_payload()
        for r in rows:  # re-send existing rows by their real ids
            r["client_id"] = str(FlowsheetRowDefinition.objects.get(template=t, key=r["key"]).id)
        rows[-1]["label"] = "PHQ-9 total"
        r = self.admin_client.put(
            "/api/admin/flowsheet-templates/phq9/",
            {"code": "phq9", "name": "PHQ-9", "is_active": True, "sort_order": 0, "rows": rows},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        t.refresh_from_db()
        self.assertEqual(t.version, 1)
        rows[-1]["calc"] = phq_calc(decimals=1)
        r = self.admin_client.put(
            "/api/admin/flowsheet-templates/phq9/",
            {"code": "phq9", "name": "PHQ-9", "is_active": True, "sort_order": 0, "rows": rows},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        t.refresh_from_db()
        self.assertEqual(t.version, 2)
        self.assertTrue(r.json()["version_bumped"])

    def test_rejects_a_source_that_comes_later(self):
        rows = self.rows_payload()
        total = rows.pop()
        rows.insert(0, total)  # total before the questions it sums
        r = self.create(rows)
        self.assertEqual(r.status_code, 400)
        self.assertIn("earlier", str(r.json()))

    def test_rejects_a_dictionary_whose_values_are_not_numbers(self):
        rows = self.rows_payload()
        rows[0]["dictionary"] = self.words.id
        r = self.create(rows)
        self.assertEqual(r.status_code, 400)
        self.assertIn("aren't all numbers", str(r.json()))

    def test_rejects_overlapping_bands_and_missing_calc(self):
        r = self.create(self.rows_payload(calc=phq_calc(bands=[{"min": 0, "max": 5, "label": "A"}, {"min": 5, "max": 9, "label": "B"}])))
        self.assertEqual(r.status_code, 400)
        rows = self.rows_payload()
        rows[-1].pop("calc")
        self.assertEqual(self.create(rows).status_code, 400)

    def test_rejects_reserved_key_ending(self):
        rows = self.rows_payload()
        rows[0]["key"] = "phq9_q1__interpretation"
        self.assertEqual(self.create(rows).status_code, 400)

    def test_non_admin_cannot_build(self):
        r = self.nurse_client.post(
            "/api/admin/flowsheet-templates/",
            {"code": "x", "name": "X", "rows": self.rows_payload()},
            format="json",
        )
        self.assertEqual(r.status_code, 403)


class FlowsheetChartingTests(Base):
    def setUp(self):
        super().setUp()
        self.template = FlowsheetTemplate.objects.create(code="phq9", name="PHQ-9")
        for i, k in enumerate(PHQ_KEYS):
            FlowsheetRowDefinition.objects.create(
                template=self.template, section_label="PHQ-9", key=k, label=k, field_type="dropdown",
                dictionary=self.scores, sort_order=i * 10,
            )
        FlowsheetRowDefinition.objects.create(
            template=self.template, section_label="PHQ-9", key="phq9_total", label="Total",
            field_type="calculated", calc=phq_calc(), sort_order=100,
        )
        self.columns = [{"id": "c1", "timestamp": "2026-10-01T10:00:00Z"}, {"id": "c2", "timestamp": "2026-10-08T10:00:00Z"}]

    def answers(self, col, scores):
        return {k: {col: str(s)} for k, s in zip(PHQ_KEYS, scores)}

    def post(self, data):
        return self.nurse_client.post(
            "/api/vital-signs-flowsheets/",
            {"appointment": self.appt.id, "template": self.template.id, "columns": self.columns, "data": data},
            format="json",
        )

    def test_total_and_interpretation_are_stored_per_column(self):
        data = self.answers("c1", [1] * 7 + [0, 0])
        for k, cells in self.answers("c2", [3] * 9).items():
            data[k].update(cells)
        r = self.post(data)
        self.assertEqual(r.status_code, 201, r.content)
        saved = r.json()["data"]
        self.assertEqual(saved["phq9_total"], {"c1": "7", "c2": "27"})
        self.assertEqual(saved["phq9_total" + INTERPRETATION_SUFFIX], {"c1": "Mild", "c2": "Severe"})

    def test_client_cannot_set_a_total(self):
        data = self.answers("c1", [1] * 9)
        data["phq9_total"] = {"c1": "0"}
        data["phq9_total" + INTERPRETATION_SUFFIX] = {"c1": "None-minimal"}
        saved = self.post(data).json()["data"]
        self.assertEqual(saved["phq9_total"]["c1"], "9")
        self.assertEqual(saved["phq9_total" + INTERPRETATION_SUFFIX]["c1"], "Mild")

    def test_incomplete_column_has_no_total(self):
        data = self.answers("c1", [1] * 8)
        data["phq9_total"] = {"c1": "8"}
        saved = self.post(data).json()["data"]
        self.assertNotIn("phq9_total", saved)
        self.assertNotIn("phq9_total" + INTERPRETATION_SUFFIX, saved)

    def test_patch_recomputes_and_clears(self):
        r = self.post(self.answers("c1", [1] * 9))
        fid = r.json()["id"]
        data = r.json()["data"]
        data["phq9_q3"]["c1"] = "3"
        r = self.nurse_client.patch(f"/api/vital-signs-flowsheets/{fid}/", {"data": data}, format="json")
        self.assertEqual(r.json()["data"]["phq9_total"]["c1"], "11")
        self.assertEqual(r.json()["data"]["phq9_total" + INTERPRETATION_SUFFIX]["c1"], "Moderate")
        data = r.json()["data"]
        data["phq9_q3"]["c1"] = ""
        r = self.nurse_client.patch(f"/api/vital-signs-flowsheets/{fid}/", {"data": data}, format="json")
        self.assertNotIn("phq9_total", r.json()["data"])

    def test_flowsheet_without_calculated_rows_is_untouched(self):
        plain = FlowsheetTemplate.objects.create(code="plain", name="Plain")
        FlowsheetRowDefinition.objects.create(template=plain, section_label="S", key="hr", label="HR", field_type="numeric")
        data = {"hr": {"c1": "72"}}
        r = self.nurse_client.post(
            "/api/vital-signs-flowsheets/",
            {"appointment": self.appt.id, "template": plain.id, "columns": self.columns, "data": data},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["data"], data)


# --------------------------------------------------------------------- notes


class NoteBuilderTests(Base):
    def fields_payload(self, calc=None):
        fields = [
            {"client_id": f"new-{k}", "section_label": "PHQ-9", "key": k, "label": k.upper(),
             "field_type": "radio", "dictionary": self.scores.id}
            for k in PHQ_KEYS
        ]
        fields.append(
            {"client_id": "new-total", "section_label": "PHQ-9", "key": "phq9_total", "label": "Total score",
             "field_type": "calculated", "calc": calc or phq_calc()}
        )
        return fields

    def create(self, fields=None, code="phq9_note"):
        return self.admin_client.post(
            "/api/admin/note-templates/",
            {"code": code, "name": "PHQ-9 note", "kind": "note", "is_active": True, "fields": fields or self.fields_payload()},
            format="json",
        )

    def test_builder_saves_a_calculated_field(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        f = NoteFieldDefinition.objects.get(template__code="phq9_note", key="phq9_total")
        self.assertEqual(f.field_type, "calculated")
        self.assertEqual(f.calc["bands"][0]["label"], "None-minimal")
        read = self.nurse_client.get("/api/note-templates/phq9_note/").json()
        total = next(x for x in read["fields"] if x["key"] == "phq9_total")
        self.assertEqual(total["calc"]["operation"], "sum")

    def test_changing_the_calculation_bumps_the_version(self):
        self.create()
        t = NoteTemplate.objects.get(code="phq9_note")
        fields = self.fields_payload()
        for f in fields:
            f["client_id"] = str(NoteFieldDefinition.objects.get(template=t, key=f["key"]).id)
        fields[-1]["calc"] = phq_calc(bands=BANDS[:2])
        r = self.admin_client.put(
            "/api/admin/note-templates/phq9_note/",
            {"code": "phq9_note", "name": "PHQ-9 note", "kind": "note", "is_active": True, "fields": fields},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        t.refresh_from_db()
        self.assertEqual(t.version, 2)

    def test_rejects_non_numeric_dictionary_and_forward_reference(self):
        fields = self.fields_payload()
        fields[2]["dictionary"] = self.words.id
        self.assertEqual(self.create(fields).status_code, 400)
        fields = self.fields_payload()
        fields.insert(0, fields.pop())
        self.assertEqual(self.create(fields).status_code, 400)

    def test_note_saves_a_server_computed_total_and_snapshots_the_calculation(self):
        self.create()
        values = {k: "2" for k in PHQ_KEYS}
        values["phq9_total"] = "0"  # a client can't fake the total
        r = self.nurse_client.post(
            "/api/clinical-notes/",
            {"appointment": self.appt.id, "note_type": "nursing_assessment",
             "documentation_type": "phq9_note", "structured_data": values},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["structured_data"]["phq9_total"], "18")
        self.assertEqual(body["structured_data"]["phq9_total" + INTERPRETATION_SUFFIX], "Moderately severe")
        snap_total = next(f for f in body["template_detail"]["fields"] if f["key"] == "phq9_total")
        self.assertEqual(snap_total["calc"]["operation"], "sum")

        # editing the draft recomputes
        values["phq9_q1"] = "0"
        r = self.nurse_client.patch(f"/api/clinical-notes/{body['id']}/", {"structured_data": values}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["structured_data"]["phq9_total"], "16")
        # clearing an answer removes the total
        values["phq9_q2"] = ""
        r = self.nurse_client.patch(f"/api/clinical-notes/{body['id']}/", {"structured_data": values}, format="json")
        self.assertNotIn("phq9_total", r.json()["structured_data"])
        self.assertEqual(ClinicalNote.objects.count(), 1)


# ----------------------------------------------------------------------- CSV


def flowsheet_csv(*lines):
    header = "Code,Name,Section,Key,Label,Unit,Row Type,Value,Calculation"
    return "\r\n".join([header, *lines]) + "\r\n"


class CsvTests(Base):
    PHQ_LINES = [
        f'phq9,PHQ-9,PHQ-9,{k},{k},,Dropdown,"0=Not at all|1=Several days|2=More than half the days|3=Nearly every day",'
        for k in PHQ_KEYS
    ]

    def calc_line(self, calc_json):
        calc_json = calc_json.replace('"', '""')
        return f'phq9,PHQ-9,PHQ-9,phq9_total,Total score,,Calculated,,"{calc_json}"'

    SIMPLE = '{"operation":"sum","sources":["phq9_q1","phq9_q2"],"decimals":0,"bands":[{"min":0,"max":3,"label":"Low"},{"min":4,"label":"High"}]}'

    def test_flowsheet_round_trip_keeps_calculation_and_version(self):
        text = flowsheet_csv(*self.PHQ_LINES, self.calc_line(self.SIMPLE))
        parsed, errors = parse_flowsheet_csv(text)
        self.assertEqual(errors, [])
        result = apply_flowsheet_import(parsed)
        self.assertTrue(result["created"])
        row = FlowsheetRowDefinition.objects.get(template__code="phq9", key="phq9_total")
        self.assertEqual(row.calc["bands"][1], {"min": 4, "max": None, "label": "High"})
        exported = export_flowsheet_csv(result["template"])
        self.assertIn("Calculation", exported.splitlines()[0])
        again = apply_flowsheet_import(parse_flowsheet_csv(exported)[0])
        self.assertFalse(again["version_bumped"])
        self.assertEqual(export_flowsheet_csv(again["template"]), exported)

    def test_changing_the_calculation_in_the_csv_bumps_the_version(self):
        apply_flowsheet_import(parse_flowsheet_csv(flowsheet_csv(*self.PHQ_LINES, self.calc_line(self.SIMPLE)))[0])
        changed = self.SIMPLE.replace('"max":3', '"max":2')
        result = apply_flowsheet_import(parse_flowsheet_csv(flowsheet_csv(*self.PHQ_LINES, self.calc_line(changed)))[0])
        self.assertTrue(result["version_bumped"])

    def test_flowsheet_without_calculated_rows_has_no_calculation_column(self):
        parsed, _ = parse_flowsheet_csv(flowsheet_csv(self.PHQ_LINES[0]))
        result = apply_flowsheet_import(parsed)
        self.assertNotIn("Calculation", export_flowsheet_csv(result["template"]).splitlines()[0])

    def test_flowsheet_csv_errors(self):
        cases = {
            "not json": self.calc_line("{nope"),
            "source later": f'phq9,PHQ-9,PHQ-9,early_total,Early,,Calculated,,"{self.SIMPLE.replace(chr(34), chr(34) * 2)}"',
            "unknown source": self.calc_line(self.SIMPLE.replace("phq9_q2", "ghost")),
            "missing calc": "phq9,PHQ-9,PHQ-9,phq9_total,Total,,Calculated,,",
        }
        for name, line in cases.items():
            with self.subTest(name):
                lines = [line, *self.PHQ_LINES[:2]] if name == "source later" else [*self.PHQ_LINES[:2], line]
                parsed, errors = parse_flowsheet_csv(flowsheet_csv(*lines))
                self.assertIsNone(parsed)
                self.assertTrue(any(e["column"] == "Calculation" for e in errors), errors)

    def test_calculation_must_be_blank_on_a_normal_row(self):
        line = 'phq9,PHQ-9,PHQ-9,a,A,,Numeric,,"{""operation"":""sum""}"'
        parsed, errors = parse_flowsheet_csv(flowsheet_csv(line))
        self.assertIsNone(parsed)
        self.assertEqual(errors[0]["column"], "Calculation")

    def test_note_round_trip_keeps_calculation(self):
        header = "Code,Name,Tab name,Section,Key,Label,Field Type,Required,Help Text,Depends on,Value,Calculation"
        lines = [header]
        for k in PHQ_KEYS:
            lines.append(f'phq9_note,PHQ-9 note,,PHQ-9,{k},{k},Radio Button (dictionary),FALSE,,,"0=Not at all|1=Several days|2=More|3=Nearly",')
        calc = self.SIMPLE.replace('"', '""')
        lines.append(f'phq9_note,PHQ-9 note,,PHQ-9,phq9_total,Total,Calculated (total / result),FALSE,,,,"{calc}"')
        text = "\r\n".join(lines) + "\r\n"
        parsed, errors = parse_template_csv(text)
        self.assertEqual(errors, [])
        result = apply_template_import(parsed)
        f = NoteFieldDefinition.objects.get(template__code="phq9_note", key="phq9_total")
        self.assertEqual(f.field_type, "calculated")
        self.assertEqual(f.calc["sources"], ["phq9_q1", "phq9_q2"])
        exported = export_template_csv(result["template"])
        again = apply_template_import(parse_template_csv(exported)[0])
        self.assertFalse(again["version_bumped"])
        self.assertEqual(export_template_csv(again["template"]), exported)
        rows = list(csv.reader(io.StringIO(exported)))
        self.assertEqual(rows[0][-1], "Calculation")

    def test_note_csv_rejects_a_non_numeric_dictionary_source(self):
        header = "Code,Name,Tab name,Section,Key,Label,Field Type,Required,Help Text,Depends on,Value,Calculation"
        calc = '{"operation":"sum","sources":["q"]}'.replace('"', '""')
        text = "\r\n".join(
            [
                header,
                'n,N,,S,q,Q,Radio Button (dictionary),FALSE,,,"yes=Yes|no=No",',
                f'n,N,,S,t,Total,Calculated (total / result),FALSE,,,,"{calc}"',
            ]
        )
        parsed, errors = parse_template_csv(text)
        self.assertIsNone(parsed)
        self.assertIn("aren't all numbers", errors[0]["message"])
