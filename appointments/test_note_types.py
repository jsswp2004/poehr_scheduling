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
