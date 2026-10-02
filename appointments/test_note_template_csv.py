"""
Tests for the note template CSV upload/download (note builder).

The Admission Note sample shipped with the feature
(note_template_sample.csv) is the reference: it must parse cleanly, import
into the database, and export back to exactly the same CSV.
"""

import csv
import io
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase

from .models import (
    Dictionary,
    DictionaryItem,
    FlowsheetRowDefinition,
    FlowsheetTemplate,
    NoteFieldDefinition,
    NoteTemplate,
)
from .note_template_csv import (
    COLUMNS,
    build_csv_text,
    decode_upload,
    parse_options,
    parse_template_csv,
)
from .note_template_import import apply_template_import, export_template_csv

SAMPLE_PATH = Path(__file__).with_name("note_template_sample.csv")


def sample_text():
    # read_bytes: read_text() would translate the file's \r\n line endings
    return SAMPLE_PATH.read_bytes().decode("utf-8")


def make_csv(*rows, header=COLUMNS):
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return out.getvalue()


def row(key="k1", label="Label", ftype="Single-Line Text", required="FALSE", help_text="", dep="", value="",
        code="demo", name="Demo", tab="", section="Sec"):
    return [code, name, tab, section, key, label, ftype, required, help_text, dep, value]


def errors_for(text):
    parsed, errors = parse_template_csv(text)
    return parsed, errors


class SampleFileTests(SimpleTestCase):
    def test_sample_parses_without_errors(self):
        parsed, errors = parse_template_csv(sample_text())
        self.assertEqual(errors, [])
        self.assertEqual(parsed["code"], "admission_note")
        self.assertEqual(parsed["name"], "Admission Note")
        self.assertEqual(len(parsed["fields"]), 97)

    def test_sample_round_trips_through_build_csv_text(self):
        parsed, _ = parse_template_csv(sample_text())
        rebuilt = build_csv_text(parsed["code"], parsed["name"], parsed["fields"])
        self.assertEqual(rebuilt, sample_text())

    def test_required_fields_in_sample(self):
        parsed, _ = parse_template_csv(sample_text())
        required = [f["key"] for f in parsed["fields"] if f["required"]]
        self.assertEqual(
            required,
            ["chief_complaint", "hpi", "allergies", "consent_acknowledged", "clinical_impression", "plan"],
        )


