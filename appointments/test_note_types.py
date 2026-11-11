"""Note types: NoteTemplate.note_type, backed by the note_types Dictionary."""

import importlib

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .models import NOTE_TYPES_DICTIONARY_CODE, Dictionary, DictionaryItem, NoteFieldDefinition, NoteTemplate


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

    # ---- Document ownership decides which templates each role is offered and may use
    def _owned_templates(self):
        for code, owner in (("own_nursing", "nursing"), ("own_physician", "physician"), ("own_ancillary", "ancillary"), ("own_blank", "")):
            NoteTemplate.objects.create(code=code, name=code, kind="note", ownership=owner, is_active=True)

    def _codes(self, user):
        res = client_for(user).get("/api/note-templates/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        rows = data["results"] if isinstance(data, dict) else data
        return {r["code"] for r in rows if r["code"].startswith("own_")}

    def test_templates_listed_by_document_ownership(self):
        self._owned_templates()
        self.assertEqual(self._codes(self.nurse), {"own_nursing", "own_blank"})
        self.assertEqual(self._codes(self.doctor), {"own_physician", "own_blank"})
        self.assertEqual(self._codes(self.admin), {"own_nursing", "own_physician", "own_ancillary", "own_blank"})

    def _units(self):
        from .models import Facility, Unit

        fac = Facility.objects.create(organization=self.org, name="General Hospital", kind="hospital")
        return Unit.objects.create(facility=fac, name="3 West", care_type="inpatient"), Unit.objects.create(
            facility=fac, name="ICU", care_type="inpatient"
        )

    def test_template_can_be_limited_to_chosen_locations(self):
        west, icu = self._units()
        body = {"code": "loc_note", "name": "Loc Note", "kind": "note", "is_active": True, "fields": [field()],
                "all_locations": False, "location_ids": [west.id]}
        res = self.api.post("/api/admin/note-templates/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertFalse(res.json()["all_locations"])
        self.assertEqual(res.json()["location_ids"], [west.id])
        # offered where it is assigned, hidden elsewhere, and everywhere when no unit is asked about
        codes = lambda q: {r["code"] for r in (lambda d: d["results"] if isinstance(d, dict) else d)(self.api.get(f"/api/note-templates/{q}").json())}
        self.assertIn("loc_note", codes(f"?unit={west.id}"))
        self.assertNotIn("loc_note", codes(f"?unit={icu.id}"))
        self.assertIn("loc_note", codes(""))

    def test_all_locations_template_is_offered_in_every_unit(self):
        west, icu = self._units()
        NoteTemplate.objects.create(code="everywhere", name="Everywhere", kind="note", is_active=True)
        res = self.api.get(f"/api/note-templates/?unit={icu.id}").json()
        rows = res["results"] if isinstance(res, dict) else res
        self.assertIn("everywhere", {r["code"] for r in rows})

    def test_limiting_to_no_unit_is_refused_and_all_locations_clears_units(self):
        west, icu = self._units()
        body = {"code": "loc2", "name": "Loc 2", "kind": "note", "is_active": True, "fields": [field()], "all_locations": False, "location_ids": []}
        self.assertEqual(self.api.post("/api/admin/note-templates/", body, format="json").status_code, 400)
        body.update(all_locations=False, location_ids=[west.id, icu.id])
        made = self.api.post("/api/admin/note-templates/", body, format="json")
        self.assertEqual(made.status_code, 201)
        same_field = dict(field(), client_id=str(made.json()["fields"][0]["id"]))
        body.update(all_locations=True, location_ids=[west.id], fields=[same_field])
        res = self.api.put("/api/admin/note-templates/loc2/", body, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["location_ids"], [])

    def test_initial_assessment_and_progress_note_become_physician_templates(self):
        mod = importlib.import_module("appointments.migrations.0095_seed_soap_note_templates")
        mod.seed(apps, None)
        mod.seed(apps, None)  # running it again changes nothing
        for code in ("initial_assessment", "progress_note"):
            tpl = NoteTemplate.objects.get(code=code)
            self.assertEqual(tpl.ownership, "physician")
            self.assertEqual(list(tpl.fields.order_by("sort_order").values_list("key", flat=True)), ["subjective", "objective", "assessment", "plan"])
        self.assertIn("initial_assessment", {c for c in self._codes_all(self.doctor)})
        self.assertNotIn("initial_assessment", self._codes_all(self.nurse))

    def _codes_all(self, user):
        data = client_for(user).get("/api/note-templates/").json()
        return {r["code"] for r in (data["results"] if isinstance(data, dict) else data)}

    def test_a_note_written_before_the_template_existed_keeps_its_soap_form(self):
        from django.utils import timezone

        from .models import Appointment, ClinicalNote

        doctor = get_user_model().objects.create_user(
            username="doc2", email="d2@x.com", password="pw-12345-xyz", role="doctor", organization=self.nurse.organization
        )
        pat = get_user_model().objects.create_user(
            username="pat2", email="p2@x.com", password="pw-12345-xyz", role="patient", organization=self.nurse.organization
        )
        appt = Appointment.objects.create(organization=pat.organization, patient=pat, provider=doctor, title="x", appointment_datetime=timezone.now())
        note = ClinicalNote.objects.create(
            organization=pat.organization, appointment=appt, patient=pat, author=doctor, note_type="doctor_assessment",
            documentation_type="initial_assessment", subjective="old text", status="draft",
        )
        importlib.import_module("appointments.migrations.0095_seed_soap_note_templates").seed(apps, None)
        res = client_for(doctor).patch(
            f"/api/clinical-notes/{note.pk}/", {"documentation_type": "initial_assessment", "subjective": "edited"}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.content)
        note.refresh_from_db()
        self.assertIsNone(note.template_id)
        self.assertEqual(note.subjective, "edited")

    def test_documentation_type_alone_cannot_sidestep_ownership(self):
        from .permissions import CanAuthorClinicalNoteType

        importlib.import_module("appointments.migrations.0095_seed_soap_note_templates").seed(apps, None)
        req = lambda user: self.ns(user=user, data={"note_type": "triage", "documentation_type": "initial_assessment"})
        view = self.ns(action="create")
        self.assertFalse(CanAuthorClinicalNoteType().has_permission(req(self.nurse), view))
        self.assertTrue(CanAuthorClinicalNoteType().has_permission(req(self.doctor), view))

    def test_create_refuses_another_disciplines_template(self):
        from .permissions import CanAuthorClinicalNoteType

        self._owned_templates()
        ids = {t.code: t.pk for t in NoteTemplate.objects.filter(code__startswith="own_")}

        def allowed(user, code):
            req = self.ns(user=user, data={"note_type": "triage", "template": ids[code]})
            return CanAuthorClinicalNoteType().has_permission(req, self.ns(action="create"))

        self.assertTrue(allowed(self.nurse, "own_nursing"))
        self.assertTrue(allowed(self.nurse, "own_blank"))
        self.assertFalse(allowed(self.nurse, "own_physician"))
        self.assertFalse(allowed(self.nurse, "own_ancillary"))
        self.assertTrue(allowed(self.doctor, "own_physician"))
        self.assertFalse(allowed(self.doctor, "own_nursing"))
        self.assertTrue(allowed(self.admin, "own_ancillary"))

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


class AllergyListInNotesMigrationTests(TestCase):
    """The Admission Note's blank allergy text box gains the chart's allergy list above it."""

    def _run(self):
        import importlib

        from django.apps import apps

        importlib.import_module("appointments.migrations.0097_allergy_chart_field_in_notes").add_allergy_list(apps, None)

    def _template(self, with_chart=False):
        t = NoteTemplate.objects.create(code="adm_x", name="Adm X", kind="note", is_active=True)
        NoteFieldDefinition.objects.create(template=t, key="hpi", label="HPI", field_type="textarea", sort_order=0)
        NoteFieldDefinition.objects.create(
            template=t, key="allergies", label="Allergies", field_type="textarea", required=True,
            section_label="History", sort_order=1,
        )
        NoteFieldDefinition.objects.create(template=t, key="plan", label="Plan", field_type="textarea", sort_order=2)
        if with_chart:
            NoteFieldDefinition.objects.create(
                template=t, key="al", label="Al", field_type="chart_data", calc={"source": "allergies"}, sort_order=3
            )
        return t

    def test_chart_allergy_list_is_added_above_the_text_box(self):
        t = self._template()
        self._run()
        keys = [f.key for f in t.fields.order_by("sort_order", "id")]
        self.assertEqual(keys, ["hpi", "allergy_list", "allergies", "plan"])
        lst = t.fields.get(key="allergy_list")
        self.assertEqual((lst.field_type, lst.calc, lst.section_label), ("chart_data", {"source": "allergies"}, "History"))
        text = t.fields.get(key="allergies")
        self.assertFalse(text.required)
        self.assertEqual(text.label, "Allergy comments")

    def test_rerun_and_templates_that_already_show_allergies_are_left_alone(self):
        t = self._template()
        self._run()
        self._run()
        self.assertEqual(t.fields.filter(key="allergy_list").count(), 1)
        NoteTemplate.objects.create(code="has_chart", name="Has chart", kind="note", is_active=True)
        t3 = NoteTemplate.objects.get(code="has_chart")
        NoteFieldDefinition.objects.create(template=t3, key="al", label="Al", field_type="chart_data", calc={"source": "allergies"}, sort_order=0)
        NoteFieldDefinition.objects.create(template=t3, key="allergies", label="Allergies", field_type="text", required=True, sort_order=1)
        self._run()
        self.assertEqual(list(t3.fields.order_by("sort_order").values_list("key", flat=True)), ["al", "allergies"])
        self.assertTrue(t3.fields.get(key="allergies").required)


class AdmissionAlignAndIcd10MigrationTests(TestCase):
    """Admission Note gains the H&P's sections without losing anything; diagnosis text boxes become ICD-10 pickers."""

    def _mod(self):
        import importlib

        return importlib.import_module("appointments.migrations.0099_align_admission_note_and_icd10_fields")

    def _run(self):
        from django.apps import apps

        self._mod().forwards(apps, None)

    def _f(self, t, key, ftype="text", tab="", section="", order=0, **kw):
        return NoteFieldDefinition.objects.create(template=t, key=key, label=key, field_type=ftype, tab_label=tab, section_label=section, sort_order=order, **kw)

    def _templates(self):
        hp = NoteTemplate.objects.create(code="new_patient_hp", name="H&P", kind="note", is_active=True)
        self._f(hp, "history_source", tab="Visit", section="Visit Information", order=0)
        self._f(hp, "chief_complaint", tab="Visit", section="Chief Complaint", order=1)
        self._f(hp, "pmh_conditions", "textarea", tab="History", section="Past Medical History", order=2)
        self._f(hp, "ros_skin_status", tab="Review of Systems", section="Review of Systems: Skin", order=3)
        self._f(hp, "allergy_status", tab="Medications & Allergies", section="Allergies", order=4)
        self._f(hp, "problem_1_name", tab="Assessment & Plan", section="Problem 1", order=5)
        self._f(hp, "problem_1_icd10", tab="Assessment & Plan", section="Problem 1", order=6)
        adm = NoteTemplate.objects.create(code="admission_note", name="Admission", kind="note", is_active=True)
        self._f(adm, "chief_complaint", tab="Visit", section="Visit", order=0, required=True)
        self._f(adm, "past_medical_history", "textarea", tab="History", section="History", order=1)
        self._f(adm, "ros_skin_status", tab="ROS", section="Review of Systems: Skin", order=2)
        self._f(adm, "legacy_only", "textarea", tab="Intake", section="Intake", order=3)
        self._f(adm, "plan", "textarea", tab="Assessment / Plan", section="Assessment / Plan", order=4)
        return hp, adm

    def test_admission_gains_hp_sections_and_loses_nothing(self):
        hp, adm = self._templates()
        before = set(adm.fields.values_list("key", flat=True))
        self._run()
        keys = list(adm.fields.order_by("sort_order").values_list("key", flat=True))
        self.assertTrue(before <= set(keys))
        self.assertIn("history_source", keys)
        self.assertIn("problem_1_name", keys)
        self.assertNotIn("allergy_status", keys)
        self.assertEqual(adm.fields.get(key="chief_complaint").section_label, "Chief Complaint")
        self.assertEqual(adm.fields.get(key="past_medical_history").section_label, "Past Medical History")
        self.assertEqual(adm.fields.get(key="ros_skin_status").tab_label, "Review of Systems")
        self.assertTrue(adm.fields.get(key="chief_complaint").required)
        self.assertLess(keys.index("history_source"), keys.index("chief_complaint"))
        self.assertLess(keys.index("chief_complaint"), keys.index("past_medical_history"))
        self.assertLess(keys.index("problem_1_name"), keys.index("plan") + 5)

    def test_problem_icd_code_becomes_the_picker_and_rerun_is_safe(self):
        hp, adm = self._templates()
        self._run()
        self._run()
        for t in (hp, adm):
            self.assertEqual(t.fields.get(key="problem_1_icd10").field_type, "icd10")
        self.assertEqual(adm.fields.filter(key="history_source").count(), 1)

    def test_other_diagnosis_boxes_become_icd10_and_missing_hp_is_a_no_op(self):
        t = NoteTemplate.objects.create(code="general_ambulatory_note", name="GA", kind="note", is_active=True)
        self._f(t, "dx_primary")
        self._f(t, "dx_other", "textarea")
        self._f(t, "diagnostic_results", "textarea")
        self._run()
        self.assertEqual(t.fields.get(key="dx_primary").field_type, "icd10")
        self.assertEqual(t.fields.get(key="dx_other").field_type, "icd10")
        self.assertEqual(t.fields.get(key="diagnostic_results").field_type, "textarea")


class PhysicianAdmissionNoteAlignmentTests(AdmissionAlignAndIcd10MigrationTests):
    def test_physician_admission_note_code_is_aligned_too(self):
        import importlib

        from django.apps import apps

        hp, adm = self._templates()
        adm.code = "admission_note_2"
        adm.save()
        importlib.import_module("appointments.migrations.0100_align_physician_admission_note").forwards(apps, None)
        keys = set(adm.fields.values_list("key", flat=True))
        self.assertIn("history_source", keys)
        self.assertIn("legacy_only", keys)


class TrimAdmissionAlignmentTests(AdmissionAlignAndIcd10MigrationTests):
    def test_trim_removes_only_the_new_sections(self):
        import importlib

        from django.apps import apps

        hp, adm = self._templates()
        self._f(hp, "pe_head_status", "radio", tab="Physical Exam", section="Physical Exam: Head", order=7)
        self._f(hp, "hpi_onset", tab="Visit", section="History of Present Illness", order=8)
        adm.code = "admission_note_2"
        adm.save()
        importlib.import_module("appointments.migrations.0100_align_physician_admission_note").forwards(apps, None)
        self.assertTrue(adm.fields.filter(key="problem_1_name").exists())
        importlib.import_module("appointments.migrations.0101_trim_admission_note_alignment").trim(apps, None)
        keys = set(adm.fields.values_list("key", flat=True))
        self.assertNotIn("history_source", keys)
        self.assertNotIn("problem_1_name", keys)
        self.assertNotIn("pe_head_status", keys)
        self.assertIn("hpi_onset", keys)
        self.assertIn("pmh_conditions", keys)
        self.assertIn("legacy_only", keys)
        self.assertIn("ros_skin_status", keys)
        self.assertIn("chief_complaint", keys)


class RestoreAdmissionSectionsTests(AdmissionAlignAndIcd10MigrationTests):
    def test_sections_come_back_and_own_fields_stay(self):
        import importlib

        from django.apps import apps

        hp, adm = self._templates()
        adm.code = "admission_note_2"
        adm.save()
        importlib.import_module("appointments.migrations.0100_align_physician_admission_note").forwards(apps, None)
        importlib.import_module("appointments.migrations.0101_trim_admission_note_alignment").trim(apps, None)
        self.assertFalse(adm.fields.filter(key="problem_1_name").exists())
        importlib.import_module("appointments.migrations.0102_restore_physician_admission_note_sections").forwards(apps, None)
        keys = set(adm.fields.values_list("key", flat=True))
        self.assertIn("problem_1_name", keys)
        self.assertIn("history_source", keys)
        self.assertIn("legacy_only", keys)
        self.assertEqual(adm.fields.get(key="problem_1_icd10").field_type, "icd10")


class AdmissionRosTabTests(AdmissionAlignAndIcd10MigrationTests):
    def test_blank_tab_review_of_systems_gets_its_own_tab_in_order(self):
        import importlib

        from django.apps import apps

        t = NoteTemplate.objects.create(code="admission_note_2", name="Adm", kind="note", is_active=True)
        self._f(t, "chief_complaint", tab="Visit", section="Chief Complaint", order=0)
        self._f(t, "vital_bp", tab="Physical Exam", section="Vital Signs", order=10)
        self._f(t, "plan", tab="Assessment & Plan", section="Plan", order=20)
        self._f(t, "ros_a", section="Review of Systems: General", order=30)
        self._f(t, "ros_b", section="Review of Systems: Skin", order=40)
        importlib.import_module("appointments.migrations.0103_admission_note_review_of_systems_tab").forwards(apps, None)
        keys = list(t.fields.order_by("sort_order").values_list("key", flat=True))
        self.assertEqual(keys, ["chief_complaint", "ros_a", "ros_b", "vital_bp", "plan"])
        self.assertEqual(t.fields.get(key="ros_a").tab_label, "Review of Systems")
