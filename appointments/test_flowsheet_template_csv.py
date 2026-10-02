"""
Tests for the flowsheet template CSV upload/download (flowsheet builder).

The Vital Signs sample shipped with the feature (flowsheet_template_csv.sample_csv_text)
is the reference: it must parse cleanly, import into the database, and export
back to exactly the same CSV.
"""

import csv
import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from users.models import Organization

from .flowsheet_template_csv import (
    COLUMNS,
    SAMPLE_CODE,
    build_csv_text,
    parse_flowsheet_csv,
    sample_csv_text,
)
from .flowsheet_template_import import apply_flowsheet_import, export_flowsheet_csv
from .models import Dictionary, FlowsheetRowDefinition, FlowsheetTemplate

HEADER = ",".join(COLUMNS)


def csv_of(*lines):
    return "\r\n".join([HEADER, *lines]) + "\r\n"


class ParserTests(SimpleTestCase):
    def test_sample_parses_cleanly(self):
        parsed, errors = parse_flowsheet_csv(sample_csv_text())
        self.assertEqual(errors, [])
        self.assertEqual(parsed["code"], SAMPLE_CODE)
        self.assertEqual(len(parsed["rows"]), 11)
        pain = next(r for r in parsed["rows"] if r["key"] == "pain_score")
        self.assertEqual(pain["field_type"], "dropdown")
        self.assertEqual(len(pain["options"]), 11)

    def test_bare_option_labels_get_a_derived_value(self):
        parsed, errors = parse_flowsheet_csv(csv_of("fs,FS,Vitals,loc,Location,,Dropdown,Left arm|Right arm"))
        self.assertEqual(errors, [])
        self.assertEqual(parsed["rows"][0]["options"], [("left_arm", "Left arm"), ("right_arm", "Right arm")])

    def test_empty_file_and_missing_columns(self):
        self.assertEqual(parse_flowsheet_csv("")[1][0]["message"], "The file is empty.")
        _, errors = parse_flowsheet_csv("Code,Name\r\nx,y\r\n")
        self.assertIn("Missing column", errors[0]["message"])

    def test_header_only_is_rejected(self):
        _, errors = parse_flowsheet_csv(csv_of())
        self.assertIn("at least one row", errors[0]["message"])

    def test_row_problems_are_reported_by_row_and_column(self):
        text = csv_of(
            "fs,FS,Vitals,hr,Heart Rate,bpm,Numeric,",
            "other,FS2,Vitals,hr,Pulse,bpm,Numeric,",       # code/name differ, duplicate key
            "fs,FS,,bad key,,toolong" + "x" * 40 + ",Weird,",  # section, key, label, unit, type
            "fs,FS,Vitals,t1,Temp,F,Numeric,a=b",            # value on numeric
            "fs,FS,Vitals,d1,Drop,,Dropdown,",               # dropdown without options
        )
        _, errors = parse_flowsheet_csv(text)
        got = {(e["row"], e["column"]) for e in errors}
        for expected in [
            (3, "Code"), (3, "Name"), (3, "Key"),
            (4, "Section"), (4, "Key"), (4, "Label"), (4, "Unit"), (4, "Row Type"),
            (5, "Value"), (6, "Value"),
        ]:
            self.assertIn(expected, got, errors)

    def test_comma_without_quotes_is_called_out(self):
        _, errors = parse_flowsheet_csv(csv_of("fs,FS,Vitals,hr,Heart, Rate,bpm,Numeric,x"))
        self.assertTrue(any("more cells" in e["message"] for e in errors))

    def test_duplicate_option_values(self):
        _, errors = parse_flowsheet_csv(csv_of("fs,FS,V,d,D,,Dropdown,a=One|a=Two"))
        self.assertTrue(any("more than once" in e["message"] for e in errors))

    def test_build_and_parse_round_trip(self):
        rows = [
            {"section_label": "S", "key": "a", "label": "A, with comma", "unit": "u", "field_type": "numeric", "options": None},
            {"section_label": "S", "key": "b", "label": "B", "unit": "", "field_type": "dropdown", "options": [("x", "X"), ("y", "Y")]},
        ]
        parsed, errors = parse_flowsheet_csv(build_csv_text("c", "N", rows))
        self.assertEqual(errors, [])
        self.assertEqual(parsed["rows"][0]["label"], "A, with comma")
        self.assertEqual(parsed["rows"][1]["options"], [("x", "X"), ("y", "Y")])

    def test_option_that_cannot_be_represented_raises(self):
        rows = [{"section_label": "S", "key": "b", "label": "B", "unit": "", "field_type": "dropdown", "options": [("x", "A|B")]}]
        with self.assertRaises(ValueError):
            build_csv_text("c", "N", rows)


