"""
python manage.py test staffing.test_master_schedule_csv
"""
import csv
import io

from django.core.files.uploadedfile import SimpleUploadedFile

from .models import MasterScheduleCell, MasterScheduleRow, MasterScheduleSection, Staff, Unit
from .test_master_schedule import BASE, MasterScheduleBase, client_for

DOWNLOAD = f"{BASE}/csv/"
UPLOAD = f"{BASE}/upload-csv/"
HEAD = ["section", "first_name", "last_name", "unit", "hp", "status"]


def sheet(rows, dates=("2026-10-01", "2026-10-02", "2026-10-03"), head=None):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow((head or HEAD) + list(dates))
    for r in rows:
        w.writerow(r)
    return out.getvalue()


class MasterScheduleCsvTests(MasterScheduleBase):
    def _upload(self, text, user=None, **extra):
        f = SimpleUploadedFile("ms.csv", text.encode("utf-8"), content_type="text/csv")
        return client_for(user or self.admin).post(UPLOAD, {"file": f, **extra}, format="multipart")

    def _staff(self, first, last="T"):
        return Staff.objects.create(organization=self.org, first_name=first, last_name=last, profession="GNA")

    # ---- download ----------------------------------------------------------
    def test_template_has_the_month_grid_and_every_section(self):
        r = client_for(self.admin).get(DOWNLOAD, {"month": "2026-10"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("text/csv", r["Content-Type"])
        self.assertIn("master_schedule_2026-10.csv", r["Content-Disposition"])
        rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
        self.assertEqual(rows[0][:6], HEAD)
        self.assertEqual(rows[0][6], "2026-10-01")  # Thursday: the work week starts on the 1st
        self.assertEqual(rows[0][-1], "2026-11-04")
        self.assertEqual(len(rows[0]), 6 + 35)
        self.assertIn("FT 7AM - 7PM", [row[0] for row in rows[1:]])
        self.assertEqual(client_for(self.admin).get(DOWNLOAD, {"month": "nope"}).status_code, 400)

    def test_template_unit_sections_are_prefilled_with_their_unit(self):
        Unit.objects.create(organization=self.org, name="Unit 2")
        rows = list(csv.reader(io.StringIO(
            client_for(self.admin).get(DOWNLOAD, {"month": "2026-10"}).content.decode("utf-8-sig"))))
        unit2 = [row for row in rows[1:] if row[0] == "Unit 2"]
        self.assertTrue(unit2 and all(row[3] == "Unit 2" for row in unit2))

    # ---- upload ------------------------------------------------------------
    def test_upload_creates_rows_with_unit_hp_status_and_days(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        ann = self._staff("Ann")
        r = self._upload(sheet([["Unit 2", "Ann", "T", "unit 2", "A", "PT", "7A", "", "3 11"]]))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body["rows_created"], body["cells_set"], body["errors"]), (1, 2, []))
        row = MasterScheduleRow.objects.get(staff=ann)
        self.assertEqual((row.section.name, row.unit, row.hp, row.status), ("Unit 2", unit2, "A", "PT"))
        codes = {c.date.isoformat(): c.code for c in row.cells.all()}
        self.assertEqual(codes, {"2026-10-01": "7A", "2026-10-03": "3 11"})
        self.assertIn("A", client_for(self.admin).get(f"{BASE}/", {"start": "2026-10-01", "end": "2026-10-31"}).json()["settings"]["hp_values"])

    def test_same_named_sections_are_taken_in_the_order_listed_and_blank_section_fills_down(self):
        a, b, c, d = self._staff("A"), self._staff("B"), self._staff("C"), self._staff("D")
        r = self._upload(sheet([
            ["Unit 2", "A", "T", "", "", "", "7"],
            ["", "B", "T", "", "", "", "7"],       # blank section: stays under the first Unit 2
            ["Unit 3", "C", "T", "", "", "", "7"],
            ["Unit 2", "D", "T", "", "", "", "7"],  # the second Unit 2 in the layout
        ]))
        self.assertEqual(r.json()["errors"], [])
        sec = {s: MasterScheduleRow.objects.get(staff=s).section for s in (a, b, c, d)}
        self.assertEqual(sec[a], sec[b])
        self.assertNotEqual(sec[a], sec[d])
        self.assertLess(sec[a].sort_order, sec[d].sort_order)
        self.assertEqual(sec[c].name, "Unit 3")

    def test_problems_are_reported_but_the_rest_still_saves(self):
        ann = self._staff("Ann")
        r = self._upload(sheet([
            ["SUPERVISORS", "Ann", "T", "Unit 9", "", "", "7", "zz", "R"],  # bad code + unknown unit
            ["SUPERVISORS", "Nobody", "Here", "", "", "", "7"],              # not on the roster
            ["SUPERVISORS", "", "", "", "", "", "7"],                        # day entries, no name
            ["SUPERVISORS", "", "", "", "", ""],                             # blank line
        ]))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["rows_created"], 1)
        self.assertEqual(body["cells_set"], 2)  # 7 and R; 'zz' skipped
        text = " ".join(body["errors"])
        for needle in ("zz", "Unit 9", "Nobody Here", "no name"):
            self.assertIn(needle, text)
        self.assertFalse(MasterScheduleRow.objects.filter(staff__first_name="Nobody").exists())
        self.assertEqual(MasterScheduleRow.objects.get(staff=ann).cells.count(), 2)

    def test_reupload_updates_in_place_and_blanks_change_nothing(self):
        ann = self._staff("Ann")
        self._upload(sheet([["SUPERVISORS", "Ann", "T", "", "A", "PT", "7", "7"]]))
        r = self._upload(sheet([["PT DAYS", "Ann", "T", "", "", "", "3", ""]]))
        body = r.json()
        self.assertEqual((body["rows_created"], body["rows_updated"], body["rows_moved"]), (0, 1, 1))
        self.assertEqual(MasterScheduleRow.objects.filter(staff=ann).count(), 1)
        row = MasterScheduleRow.objects.get(staff=ann)
        self.assertEqual((row.section.name, row.hp, row.status), ("PT DAYS", "A", "PT"))  # blanks kept
        codes = {c.date.isoformat(): c.code for c in row.cells.all()}
        self.assertEqual(codes, {"2026-10-01": "3", "2026-10-02": "7"})  # blank day kept

    def test_excel_style_dates_codes_and_new_sections(self):
        ann = self._staff("Ann")
        r = self._upload(sheet([["Brand New Section", "Ann", "T", "", "", "", " 7a ", "r"]],
                               dates=("10/1/2026", "10/2/26")))
        body = r.json()
        self.assertEqual((body["sections_added"], body["errors"]), (["Brand New Section"], []))
        codes = {c.date.isoformat(): c.code for c in MasterScheduleRow.objects.get(staff=ann).cells.all()}
        self.assertEqual(codes, {"2026-10-01": "7A", "2026-10-02": "R"})

    def test_replace_starts_clean(self):
        ann, bea = self._staff("Ann"), self._staff("Bea")
        self._upload(sheet([["SUPERVISORS", "Ann", "T", "", "", "", "7"]]))
        r = self._upload(sheet([["SUPERVISORS", "Bea", "T", "", "", "", "3"]]), replace="true")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["replaced"])
        self.assertFalse(MasterScheduleRow.objects.filter(staff=ann).exists())
        self.assertTrue(MasterScheduleRow.objects.filter(staff=bea).exists())

    def test_download_then_upload_round_trips(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        ann = self._staff("Ann")
        self._upload(sheet([["Unit 2", "Ann", "T", "Unit 2", "A", "PT", "7A", "R"]]))
        text = client_for(self.admin).get(DOWNLOAD, {"month": "2026-10"}).content.decode("utf-8-sig")
        again = self._upload(text)
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual((again.json()["rows_created"], again.json()["errors"]), (0, []))
        self.assertEqual(MasterScheduleRow.objects.filter(staff=ann).count(), 1)
        self.assertEqual(MasterScheduleRow.objects.get(staff=ann).unit, unit2)
        self.assertEqual(MasterScheduleCell.objects.filter(row__staff=ann).count(), 2)

    def test_bad_files_and_permissions(self):
        self.assertEqual(self._upload("first_name,last_name\nA,B\n").status_code, 400)  # no section column
        self.assertEqual(self._upload("").status_code, 400)
        self.assertEqual(self._upload(sheet([]), user=self.nurse).status_code, 403)
        self.assertEqual(client_for(self.admin).post(UPLOAD, {}, format="multipart").status_code, 400)
        self.assertEqual(client_for(self.nurse).get(DOWNLOAD, {"month": "2026-10"}).status_code, 200)
        self.assertEqual(client_for(self.patient).get(DOWNLOAD, {"month": "2026-10"}).status_code, 403)


class MasterScheduleCsvDryRunTests(MasterScheduleBase):
    """dry_run=true reports per row what an import would do, and saves nothing."""

    def _upload(self, text, **extra):
        f = SimpleUploadedFile("ms.csv", text.encode("utf-8"), content_type="text/csv")
        return client_for(self.admin).post(UPLOAD, {"file": f, **extra}, format="multipart")

    def test_dry_run_reports_rows_and_saves_nothing(self):
        Staff.objects.create(organization=self.org, first_name="Ann", last_name="T", profession="GNA")
        text = sheet([
            ["Dry Run Section", "Ann", "T", "", "", "", "7", "", "7Z"],
            ["", "Zed", "Nobody", "", "", "", "7", "", ""],
        ])
        r = self._upload(text, dry_run="true")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertTrue(body["dry_run"])
        states = {row["row"]: row["state"] for row in body["rows"]}
        self.assertEqual(states, {2: "attention", 3: "skipped"})
        self.assertEqual(MasterScheduleRow.objects.filter(organization=self.org).count(), 0)
        self.assertEqual(MasterScheduleCell.objects.count(), 0)
        self.assertFalse(MasterScheduleSection.objects.filter(organization=self.org, name="Dry Run Section").exists())
