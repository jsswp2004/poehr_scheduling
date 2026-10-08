"""Orders: workflow rules (draft -> sign -> cosign -> complete / discontinue / replace),
frozen snapshots, required detail answers, and the interface hooks."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from . import orders_workflow as ow
from .models import (
    Appointment,
    NoteFieldDefinition,
    NoteTemplate,
    Order,
    Orderable,
    OrderSet,
    OrderSetItem,
)

User = get_user_model()


def make_user(username, role, org):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="pw-12345-xyz",
        role=role,
        organization=org,
    )


class OrdersBase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other_org = Organization.objects.create(name="Clinic B")
        self.doctor = make_user("doc", "doctor", self.org)
        self.doctor2 = make_user("doc2", "doctor", self.org)
        self.nurse = make_user("nurse", "nurse", self.org)
        self.registrar = make_user("reg", "registrar", self.org)
        self.patient = make_user("pat", "patient", self.org)
        self.appt = Appointment.objects.create(
            organization=self.org,
            patient=self.patient,
            provider=self.doctor,
            title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        self.cbc = Orderable.objects.create(
            code="cbc", name="CBC", category="laboratory", code_system="loinc", external_code="58410-2"
        )

    def draft(self, user=None, orderable=None, **kw):
        return ow.create_draft_order(user or self.doctor, self.appt, orderable or self.cbc, **kw)


class WorkflowTests(OrdersBase):
    def test_draft_gets_placer_number_and_snapshot_fields(self):
        o = self.draft()
        self.assertEqual(o.status, "draft")
        self.assertEqual(o.placer_order_number, f"ORD-{o.pk:08d}")
        self.assertEqual((o.orderable_name, o.external_code), ("CBC", "58410-2"))
        self.assertEqual(o.events.first().event_type, "created")

    def test_doctor_sign_goes_active(self):
        o = ow.sign_order(self.draft(), self.doctor)
        self.assertEqual(o.status, "active")
        self.assertFalse(o.cosign_required)
        self.assertEqual(o.signed_by, self.doctor)

    def test_nurse_order_needs_cosign_by_someone_else(self):
        o = ow.sign_order(self.draft(self.nurse), self.nurse)
        self.assertEqual(o.status, "pending_cosign")
        with self.assertRaises(ow.OrderWorkflowError):
            ow.cosign_order(o, self.nurse)
        o = ow.cosign_order(o, self.doctor)
        self.assertEqual((o.status, o.cosigned_by), ("active", self.doctor))

    def test_flagged_orderable_needs_cosign_even_for_doctor(self):
        self.cbc.requires_cosign = True
        self.cbc.save()
        o = ow.sign_order(self.draft(), self.doctor)
        self.assertEqual(o.status, "pending_cosign")
        self.assertEqual(ow.cosign_order(o, self.doctor2).status, "active")

    def test_only_ordering_provider_signs(self):
        o = self.draft()
        with self.assertRaises(ow.OrderWorkflowError) as cm:
            ow.sign_order(o, self.doctor2)
        self.assertEqual(cm.exception.status_code, 403)

    def test_draft_edit_ok_signed_edit_refused(self):
        o = self.draft()
        o = ow.update_draft_order(o, self.doctor, indication="anemia", priority="urgent")
        self.assertEqual((o.indication, o.priority), ("anemia", "urgent"))
        ow.sign_order(o, self.doctor)
        with self.assertRaises(ow.OrderWorkflowError):
            ow.update_draft_order(o, self.doctor, indication="x")

    def test_complete_requires_active(self):
        o = self.draft()
        with self.assertRaises(ow.OrderWorkflowError):
            ow.complete_order(o, self.doctor)
        ow.sign_order(o, self.doctor)
        o = ow.complete_order(o, self.nurse, result_text="Normal")
        self.assertEqual((o.status, o.result_text, o.completed_by), ("completed", "Normal", self.nurse))

    def test_discontinue_needs_reason_and_open_status(self):
        o = ow.sign_order(self.draft(), self.doctor)
        with self.assertRaises(ow.OrderWorkflowError):
            ow.discontinue_order(o, self.doctor, "  ")
        o = ow.discontinue_order(o, self.doctor, "Duplicate")
        self.assertEqual((o.status, o.discontinue_reason), ("discontinued", "Duplicate"))
        with self.assertRaises(ow.OrderWorkflowError):
            ow.discontinue_order(o, self.doctor, "again")

    def test_replace_discontinues_old_and_links_new_draft(self):
        o = ow.sign_order(self.draft(indication="a"), self.doctor)
        old, new = ow.replace_order(o, self.doctor, "Wrong test")
        self.assertEqual(old.status, "discontinued")
        self.assertEqual((new.status, new.replaces_id, new.indication), ("draft", old.pk, "a"))

    def test_sign_orders_is_all_or_nothing(self):
        tpl = NoteTemplate.objects.create(code="cbc_form", name="CBC form", kind="order_detail")
        NoteFieldDefinition.objects.create(
            template=tpl, key="fasting", label="Fasting", field_type="text", required=True
        )
        needs = Orderable.objects.create(code="gluc", name="Glucose", detail_template=tpl)
        good, bad = self.draft(), self.draft(orderable=needs)
        with self.assertRaises(ow.OrderWorkflowError):
            ow.sign_orders([good, bad], self.doctor)
        good.refresh_from_db()
        self.assertEqual(good.status, "draft")

    def test_required_detail_enforced_then_snapshot_frozen(self):
        tpl = NoteTemplate.objects.create(code="gluc_form", name="Glucose form", kind="order_detail")
        NoteFieldDefinition.objects.create(
            template=tpl, key="fasting", label="Fasting", field_type="text", required=True
        )
        gl = Orderable.objects.create(code="gluc", name="Glucose", detail_template=tpl)
        o = self.draft(orderable=gl)
        with self.assertRaises(ow.OrderWorkflowError) as cm:
            ow.sign_order(o, self.doctor)
        self.assertIn("Fasting", cm.exception.message)
        o = ow.update_draft_order(o, self.doctor, detail={"fasting": "yes"})
        ow.sign_order(o, self.doctor)
        # Renaming the orderable or the template afterwards never touches the signed order.
        gl.name = "Renamed"
        gl.save()
        NoteFieldDefinition.objects.filter(template=tpl).update(label="Changed")
        o.refresh_from_db()
        self.assertEqual(o.orderable_name, "Glucose")
        self.assertEqual(o.detail_template_snapshot["fields"][0]["label"], "Fasting")

    def test_other_orgs_orderable_and_visit_refused(self):
        theirs = Orderable.objects.create(code="x", name="X", organization=self.other_org)
        with self.assertRaises(ow.OrderWorkflowError):
            self.draft(orderable=theirs)
        outsider = make_user("out", "doctor", self.other_org)
        with self.assertRaises(ow.OrderWorkflowError):
            ow.create_draft_order(outsider, self.appt, self.cbc)

    def test_order_set_places_drafts(self):
        s = OrderSet.objects.create(code="adm", name="Admission")
        OrderSetItem.objects.create(order_set=s, orderable=self.cbc, sort_order=1)
        orders = ow.place_order_set(self.doctor, s, self.appt)
        self.assertEqual([o.status for o in orders], ["draft"])
        self.assertEqual(orders[0].order_set, s)

    def test_events_are_logged_in_order(self):
        o = ow.sign_order(self.draft(), self.doctor)
        ow.complete_order(o, self.doctor)
        self.assertEqual(
            list(o.events.order_by("pk").values_list("event_type", flat=True)),
            ["created", "signed", "completed"],
        )


class InterfaceTests(OrdersBase):
    def test_interface_cannot_touch_unsigned(self):
        with self.assertRaises(ow.OrderWorkflowError):
            ow.apply_interface_update(self.draft(), self.doctor, interface_status="sent")

    def test_interface_progress_and_results(self):
        o = ow.sign_order(self.draft(), self.doctor)
        o = ow.apply_interface_update(
            o, self.doctor, filler_order_number="LAB-77", interface_status="acknowledged", status="in_progress"
        )
        self.assertEqual((o.status, o.filler_order_number), ("in_progress", "LAB-77"))
        o = ow.apply_interface_update(o, self.doctor, status="completed", result_text="WBC 6.1")
        self.assertEqual((o.status, o.result_text), ("completed", "WBC 6.1"))
        self.assertTrue(o.events.filter(source="interface").exists())

    def test_interface_rejects_bad_status(self):
        o = ow.sign_order(self.draft(), self.doctor)
        with self.assertRaises(ow.OrderWorkflowError):
            ow.apply_interface_update(o, self.doctor, interface_status="bogus")
        with self.assertRaises(ow.OrderWorkflowError):
            ow.apply_interface_update(o, self.doctor, status="active")


class ApiTests(OrdersBase):
    def client_for(self, user):
        # a real token, so the tenant-scoped Appointment manager knows the clinic (force_authenticate sets none)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def test_create_sign_complete_over_api(self):
        c = self.client_for(self.doctor)
        r = c.post("/api/orders/", {"appointment": self.appt.pk, "orderable": self.cbc.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        oid = r.json()["id"]
        r = c.post(f"/api/orders/{oid}/sign/")
        self.assertEqual((r.status_code, r.json()["status"]), (200, "active"), r.content)
        r = c.post(f"/api/orders/{oid}/complete/", {"result_text": "ok"}, format="json")
        self.assertEqual(r.json()["status"], "completed")

    def test_registrar_has_no_access(self):
        self.assertEqual(self.client_for(self.registrar).get("/api/orders/").status_code, 403)

    def test_nurse_cannot_use_interface_endpoints(self):
        o = ow.sign_order(self.draft(), self.doctor)
        c = self.client_for(self.nurse)
        self.assertEqual(c.get("/api/orders/interface-queue/").status_code, 403)
        self.assertEqual(
            c.post(f"/api/orders/{o.pk}/interface-update/", {"status": "in_progress"}, format="json").status_code,
            403,
        )

    def test_signed_order_cannot_be_deleted_or_patched(self):
        o = ow.sign_order(self.draft(), self.doctor)
        c = self.client_for(self.doctor)
        self.assertEqual(c.delete(f"/api/orders/{o.pk}/").status_code, 400)
        self.assertEqual(c.patch(f"/api/orders/{o.pk}/", {"indication": "x"}, format="json").status_code, 400)

    def test_other_org_cannot_see_order(self):
        o = self.draft()
        outsider = make_user("out", "doctor", self.other_org)
        self.assertEqual(self.client_for(outsider).get(f"/api/orders/{o.pk}/").status_code, 404)

    def test_sign_many_all_or_nothing_and_replace(self):
        c = self.client_for(self.doctor)
        a, b = self.draft(), self.draft()
        r = c.post("/api/orders/sign/", {"ids": [a.pk, b.pk]}, format="json")
        self.assertEqual([x["status"] for x in r.json()], ["active", "active"])
        r = c.post(f"/api/orders/{a.pk}/replace/", {"reason": "Wrong"}, format="json")
        self.assertEqual((r.status_code, r.json()["status"], r.json()["replaces"]), (201, "draft", a.pk))


class CatalogAdminTests(OrdersBase):
    CSV = (
        "code,name,category,code_system,external_code,default_priority,requires_cosign,detail_form_code\n"
        "cbc_diff,CBC with differential,laboratory,loinc,57021-8,routine,no,\n"
        "chest_xr,Chest X-ray,imaging,local,,urgent,yes,xr_form\n"
    )

    def setUp(self):
        super().setUp()
        self.admin = make_user("adm", "admin", self.org)
        self.client_admin = APIClient()
        self.client_admin.force_authenticate(self.admin)
        NoteTemplate.objects.create(code="xr_form", name="XR form", kind="order_detail")

    def upload(self, text, client=None):
        from django.core.files.uploadedfile import SimpleUploadedFile

        f = SimpleUploadedFile("o.csv", text.encode("utf-8"), content_type="text/csv")
        return (client or self.client_admin).post("/api/admin/orderables/upload-csv/", {"file": f}, format="multipart")

    def test_upload_creates_then_updates(self):
        r = self.upload(self.CSV)
        self.assertEqual((r.status_code, r.json()["created"], r.json()["updated"]), (200, 2, 0), r.content)
        xr = Orderable.objects.get(code="chest_xr")
        self.assertEqual((xr.organization, xr.default_priority, xr.requires_cosign), (self.org, "urgent", True))
        self.assertEqual(xr.detail_template.code, "xr_form")
        r = self.upload(self.CSV.replace("Chest X-ray", "Chest XR 2 view"))
        self.assertEqual((r.json()["created"], r.json()["updated"]), (0, 2))
        self.assertEqual(Orderable.objects.get(code="chest_xr").name, "Chest XR 2 view")

    @staticmethod
    def big_csv(n, extra=""):
        head = "code,name,category,code_system,external_code,description,default_priority,requires_cosign,detail_form_code,is_active\n"
        return head + "".join(f'item_{i},Item {i},nursing,local,,"note, {i}{extra}",routine,no,,yes\n' for i in range(n))

    def test_large_catalog_uploads_in_a_handful_of_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as q:
            r = self.upload(self.big_csv(2000))
        self.assertEqual((r.status_code, r.json()["created"]), (200, 2000), r.content)
        self.assertLess(len(q), 40)  # not one query per row
        with CaptureQueriesContext(connection) as q:
            r = self.upload(self.big_csv(2000).replace("nursing", "medication"))
        self.assertEqual((r.json()["created"], r.json()["updated"]), (0, 2000))
        self.assertLess(len(q), 40)
        row = Orderable.objects.get(code="item_7")
        self.assertEqual((row.category, row.organization), ("medication", self.org))

    def test_update_by_upload_changes_every_field_and_the_time(self):
        self.upload(self.CSV)
        before = Orderable.objects.get(code="cbc_diff").updated_at
        csv_text = (
            "code,name,description,default_priority,requires_cosign,is_active,category\n"
            "cbc_diff,CBC new name,new text,stat,yes,no,laboratory\n"
        )
        r = self.upload(csv_text)
        self.assertEqual((r.status_code, r.json()["updated"]), (200, 1), r.content)
        o = Orderable.objects.get(code="cbc_diff")
        self.assertEqual((o.name, o.description, o.default_priority, o.requires_cosign, o.is_active), ("CBC new name", "new text", "stat", True, False))
        self.assertGreater(o.updated_at, before)

    def test_a_file_with_every_line_wrapped_in_quotes_is_read_normally(self):
        lines = self.CSV.strip().split("\n")
        wrapped = "\r\n".join('"' + l.replace('"', '""') + '"' for l in lines) + "\r\n"
        r = self.upload("\ufeff" + wrapped)
        self.assertEqual((r.status_code, r.json()["created"]), (200, 2), r.content)
        self.assertEqual(Orderable.objects.get(code="cbc_diff").external_code, "57021-8")

    def test_a_normal_quoted_header_is_left_alone(self):
        text = '"code","name"\n"a_b","Quoted, name"\n'
        r = self.upload(text)
        self.assertEqual((r.status_code, r.json()["created"]), (200, 1), r.content)
        self.assertEqual(Orderable.objects.get(code="a_b").name, "Quoted, name")

    def test_control_characters_from_a_database_export_are_dropped(self):
        r = self.upload(self.big_csv(3, extra="\x00\x07"))
        self.assertEqual((r.status_code, r.json()["created"]), (200, 3), r.content)
        self.assertEqual(Orderable.objects.get(code="item_1").description, "note, 1")

    def test_bad_csv_saves_nothing_and_lists_problems(self):
        bad = self.CSV + "x y,Bad code,nope,local,,routine,maybe,missing_form\n"
        r = self.upload(bad)
        self.assertEqual(r.status_code, 400)
        cols = {e["column"] for e in r.json()["errors"]}
        self.assertTrue({"code", "category", "requires_cosign", "detail_form_code"} <= cols, r.json())
        self.assertFalse(Orderable.objects.filter(code="cbc_diff").exists())

    def test_cannot_take_over_other_orgs_or_shared_code(self):
        Orderable.objects.create(code="cbc_diff", name="Theirs", organization=self.other_org)
        r = self.upload(self.CSV)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Orderable.objects.get(code="cbc_diff").name, "Theirs")
        self.assertEqual(Orderable.objects.get(code="cbc_diff").organization, self.other_org)
        # the shared catalog entry (self.cbc has no organization) is also off limits
        r = self.upload("code,name\ncbc,Mine\n")
        self.assertEqual(r.status_code, 400)

    def test_org_admin_cannot_edit_or_delete_shared_entry_but_can_see_it(self):
        listing = self.client_admin.get("/api/admin/orderables/").json()
        self.assertIn("cbc", [o["code"] for o in (listing if isinstance(listing, list) else listing["results"])])
        r = self.client_admin.patch(f"/api/admin/orderables/{self.cbc.pk}/", {"name": "Hacked"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client_admin.delete(f"/api/admin/orderables/{self.cbc.pk}/").status_code, 403)
        self.cbc.refresh_from_db()
        self.assertEqual(self.cbc.name, "CBC")

    def test_create_forces_own_org_and_rejects_note_template_as_detail_form(self):
        note_tpl = NoteTemplate.objects.create(code="soap2", name="Note", kind="note")
        r = self.client_admin.post(
            "/api/admin/orderables/",
            {"code": "ua", "name": "Urinalysis", "organization": self.other_org.pk},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Orderable.objects.get(code="ua").organization, self.org)
        r = self.client_admin.post(
            "/api/admin/orderables/",
            {"code": "ua2", "name": "UA2", "detail_template": note_tpl.pk},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_used_orderable_delete_is_refused_with_message(self):
        mine = Orderable.objects.create(code="mine", name="Mine", organization=self.org)
        self.draft(orderable=mine)
        r = self.client_admin.delete(f"/api/admin/orderables/{mine.pk}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("deactivate", r.json()["detail"])

    def test_doctor_cannot_use_admin_catalog(self):
        c = APIClient()
        c.force_authenticate(self.doctor)
        self.assertEqual(c.get("/api/admin/orderables/").status_code, 403)

    def test_sample_and_download_csv_round_trip(self):
        self.upload(self.CSV)
        self.assertEqual(self.client_admin.get("/api/admin/orderables/sample-csv/").status_code, 200)
        r = self.client_admin.get("/api/admin/orderables/download-csv/")
        text = r.content.decode()
        self.assertIn("cbc_diff", text)
        self.assertIn("xr_form", text)
        # re-uploading the export is accepted (round trip)
        self.assertEqual(self.upload(text).status_code, 200)

    def test_order_set_admin_replaces_items(self):
        a = Orderable.objects.create(code="a", name="A", organization=self.org)
        b = Orderable.objects.create(code="b", name="B", organization=self.org)
        r = self.client_admin.post(
            "/api/admin/order-sets/",
            {"code": "adm", "name": "Admission", "items": [{"orderable": a.pk}, {"orderable": b.pk, "default_priority": "stat"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        sid = r.json()["id"]
        r = self.client_admin.put(
            f"/api/admin/order-sets/{sid}/",
            {"code": "adm", "name": "Admission", "items": [{"orderable": b.pk}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        s = OrderSet.objects.get(pk=sid)
        self.assertEqual([i.orderable_id for i in s.items.order_by("sort_order")], [b.pk])
        self.assertEqual(s.organization, self.org)
