import datetime

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization

from .announcements import clean_html
from .models import Announcement

URL = "/api/communicator/announcements/"


@override_settings(MEDIA_ROOT="/tmp/ann_test_media")
class AnnouncementApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(name="Org A")
        self.other_org = Organization.objects.create(name="Org B")
        self.admin = User.objects.create_user(username="adm", password="x", role="admin", organization=self.org)
        self.patient = User.objects.create_user(username="pat", password="x", role="patient", organization=self.org)
        self.nurse = User.objects.create_user(username="nur", password="x", role="nurse", organization=self.org)
        self.stranger = User.objects.create_user(username="str", password="x", role="patient", organization=self.other_org)
        self.today = timezone.localdate()

    def as_user(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def make(self, **kw):
        data = dict(organization=self.org, title="T", body="<b>x</b>", audience="patients")
        data.update(kw)
        return Announcement.objects.create(**data)

    def test_admin_creates_and_html_is_cleaned(self):
        res = self.as_user(self.admin).post(
            URL,
            {"title": "<b>Hours</b>", "body": '<p onclick="x()">Open <b>8-5</b><script>alert(1)</script></p>', "audience": "patients"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["title"], "Hours")
        self.assertNotIn("script", res.data["body"])
        self.assertNotIn("onclick", res.data["body"])
        self.assertIn("<b>8-5</b>", res.data["body"])
        self.assertEqual(res.data["status"], "live")
        self.assertEqual(Announcement.objects.get().organization, self.org)

    def test_link_with_javascript_is_neutralised_and_color_style_kept(self):
        cleaned = clean_html('<a href="javascript:alert(1)">x</a><span style="color:red;position:fixed">y</span>')
        self.assertNotIn("javascript", cleaned)
        self.assertIn("color:red", cleaned)
        self.assertNotIn("position", cleaned)

    def test_patient_cannot_write(self):
        c = self.as_user(self.patient)
        self.assertEqual(c.post(URL, {"title": "x"}, format="json").status_code, 403)
        a = self.make()
        self.assertEqual(c.patch(f"{URL}{a.id}/", {"title": "y"}, format="json").status_code, 403)

    def test_title_required_and_dates_checked(self):
        c = self.as_user(self.admin)
        self.assertEqual(c.post(URL, {"title": "  ", "audience": "patients"}, format="json").status_code, 400)
        res = c.post(URL, {"title": "x", "start_date": "2026-11-05", "end_date": "2026-11-01"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_status_labels(self):
        d = datetime.timedelta(days=1)
        self.make(title="live")
        self.make(title="soon", start_date=self.today + d)
        self.make(title="past", end_date=self.today - d)
        self.make(title="off", is_active=False)
        rows = {r["title"]: r["status"] for r in self.as_user(self.admin).get(URL).data}
        self.assertEqual(rows, {"live": "live", "soon": "scheduled", "past": "ended", "off": "off"})

    def test_patients_see_only_live_patient_notices(self):
        d = datetime.timedelta(days=1)
        self.make(title="shown")
        self.make(title="everyone", audience="everyone")
        self.make(title="staff only", audience="staff")
        self.make(title="soon", start_date=self.today + d)
        self.make(title="past", end_date=self.today - d)
        self.make(title="off", is_active=False)
        self.make(title="other org", organization=self.other_org)
        titles = sorted(r["title"] for r in self.as_user(self.patient).get(URL).data)
        self.assertEqual(titles, ["everyone", "shown"])

    def test_staff_audience_reaches_non_patients(self):
        self.make(title="for staff", audience="staff")
        self.make(title="for patients")
        titles = [r["title"] for r in self.as_user(self.nurse).get(URL).data]
        self.assertEqual(titles, ["for staff"])

    def test_portal_view_applies_the_audience_filter_to_admins_too(self):
        self.make(title="shown")
        self.make(title="off", is_active=False)
        res = self.as_user(self.admin).get(URL + "?view=portal")
        self.assertEqual([r["title"] for r in res.data], [])  # admin is staff: patient notice not theirs

    def test_other_organization_is_invisible(self):
        a = self.make()
        self.assertEqual(self.as_user(self.stranger).get(URL).data, [])
        self.assertEqual(self.as_user(self.stranger).get(f"{URL}{a.id}/").status_code, 404)

    def test_attachment_rules(self):
        a = self.make()
        c = self.as_user(self.admin)
        ok = c.post(f"{URL}{a.id}/attachments/", {"file": SimpleUploadedFile("hours.pdf", b"%PDF-1.4 x", "application/pdf")}, format="multipart")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.data["name"], "hours.pdf")
        self.assertTrue(ok.data["url"].endswith("/hours.pdf"))
        bad = c.post(f"{URL}{a.id}/attachments/", {"file": SimpleUploadedFile("run.exe", b"x")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.as_user(self.patient).post(f"{URL}{a.id}/attachments/", {"file": SimpleUploadedFile("a.pdf", b"x")}, format="multipart").status_code, 403)
        listed = self.as_user(self.patient).get(URL)  # not in audience? patients audience yes
        self.assertEqual(len(listed.data[0]["attachments"]), 1)
        gone = c.delete(f"{URL}{a.id}/attachments/{ok.data['id']}/")
        self.assertEqual(gone.status_code, 204)
        self.assertEqual(a.attachments.count(), 0)

    def test_file_count_limit(self):
        a = self.make()
        c = self.as_user(self.admin)
        for i in range(5):
            self.assertEqual(c.post(f"{URL}{a.id}/attachments/", {"file": SimpleUploadedFile(f"f{i}.txt", b"x")}, format="multipart").status_code, 201)
        self.assertEqual(c.post(f"{URL}{a.id}/attachments/", {"file": SimpleUploadedFile("f6.txt", b"x")}, format="multipart").status_code, 400)