class ParserRuleTests(SimpleTestCase):
    def assertOneError(self, text, column, fragment):
        parsed, errors = parse_template_csv(text)
        self.assertIsNone(parsed)
        self.assertTrue(
            any(e["column"] == column and fragment in e["message"] for e in errors),
            f"expected {column!r} error containing {fragment!r}, got {errors}",
        )

    def test_valid_minimal(self):
        parsed, errors = parse_template_csv(make_csv(row()))
        self.assertEqual(errors, [])
        self.assertEqual(parsed["fields"][0]["field_type"], "text")

    def test_every_field_type_accepted_case_insensitive(self):
        types = {
            "single-line text": "text", "MULTI-LINE TEXT": "textarea", "Numeric": "numeric", "date": "date",
            "Checkbox (yes/no)": "checkbox",
        }
        for label, code in types.items():
            parsed, errors = parse_template_csv(make_csv(row(ftype=label)))
            self.assertEqual(errors, [], label)
            self.assertEqual(parsed["fields"][0]["field_type"], code)
        for label, code in {"Radio Button (dictionary)": "radio", "dropdown (dictionary)": "dropdown",
                            "Multi-select Checklist (dictionary)": "multiselect"}.items():
            parsed, errors = parse_template_csv(make_csv(row(ftype=label, value="a=A|b=B")))
            self.assertEqual(errors, [], label)
            self.assertEqual(parsed["fields"][0]["field_type"], code)

    def test_bad_field_type(self):
        self.assertOneError(make_csv(row(ftype="Textbox")), "Field Type", "not a valid Field Type")

    def test_dictionary_type_needs_options(self):
        self.assertOneError(make_csv(row(ftype="Dropdown (Dictionary)")), "Value", "must list the options")

    def test_non_dictionary_type_must_not_have_options(self):
        self.assertOneError(make_csv(row(ftype="Numeric", value="a=A")), "Value", "must be blank")

    def test_duplicate_key(self):
        self.assertOneError(make_csv(row(key="a"), row(key="a")), "Key", "already used on row 2")

    def test_key_with_space(self):
        self.assertOneError(make_csv(row(key="bad key")), "Key", "no spaces")

    def test_key_too_long(self):
        self.assertOneError(make_csv(row(key="k" * 65)), "Key", "at most 64")

    def test_code_and_name_must_match_on_every_row(self):
        text = make_csv(row(key="a"), row(key="b", code="other"))
        self.assertOneError(text, "Code", "differs")
        text = make_csv(row(key="a"), row(key="b", name="Other"))
        self.assertOneError(text, "Name", "differs")

    def test_bad_code(self):
        self.assertOneError(make_csv(row(code="has space")), "Code", "letters, numbers")
        self.assertOneError(make_csv(row(code="")), "Code", "required")

    def test_required_values(self):
        for v in ("TRUE", "true", "Yes", "1"):
            self.assertEqual(parse_template_csv(make_csv(row(required=v)))[0]["fields"][0]["required"], True, v)
        for v in ("FALSE", "no", "0", ""):
            self.assertEqual(parse_template_csv(make_csv(row(required=v)))[0]["fields"][0]["required"], False, v)
        self.assertOneError(make_csv(row(required="maybe")), "Required", "TRUE or FALSE")

    def test_depends_on_rules(self):
        parent = row(key="p", ftype="Dropdown (Dictionary)", value="x=X|y=Y")
        ok = parse_template_csv(make_csv(parent, row(key="c", dep="p=x")))
        self.assertEqual(ok[1], [])
        self.assertEqual(ok[0]["fields"][1]["depends_on_key"], "p")
        self.assertEqual(ok[0]["fields"][1]["depends_on_value"], "x")
        self.assertOneError(make_csv(parent, row(key="c", dep="p=zzz")), "Depends on", "not one of the stored values")
        self.assertOneError(make_csv(row(key="c", dep="p=x"), parent), "Depends on", "earlier row")
        self.assertOneError(make_csv(row(key="t"), row(key="c", dep="t=x")), "Depends on", "no options")
        self.assertOneError(make_csv(parent, row(key="c", dep="nonsense")), "Depends on", "parent_key=option_value")

    def test_missing_header_column(self):
        header = [c for c in COLUMNS if c != "Depends on"]
        text = make_csv(row()[:9] + [row()[10]], header=header)
        parsed, errors = parse_template_csv(text)
        self.assertIsNone(parsed)
        self.assertIn("Depends on", errors[0]["message"])

    def test_header_is_case_and_space_insensitive(self):
        header = [c.upper() + " " for c in COLUMNS]
        parsed, errors = parse_template_csv(make_csv(row(), header=header))
        self.assertEqual(errors, [])

    def test_empty_file_and_no_rows(self):
        self.assertEqual(parse_template_csv("")[1][0]["message"], "The file is empty.")
        parsed, errors = parse_template_csv(make_csv())
        self.assertIsNone(parsed)
        self.assertIn("at least one field", errors[0]["message"])

    def test_blank_lines_ignored(self):
        text = make_csv(row(key="a")) + "\r\n,,,,,,,,,,\r\n" + "\r\n"
        parsed, errors = parse_template_csv(text)
        self.assertEqual(errors, [])
        self.assertEqual(len(parsed["fields"]), 1)

    def test_extra_cells_reported(self):
        text = make_csv(row()) + "a,b,c,d,e,f,g,h,i,j,k,EXTRA\r\n"
        parsed, errors = parse_template_csv(text)
        self.assertIsNone(parsed)
        self.assertIn("more cells", errors[0]["message"])

    def test_row_numbers_are_spreadsheet_rows(self):
        parsed, errors = parse_template_csv(make_csv(row(key="a"), row(key="b", ftype="Nope")))
        self.assertEqual(errors[0]["row"], 3)

    def test_decode_handles_bom_and_cp1252(self):
        self.assertEqual(decode_upload("﻿Code".encode("utf-8")), "Code")
        self.assertEqual(decode_upload("caf\xe9".encode("cp1252")), "caf\xe9")

    def test_commas_quotes_and_newlines_survive(self):
        r = row(label='He said "hi", ok', help_text="line1\nline2")
        parsed, errors = parse_template_csv(make_csv(r))
        self.assertEqual(errors, [])
        self.assertEqual(parsed["fields"][0]["label"], 'He said "hi", ok')
        self.assertEqual(parsed["fields"][0]["help_text"], "line1\nline2")