class ImportTests(TestCase):
    def apply(self, text):
        parsed, errors = parse_flowsheet_csv(text)
        self.assertEqual(errors, [])
        return apply_flowsheet_import(parsed)

    def test_sample_imports_and_exports_identically(self):
        result = self.apply(sample_csv_text())
        self.assertTrue(result["created"])
        t = result["template"]
        self.assertEqual((t.code, t.version, t.rows.count()), (SAMPLE_CODE, 1, 11))
        self.assertEqual(export_flowsheet_csv(t), sample_csv_text())

    def test_rows_keep_file_order_and_sections(self):
        t = self.apply(sample_csv_text())["template"]
        rows = list(t.rows.order_by("sort_order"))
        self.assertEqual([r.key for r in rows][:3], ["temperature", "heart_rate", "bp_systolic"])
        self.assertEqual(rows[-1].key, "comments")
        self.assertEqual(rows[-1].section_label, "Assessment")
        self.assertEqual([r.sort_order for r in rows], [i * 10 for i in range(11)])

    def test_identical_option_lists_share_one_dictionary(self):
        text = csv_of(
            "fs,FS,S,a,A,,Dropdown,1=One|2=Two",
            "fs,FS,S,b,B,,Dropdown,1=One|2=Two",
            "fs,FS,S,c,C,,Dropdown,1=One|3=Three",
        )
        t = self.apply(text)["template"]
        a, b, c = (t.rows.get(key=k) for k in "abc")
        self.assertEqual(a.dictionary_id, b.dictionary_id)
        self.assertNotEqual(a.dictionary_id, c.dictionary_id)

    def test_reupload_unchanged_does_not_bump_version(self):
        text = sample_csv_text()
        self.apply(text)
        result = self.apply(text)
        self.assertFalse(result["created"])
        self.assertFalse(result["version_bumped"])
        self.assertEqual(result["template"].version, 1)

    def test_cosmetic_changes_do_not_bump_version(self):
        self.apply(sample_csv_text())
        edited = sample_csv_text().replace("Heart Rate", "Pulse").replace("bpm", "beats/min").replace("Sample Vital Signs", "Renamed")
        result = self.apply(edited)
        self.assertFalse(result["version_bumped"])
        t = result["template"]
        self.assertEqual((t.name, t.rows.get(key="heart_rate").label, t.rows.get(key="heart_rate").unit), ("Renamed", "Pulse", "beats/min"))

    def test_structural_changes_bump_version_once(self):
        self.apply(sample_csv_text())
        lines = sample_csv_text().strip().split("\r\n")
        without_height = "\r\n".join(l for l in lines if ",height," not in l) + "\r\n"
        result = self.apply(without_height)
        self.assertTrue(result["version_bumped"])
        self.assertEqual(result["template"].version, 2)
        self.assertFalse(result["template"].rows.filter(key="height").exists())
        # retyping a row
        retyped = without_height.replace("weight,Weight,lb,Numeric", "weight,Weight,lb,Text")
        self.assertTrue(self.apply(retyped)["version_bumped"])
        self.assertEqual(FlowsheetTemplate.objects.get(code=SAMPLE_CODE).version, 3)

    def test_changed_options_edit_unshared_dictionary_in_place(self):
        self.apply(csv_of("fs,FS,S,a,A,,Dropdown,1=One|2=Two"))
        before = FlowsheetRowDefinition.objects.get(key="a").dictionary_id
        result = self.apply(csv_of("fs,FS,S,a,A,,Dropdown,1=One|2=Two|3=Three"))
        row = FlowsheetRowDefinition.objects.get(key="a")
        self.assertEqual(row.dictionary_id, before)
        self.assertEqual(row.dictionary.items.count(), 3)
        self.assertTrue(result["version_bumped"])

    def test_changed_options_never_edit_a_shared_dictionary(self):
        self.apply(csv_of("fs,FS,S,a,A,,Dropdown,1=One|2=Two"))
        shared = FlowsheetRowDefinition.objects.get(key="a").dictionary
        # another flowsheet row points at the same dictionary
        other = FlowsheetTemplate.objects.create(code="other", name="Other")
        FlowsheetRowDefinition.objects.create(template=other, key="z", label="Z", section_label="S", field_type="dropdown", dictionary=shared)
        self.apply(csv_of("fs,FS,S,a,A,,Dropdown,1=One|9=Nine"))
        row = FlowsheetRowDefinition.objects.get(template__code="fs", key="a")
        self.assertNotEqual(row.dictionary_id, shared.id)
        self.assertEqual(shared.items.count(), 2)
        self.assertEqual({i.value for i in shared.items.all()}, {"1", "2"})

    def test_dropdown_to_numeric_clears_dictionary(self):
        self.apply(csv_of("fs,FS,S,a,A,,Dropdown,1=One"))
        self.apply(csv_of("fs,FS,S,a,A,,Numeric,"))
        self.assertIsNone(FlowsheetRowDefinition.objects.get(key="a").dictionary)

    def test_export_of_hand_built_template_round_trips(self):
        d = Dictionary.objects.create(code="d1", name="D1")
        d.items.create(value="x", label="X", sort_order=0)
        t = FlowsheetTemplate.objects.create(code="hand", name="Hand built")
        FlowsheetRowDefinition.objects.create(template=t, key="a", label="A", section_label="S", field_type="dropdown", dictionary=d, sort_order=0)
        FlowsheetRowDefinition.objects.create(template=t, key="b", label="B", section_label="S", unit="mg", field_type="numeric", sort_order=10)
        text = export_flowsheet_csv(t)
        rows = list(csv.reader(io.StringIO(text)))
        self.assertEqual(rows[0], COLUMNS)
        self.assertEqual(rows[1][-1], "x=X")
        self.assertEqual(rows[2][5], "mg")
        self.assertFalse(parse_flowsheet_csv(text)[1])

    def test_export_refuses_unrepresentable_option(self):
        d = Dictionary.objects.create(code="d2", name="D2")
        d.items.create(value="x", label="A|B", sort_order=0)
        t = FlowsheetTemplate.objects.create(code="bad", name="Bad")
        FlowsheetRowDefinition.objects.create(template=t, key="a", label="A", section_label="S", field_type="dropdown", dictionary=d)
        with self.assertRaises(ValueError):
            export_flowsheet_csv(t)


