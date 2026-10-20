"""CDC CVX importer. The sample lines are real CDC CVX.txt lines (shortened notes); everything else is synthetic."""

import os
import tempfile
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase

from .immunization_cvx import CvxFormatError, load_cvx, parse_cvx
from .models import VaccineProduct

SAMPLE = (
    "﻿54        |adenovirus, type 4|adenovirus vaccine, type 4, live, oral||Inactive|False|2010/05/28\r\n"
    "24        |Anthrax, pre-exposure prophylaxis, post-exposure prophylaxis|Anthrax vaccine, adsorbed, pre-exposure and "
    "post-exposure prophylaxis||Active|False|2024/01/25\r\n"
    "86        |IG|immune globulin, unspecified formulation|Immune globulin is not a vaccine|Inactive|True|2010/05/28\r\n"
    "7         |Non-US example|Example vaccine licensed outside the US||Non-US|False|2010/05/28\r\n"
    "999       |Never active example|Example||Never Active|False|2011/01/01\r\n"
)


class ParseTests(SimpleTestCase):
    def test_reads_the_cdc_layout(self):
        rows = parse_cvx(SAMPLE)
        self.assertEqual([r["cvx_code"] for r in rows], ["54", "24", "86", "7", "999"])
        first = rows[0]
        self.assertEqual(first["short_name"], "adenovirus, type 4")
        self.assertEqual(first["status"], "inactive")
        self.assertTrue(first["is_vaccine"])
        self.assertEqual(str(first["cdc_updated_on"]), "2010-05-28")

    def test_status_names_map_to_the_catalog_values(self):
        rows = {r["cvx_code"]: r["status"] for r in parse_cvx(SAMPLE)}
        self.assertEqual(rows, {"54": "inactive", "24": "active", "86": "inactive", "7": "non_us", "999": "never_active"})

    def test_non_vaccine_entries_are_flagged(self):
        rows = {r["cvx_code"]: r["is_vaccine"] for r in parse_cvx(SAMPLE)}
        self.assertFalse(rows["86"])
        self.assertTrue(rows["24"])

    def test_notes_are_kept(self):
        self.assertEqual({r["cvx_code"]: r["notes"] for r in parse_cvx(SAMPLE)}["86"], "Immune globulin is not a vaccine")

    def test_blank_lines_are_skipped(self):
        self.assertEqual(len(parse_cvx(SAMPLE + "\r\n\r\n")), 5)

    def test_wrong_field_count_names_the_line(self):
        with self.assertRaisesRegex(CvxFormatError, "line 2: expected 7 fields, found 3"):
            parse_cvx("54|a|b|c|Active|False|2010/05/28\n55|short|full\n")

    def test_unknown_status_is_refused(self):
        with self.assertRaisesRegex(CvxFormatError, "unknown status"):
            parse_cvx("54|a|b||Retired|False|2010/05/28\n")

    def test_bad_code_flag_and_date_are_refused(self):
        with self.assertRaisesRegex(CvxFormatError, "not a number"):
            parse_cvx("x4|a|b||Active|False|2010/05/28\n")
        with self.assertRaisesRegex(CvxFormatError, "non-vaccine flag"):
            parse_cvx("54|a|b||Active|Maybe|2010/05/28\n")
        with self.assertRaisesRegex(CvxFormatError, "unrecognised date"):
            parse_cvx("54|a|b||Active|False|28 May 2010\n")

    def test_duplicate_codes_are_refused(self):
        with self.assertRaisesRegex(CvxFormatError, "appears twice"):
            parse_cvx("54|a|b||Active|False|2010/05/28\n54 |c|d||Active|False|2010/05/28\n")

    def test_empty_date_is_allowed(self):
        self.assertIsNone(parse_cvx("54|a|b||Active|False|\n")[0]["cdc_updated_on"])


class LoadTests(TestCase):
    def test_load_creates_then_reports_unchanged(self):
        rows = parse_cvx(SAMPLE)
        self.assertEqual(load_cvx(rows), {"created": 5, "updated": 0, "unchanged": 0})
        self.assertEqual(load_cvx(rows), {"created": 0, "updated": 0, "unchanged": 5})
        self.assertEqual(VaccineProduct.objects.count(), 5)

    def test_a_newer_file_updates_in_place_and_adds_new_codes(self):
        load_cvx(parse_cvx(SAMPLE))
        original_id = VaccineProduct.objects.get(cvx_code="24").pk
        newer = SAMPLE.replace("24        |Anthrax, pre-exposure prophylaxis, post-exposure prophylaxis|", "24        |Anthrax (renamed)|") \
            + "1000      |New code|A new vaccine||Active|False|2026/09/01\r\n"
        counts = load_cvx(parse_cvx(newer))
        self.assertEqual(counts, {"created": 1, "updated": 1, "unchanged": 4})
        updated = VaccineProduct.objects.get(cvx_code="24")
        self.assertEqual(updated.pk, original_id)
        self.assertEqual(updated.short_name, "Anthrax (renamed)")

    def test_codes_missing_from_a_newer_file_are_kept(self):
        load_cvx(parse_cvx(SAMPLE))
        load_cvx(parse_cvx("54        |adenovirus, type 4|adenovirus vaccine, type 4, live, oral||Inactive|False|2010/05/28\r\n"))
        self.assertEqual(VaccineProduct.objects.count(), 5)

    def test_load_is_all_or_nothing(self):
        rows = parse_cvx(SAMPLE)
        rows[-1] = dict(rows[-1], status="not-a-status")  # fails the model's choices only on full_clean, so force a DB error
        rows[-1]["cvx_code"] = None  # NOT NULL violation
        with self.assertRaises(Exception):
            load_cvx(rows)
        self.assertEqual(VaccineProduct.objects.count(), 0)


class CommandTests(TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8", newline="")
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_command_loads_a_file_with_a_byte_order_mark(self):
        out = StringIO()
        call_command("import_cvx", self.write(SAMPLE), stdout=out)
        self.assertIn("5 CVX codes read: 5 added, 0 updated, 0 unchanged.", out.getvalue())
        self.assertEqual(VaccineProduct.objects.count(), 5)

    def test_dry_run_changes_nothing(self):
        out = StringIO()
        call_command("import_cvx", self.write(SAMPLE), "--dry-run", stdout=out)
        self.assertIn("dry run", out.getvalue())
        self.assertEqual(VaccineProduct.objects.count(), 0)

    def test_a_bad_file_loads_nothing_and_says_why(self):
        with self.assertRaisesRegex(CommandError, "line 2"):
            call_command("import_cvx", self.write("54|a|b||Active|False|2010/05/28\nbroken\n"))
        self.assertEqual(VaccineProduct.objects.count(), 0)

    def test_a_missing_file_is_reported(self):
        with self.assertRaisesRegex(CommandError, "Cannot read"):
            call_command("import_cvx", "does-not-exist.txt")
