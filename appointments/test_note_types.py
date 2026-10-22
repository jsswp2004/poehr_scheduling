"""Note types: NoteTemplate.note_type, backed by the note_types Dictionary."""

import importlib

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .models import NOTE_TYPES_DICTIONARY_CODE, Dictionary, DictionaryItem, NoteTemplate


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


def field(key="f1"):
    return {
        "client_id": key,
        "key": key,
        "label": "A field",
        "field_type": "text",
        "section_label": "",
        "tab_label": "",
        "required": False,
        "help_text": "",
        "sort_order": 0,
    }


class NoteTypeTests(TestCase):
    def setUp(self):
        User = get_user_model()
        org = Organization.objects.create(name="Clinic")
        self.admin = User.objects.create_user(
            username="adm", email="a@x.com", password="pw-12345-xyz", role="admin", organization=org
        )
        self.nurse = User.objects.create_user(
            username="nur", email="n@x.com", password="pw-12345-xyz", role="nurse", organization=org
        )
        self.api = client_for(self.admin)
        # Run the migration's seed step explicitly: the sqlite test settings build the schema
        # without running data migrations.
        importlib.import_module("appointments.migrations.0067_note_template_note_type").seed_note_types(apps, None)
        self.types = Dictionary.objects.get(code=NOTE_TYPES_DICTIONARY_CODE)

    def payload(self, **extra):
        body = {"code": "wound_care", "name": "Wound Care", "kind": "note", "is_active": True, "fields": [field()]}
        body.update(extra)
        return body

    # ---- migration seed
    def test_migration_seeded_the_dictionary_and_known_templates(self):
        values = list(self.types.items.order_by("sort_order").values_list("value", flat=True))
        self.assertEqual(values, ["assessment", "triage", "progress", "admission", "discharge", "procedure"])
        triage = NoteTemplate.objects.filter(code="triage_note").first()
        if triage:
            self.assertEqual(triage.note_type, "triage")

    # ---- template create / update
    def test_create_with_note_type_returns_the_label(self):
        res = self.api.post("/api/admin/note-templates/", self.payload(note_type="progress"), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["note_type"], "progress")
        self.assertEqual(res.json()["note_type_label"], "Progress")

    def test_blank_note_type_is_allowed(self):
        res = self.api.post("/api/admin/note-templates/", self.payload(), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["note_type"], "")
        self.assertEqual(res.json()["note_type_label"], "")

    def test_unknown_note_type_is_rejected(self):
        res = self.api.post("/api/admin/note-templates/", self.payload(note_type="nonsense"), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("note_type", res.json())

    def test_update_changes_note_type_without_bumping_version(self):
        created = self.api.post("/api/admin/note-templates/", self.payload(note_type="progress"), format="json").json()
        same_field = dict(field(), client_id=str(created["fields"][0]["id"]))
        res = self.api.put(
            "/api/admin/note-templates/wound_care/",
            self.payload(note_type="procedure", fields=[same_field]),
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["note_type"], "procedure")
        self.assertEqual(res.json()["version"], 1)

    def test_list_includes_note_type(self):
        self.api.post("/api/admin/note-templates/", self.payload(note_type="triage"), format="json")
        rows = self.api.get("/api/admin/note-templates/").json()
        row = [r for r in rows if r["code"] == "wound_care"][0]
        self.assertEqual(row["note_type_label"], "Triage")

    def test_renaming_the_label_flows_through(self):
        self.api.post("/api/admin/note-templates/", self.payload(note_type="progress"), format="json")
        DictionaryItem.objects.filter(dictionary=self.types, value="progress").update(label="Progress note")
        row = self.api.get("/api/admin/note-templates/wound_care/").json()
        self.assertEqual(row["note_type_label"], "Progress note")

    # ---- dictionary management
    def dictionary_body(self, items):
        return {"code": "note_types", "name": "Note types", "description": "", "items": items}

    def current_items(self):
        return self.api.get(f"/api/admin/dictionaries/{self.types.id}/").json()["items"]

    def test_add_a_value(self):
        items = self.current_items() + [{"value": "consult", "label": "Consult", "sort_order": 70}]
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(items), format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(self.types.items.filter(value="consult").exists())

    def test_usage_count_per_value(self):
        self.api.post("/api/admin/note-templates/", self.payload(note_type="progress"), format="json")
        items = {i["value"]: i["usage_count"] for i in self.current_items()}
        self.assertEqual(items["progress"], 1 + NoteTemplate.objects.filter(code="progress_note").count())
        self.assertEqual(items["discharge"], 0)

    def test_unused_value_can_be_deleted(self):
        items = [i for i in self.current_items() if i["value"] != "discharge"]
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(items), format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(self.types.items.filter(value="discharge").exists())

    def test_value_in_use_cannot_be_deleted(self):
        self.api.post("/api/admin/note-templates/", self.payload(note_type="procedure"), format="json")
        items = [i for i in self.current_items() if i["value"] != "procedure"]
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(items), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("items", res.json())
        self.assertTrue(self.types.items.filter(value="procedure").exists())

    def test_value_in_use_cannot_change_its_stored_value_but_can_change_its_label(self):
        self.api.post("/api/admin/note-templates/", self.payload(note_type="procedure"), format="json")
        items = self.current_items()
        for i in items:
            if i["value"] == "procedure":
                i["value"] = "procedures"
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(items), format="json")
        self.assertEqual(res.status_code, 400)

        items = self.current_items()
        for i in items:
            if i["value"] == "procedure":
                i["label"] = "Procedure note"
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(items), format="json")
        self.assertEqual(res.status_code, 200, res.content)

    def test_dictionary_is_flagged_system_and_cannot_be_deleted_or_recoded(self):
        data = self.api.get(f"/api/admin/dictionaries/{self.types.id}/").json()
        self.assertTrue(data["is_system"])
        res = self.api.delete(f"/api/admin/dictionaries/{self.types.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Dictionary.objects.filter(code=NOTE_TYPES_DICTIONARY_CODE).exists())
        body = self.dictionary_body(self.current_items())
        body["code"] = "renamed"
        res = self.api.put(f"/api/admin/dictionaries/{self.types.id}/", body, format="json")
        self.assertEqual(res.status_code, 400)

    def test_other_dictionaries_have_no_usage_count_on_items(self):
        other = Dictionary.objects.create(code="colors", name="Colors")
        other.items.create(value="red", label="Red", sort_order=1)
        data = self.api.get(f"/api/admin/dictionaries/{other.id}/").json()
        self.assertIsNone(data["items"][0]["usage_count"])
        self.assertFalse(data["is_system"])

    def test_nurse_cannot_edit_note_types(self):
        nurse = client_for(self.nurse)
        res = nurse.put(
            f"/api/admin/dictionaries/{self.types.id}/", self.dictionary_body(self.current_items()), format="json"
        )
        self.assertEqual(res.status_code, 403)


class NoteTypeAuthoringTests(TestCase):
    """Note type on a clinical note comes from the dictionary; each option says who may write it."""

    def setUp(self):
        from types import SimpleNamespace

        self.ns = SimpleNamespace
        User = get_user_model()
        self.org = Organization.objects.create(name="Clinic")
        mk = lambda name, role: User.objects.create_user(
            username=name, email=f"{name}@x.com", password="pw-12345-xyz", role=role, organization=self.org
        )
        self.admin, self.nurse, self.doctor, self.patient = mk("adm", "admin"), mk("nur", "nurse"), mk("doc", "doctor"), mk("pat", "patient")
        self.api = client_for(self.admin)
        importlib.import_module("appointments.migrations.0067_note_template_note_type").seed_note_types(apps, None)
        importlib.import_module("appointments.migrations.0068_note_type_from_dictionary").seed_legacy_note_types(apps, None)
        self.types = Dictionary.objects.get(code=NOTE_TYPES_DICTIONARY_CODE)

    def body(self, items):
        return {"code": "note_types", "name": "Note types", "description": "", "items": items}

    def items(self):
        return self.api.get(f"/api/admin/dictionaries/{self.types.id}/").json()["items"]

    def put(self, items):
        return self.api.put(f"/api/admin/dictionaries/{self.types.id}/", self.body(items), format="json")

    # ---- saving the dictionary
    def test_duplicate_value_is_a_400_not_a_server_error(self):
        items = self.items() + [{"value": "assessment", "label": "Physician assessment", "sort_order": 99}]
        res = self.put(items)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("more than once", str(res.json()))
        self.assertFalse(self.types.items.filter(label="Physician assessment").exists())

    def test_duplicate_value_ignoring_case_is_rejected(self):
        items = self.items() + [{"value": "Triage", "label": "Another triage", "sort_order": 99}]
        self.assertEqual(self.put(items).status_code, 400)

    def test_values_can_be_swapped_in_one_save(self):
        items = self.items()
        a = next(i for i in items if i["value"] == "discharge")
        b = next(i for i in items if i["value"] == "procedure")
        a["value"], b["value"] = "procedure", "discharge"
        res = self.put(items)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.types.items.get(id=a["id"]).value, "procedure")
        self.assertEqual(self.types.items.get(id=b["id"]).value, "discharge")

    def test_physician_assessment_can_be_added_with_a_role(self):
        items = self.items() + [{"value": "physician_assessment", "label": "Physician assessment", "sort_order": 99, "author_role": "doctor"}]
        res = self.put(items)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.types.items.get(value="physician_assessment").author_role, "doctor")

    def test_value_used_by_a_clinical_note_cannot_be_removed_or_revalued(self):
        from django.utils import timezone

        from .models import Appointment, ClinicalNote

        appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="V", appointment_datetime=timezone.now()
        )
        ClinicalNote.objects.create(
            organization=self.org, appointment=appt, patient=self.patient, author=self.doctor,
            note_type="doctor_assessment", status="signed", signed_at=timezone.now(),
        )
        without = [i for i in self.items() if i["value"] != "doctor_assessment"]
        self.assertEqual(self.put(without).status_code, 400)
        renamed = self.items()
        next(i for i in renamed if i["value"] == "doctor_assessment")["value"] = "physician"
        self.assertEqual(self.put(renamed).status_code, 400)
        relabeled = self.items()
        next(i for i in relabeled if i["value"] == "doctor_assessment")["label"] = "Physician assessment"
        self.assertEqual(self.put(relabeled).status_code, 200)

    # ---- who sees and who may write which type
    def test_note_types_endpoint_follows_author_role(self):
        nurse = client_for(self.nurse).get("/api/clinical-notes/note-types/").json()
        values = {i["value"] for i in nurse}
        self.assertIn("nursing_assessment", values)
        self.assertIn("triage", values)  # blank role = anyone
        self.assertNotIn("doctor_assessment", values)
        doctor = {i["value"] for i in client_for(self.doctor).get("/api/clinical-notes/note-types/").json()}
        self.assertIn("doctor_assessment", doctor)
        self.assertNotIn("nursing_assessment", doctor)
        admin = {i["value"] for i in self.api.get("/api/clinical-notes/note-types/").json()}
        self.assertTrue({"nursing_assessment", "doctor_assessment", "triage"} <= admin)

    def test_create_permission_uses_the_dictionary(self):
        from .permissions import CanAuthorClinicalNoteType

        def allowed(user, note_type):
            req = self.ns(user=user, data={"note_type": note_type})
            return CanAuthorClinicalNoteType().has_permission(req, self.ns(action="create"))

        self.assertTrue(allowed(self.nurse, "nursing_assessment"))
        self.assertFalse(allowed(self.nurse, "doctor_assessment"))
        self.assertTrue(allowed(self.doctor, "doctor_assessment"))
        self.assertFalse(allowed(self.doctor, "nursing_assessment"))
        self.assertTrue(allowed(self.nurse, "triage"))  # anyone
        self.assertTrue(allowed(self.admin, "doctor_assessment"))
        self.assertFalse(allowed(self.nurse, "not_a_type"))
        DictionaryItem.objects.filter(dictionary=self.types, value="triage").update(author_role="nurse")
        self.assertFalse(allowed(self.doctor, "triage"))