class EndpointTests(TestCase):
    def setUp(self):
        User = get_user_model()
        org = Organization.objects.create(name="Clinic")
        self.admin = User.objects.create_user(username="adm", email="a@x.com", password="pw-12345-xyz", role="admin", organization=org)
        self.nurse = User.objects.create_user(username="nur", email="n@x.com", password="pw-12345-xyz", role="nurse", organization=org)
        self.c = APIClient()
        self.c.force_authenticate(self.admin)

    def upload(self, text, client=None):
        f = SimpleUploadedFile("f.csv", text.encode("utf-8"), content_type="text/csv")
        return (client or self.c).post("/api/admin/flowsheet-templates/upload-csv/", {"file": f}, format="multipart")

    def test_sample_download(self):
        r = self.c.get("/api/admin/flowsheet-templates/sample-csv/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r["Content-Type"])
        self.assertEqual(r.content.decode(), sample_csv_text())

    def test_upload_creates_then_updates(self):
        r = self.upload(sample_csv_text())
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["created"])
        r = self.upload(sample_csv_text().replace("Heart Rate", "Pulse"))
        self.assertEqual((r.status_code, r.json()["created"], r.json()["version_bumped"]), (200, False, False))

    def test_bad_upload_saves_nothing(self):
        r = self.upload(csv_of("fs,FS,,k,L,,Nope,"))
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.json()["errors"])
        self.assertFalse(FlowsheetTemplate.objects.filter(code="fs").exists())

    def test_no_file(self):
        self.assertEqual(self.c.post("/api/admin/flowsheet-templates/upload-csv/", {}, format="multipart").status_code, 400)

    def test_download_existing_flowsheet(self):
        self.upload(sample_csv_text())
        r = self.c.get(f"/api/admin/flowsheet-templates/{SAMPLE_CODE}/download-csv/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(f'{SAMPLE_CODE}_flowsheet.csv', r["Content-Disposition"])
        self.assertEqual(r.content.decode(), sample_csv_text())

    def test_nurse_is_refused_everywhere(self):
        n = APIClient()
        n.force_authenticate(self.nurse)
        self.assertEqual(n.get("/api/admin/flowsheet-templates/sample-csv/").status_code, 403)
        self.assertEqual(self.upload(sample_csv_text(), client=n).status_code, 403)