class OptionParsingTests(SimpleTestCase):
    def test_explicit_and_bare(self):
        opts, problems = parse_options("never=Never smoker| Former smoker |x=A=B")
        self.assertEqual(problems, [])
        self.assertEqual(opts, [("never", "Never smoker"), ("former_smoker", "Former smoker"), ("x", "A=B")])

    def test_duplicate_and_empty(self):
        self.assertTrue(parse_options("a=A|a=B")[1])
        self.assertTrue(parse_options("=A")[1])
        self.assertTrue(parse_options("a=")[1])
        self.assertTrue(parse_options("|")[1])

    def test_export_rejects_unrepresentable(self):
        with self.assertRaises(ValueError):
            build_csv_text("c", "n", [dict(key="k", label="l", field_type="dropdown", options=[("a", "x|y")])])


class ImportTests(TestCase):
    def setUp(self):
        # Migrations 0031/0033 seed the Admission Note (and its dictionaries) into every
        # database, test DB included. Remove just that template so the sample can be
        # imported as a brand new template; leave other data (e.g. dictionaries that
        # flowsheet rows protect) alone.
        NoteTemplate.objects.filter(code="admission_note").delete()

    def import_text(self, text):
        parsed, errors = parse_template_csv(text)
        self.assertEqual(errors, [])
        return apply_template_import(parsed)

    def test_import_sample_creates_template(self):
        result = self.import_text(sample_text())
        t = result["template"]
        self.assertTrue(result["created"])
        self.assertFalse(result["version_bumped"])
        self.assertEqual((t.code, t.name, t.version, t.is_active), ("admission_note", "Admission Note", 1, True))
        self.assertIsNone(t.organization_id)
        fields = list(t.fields.order_by("sort_order"))
        self.assertEqual(len(fields), 97)
        self.assertEqual([f.sort_order for f in fields], [i * 10 for i in range(97)])

    def test_dependencies_and_shared_dictionaries(self):
        t = self.import_text(sample_text())["template"]
        f = {x.key: x for x in t.fields.select_related("dictionary", "depends_on")}
        neg = f["ros_general_negative"]
        self.assertEqual(neg.depends_on.key, "ros_general_status")
        self.assertEqual(neg.depends_on_value, "negative_for")
        # every ROS status field shares one dictionary; yes/no/unknown shared by two fields
        self.assertEqual(f["ros_general_status"].dictionary_id, f["ros_cardiovascular_status"].dictionary_id)
        self.assertEqual(f["drug_use"].dictionary_id, f["advance_directive"].dictionary_id)
        self.assertEqual(
            [(i.value, i.label) for i in f["tobacco_use"].dictionary.items.order_by("sort_order")],
            [("never", "Never smoker"), ("former", "Former smoker"), ("current", "Current smoker")],
        )
        self.assertEqual(len([x for x in f.values() if x.field_type == "multiselect"]), 56)

    def test_export_matches_sample_exactly(self):
        t = self.import_text(sample_text())["template"]
        self.assertEqual(export_template_csv(t), sample_text())

    def test_reimport_is_idempotent(self):
        self.import_text(sample_text())
        dicts_before = Dictionary.objects.count()
        result = self.import_text(sample_text())
        self.assertFalse(result["created"])
        self.assertFalse(result["version_bumped"])
        self.assertEqual(result["template"].version, 1)
        self.assertEqual(Dictionary.objects.count(), dicts_before)
        self.assertEqual(result["template"].fields.count(), 97)

    def simple(self, *extra):
        return make_csv(
            row(key="a", label="A", required="TRUE"),
            row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|y=Y"),
            *extra,
        )

    def test_cosmetic_edits_do_not_bump_version(self):
        self.import_text(self.simple())
        cosmetic = make_csv(
            row(key="b", label="B renamed", ftype="Dropdown (Dictionary)", value="y=Why|x=Ex", help_text="hi", tab="T"),
            row(key="a", label="A renamed", required="TRUE", section="Other"),
        )
        result = self.import_text(cosmetic)
        self.assertFalse(result["version_bumped"])
        self.assertEqual(result["template"].version, 1)
        b = result["template"].fields.get(key="b")
        self.assertEqual((b.label, b.tab_label, b.help_text), ("B renamed", "T", "hi"))
        self.assertEqual([(i.value, i.label) for i in b.dictionary.items.order_by("sort_order")], [("y", "Why"), ("x", "Ex")])
        self.assertEqual(list(result["template"].fields.order_by("sort_order").values_list("key", flat=True)), ["b", "a"])

    def test_structural_edits_bump_version(self):
        cases = {
            "required changed": make_csv(row(key="a", label="A", required="FALSE"),
                                         row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|y=Y")),
            "field removed": make_csv(row(key="a", label="A", required="TRUE")),
            "field added": self.simple(row(key="c")),
            "option value changed": make_csv(row(key="a", label="A", required="TRUE"),
                                             row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|z=Z")),
            "type changed": make_csv(row(key="a", label="A", required="TRUE"),
                                     row(key="b", label="B", ftype="Radio Button (dictionary)", value="x=X|y=Y")),
        }
        for name, text in cases.items():
            with self.subTest(name):
                NoteTemplate.objects.filter(code="demo").delete()
                Dictionary.objects.filter(code__startswith="demo_").delete()
                self.import_text(self.simple())
                result = self.import_text(text)
                self.assertTrue(result["version_bumped"], name)
                self.assertEqual(result["template"].version, 2, name)

    def test_removed_field_is_deleted_and_dependents_cleared(self):
        self.import_text(make_csv(
            row(key="p", ftype="Dropdown (Dictionary)", value="x=X|y=Y"), row(key="c", dep="p=x"),
        ))
        result = self.import_text(make_csv(row(key="c")))
        self.assertEqual(result["template"].fields.count(), 1)
        self.assertIsNone(result["template"].fields.get(key="c").depends_on_id)

    def test_options_edited_in_place_when_only_this_field_uses_them(self):
        self.import_text(self.simple())
        before = NoteFieldDefinition.objects.get(key="b").dictionary_id
        self.import_text(make_csv(row(key="a", label="A", required="TRUE"),
                                  row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|z=Z")))
        b = NoteFieldDefinition.objects.get(key="b")
        self.assertEqual(b.dictionary_id, before)
        self.assertEqual(sorted(i.value for i in b.dictionary.items.all()), ["x", "z"])

    def test_shared_dictionary_is_never_edited_behind_other_users(self):
        self.import_text(self.simple())
        shared = NoteFieldDefinition.objects.get(key="b").dictionary
        ft = FlowsheetTemplate.objects.create(code="vs", name="Vitals")
        FlowsheetRowDefinition.objects.create(template=ft, key="r", label="R", field_type="dropdown", dictionary=shared)
        self.import_text(make_csv(row(key="a", label="A", required="TRUE"),
                                  row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|q=Q")))
        b = NoteFieldDefinition.objects.get(key="b")
        self.assertNotEqual(b.dictionary_id, shared.id)
        self.assertEqual(sorted(i.value for i in shared.items.all()), ["x", "y"])  # untouched
        self.assertEqual(sorted(i.value for i in b.dictionary.items.all()), ["q", "x"])

    def test_dictionary_used_by_another_template_is_not_edited(self):
        self.import_text(self.simple())
        other = make_csv(row(key="b", label="B", ftype="Dropdown (Dictionary)", value="x=X|y=Y", code="other", name="Other"))
        self.import_text(other)
        # `other` has its own identical dictionary (new, since it had no existing field)
        d_demo = NoteFieldDefinition.objects.get(template__code="demo", key="b").dictionary
        d_other = NoteFieldDefinition.objects.get(template__code="other", key="b").dictionary
        self.assertNotEqual(d_demo.id, d_other.id)
        self.assertNotEqual(d_demo.code, d_other.code)

    def test_dictionary_code_collisions_get_a_suffix(self):
        Dictionary.objects.create(code="demo_b", name="squatter")
        self.import_text(self.simple())
        code = NoteFieldDefinition.objects.get(key="b").dictionary.code
        self.assertEqual(code, "demo_b_2")

    def test_existing_template_keeps_active_flag_and_org(self):
        self.import_text(self.simple())
        NoteTemplate.objects.filter(code="demo").update(is_active=False)
        result = self.import_text(self.simple())
        self.assertFalse(result["template"].is_active)

    def test_failure_rolls_everything_back(self):
        real_create = NoteFieldDefinition.objects.create
        calls = {"n": 0}

        def boom(*a, **kw):
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("db exploded")
            return real_create(*a, **kw)

        dictionaries_before = Dictionary.objects.count()
        fields_before = NoteFieldDefinition.objects.count()
        parsed, _ = parse_template_csv(self.simple())
        with mock.patch.object(NoteFieldDefinition.objects, "create", side_effect=boom):
            with self.assertRaises(RuntimeError):
                apply_template_import(parsed)
        self.assertFalse(NoteTemplate.objects.filter(code="demo").exists())
        self.assertEqual(Dictionary.objects.count(), dictionaries_before)
        self.assertEqual(NoteFieldDefinition.objects.count(), fields_before)
