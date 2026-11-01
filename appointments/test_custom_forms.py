from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from .models import CustomForm, CustomFormAnswer, CustomFormItem

User = get_user_model()
FORMS = "/api/custom-forms/"


def make_user(username, role, org):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org
    )


def item(label, kind="text", **kw):
    return {"label": label, "item_type": kind, **kw}


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.registrar = make_user("reg", "registrar", self.org)
        self.nurse = make_user("nur", "nurse", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.outsider = make_user("out", "admin", self.other)
        self.patient_user = make_user("pat", "patient", self.org)
        self.patient = Patient.objects.get(user=self.patient_user)
        self.patient.organization = self.org
        self.patient.save()
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def save_form(self, form, user=None):
        return self.as_user(user or self.admin).put(FORMS, {"form": form}, format="json")

    def saved(self, form):
        """Saves a form and returns just that form from the list the server sends back."""
        r = self.save_form(form)
        self.assertEqual(r.status_code, 200, r.content)
        return next(f for f in r.json()["forms"] if f["name"] == form["name"])


class BuilderTests(Base):
    def basic(self, **kw):
        return {"name": "Transportation needs", "used_as": "visit", "roles": [], "items": [item("Needs a ride", "yes_no"), item("Needs wheelchair", "yes_no", show_when=0, show_when_value="yes")], **kw}

    def test_save_and_read_back_with_dependency(self):
        r = self.save_form(self.basic())
        self.assertEqual(r.status_code, 200, r.content)
        form = r.json()["forms"][0]
        self.assertEqual([i["label"] for i in form["items"]], ["Needs a ride", "Needs wheelchair"])
        self.assertEqual((form["items"][1]["show_when"], form["items"][1]["show_when_value"]), (0, "yes"))
        self.assertIsNone(form["items"][0]["show_when"])
        self.assertEqual(CustomFormItem.objects.get(label="Needs wheelchair").show_when_item.label, "Needs a ride")

    def test_edit_keeps_ids_and_answers_and_drops_removed_items(self):
        form = self.save_form(self.basic()).json()["forms"][0]
        first = form["items"][0]["id"]
        CustomFormAnswer.objects.create(item_id=first, patient=self.patient, value="yes")
        form["items"][0]["label"] = "Needs a ride today"
        form["items"].pop(1)
        r = self.save_form(form)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(CustomFormItem.objects.count(), 1)
        self.assertEqual(CustomFormItem.objects.get().pk, first)
        self.assertEqual(CustomFormAnswer.objects.count(), 1)

    def test_choice_list(self):
        r = self.save_form({"name": "Language access", "items": [item("Interpreter type", "dictionary", options=["Phone", "In person", " "])]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["forms"][0]["items"][0]["options"], ["Phone", "In person"])

    def test_rules(self):
        cases = [
            ({"name": " ", "items": [item("a")]}, "needs a name"),
            ({"name": "x", "items": []}, "at least one question"),
            ({"name": "x", "items": [item(" ")]}, "needs a label"),
            ({"name": "x", "items": [item("a", "weird")]}, "unknown type"),
            ({"name": "x", "items": [item("a", "dictionary", options=[])]}, "at least one choice"),
            ({"name": "x", "items": [item("a", "dictionary", options=["A", "a"])]}, "twice"),
            ({"name": "x", "used_as": "family", "items": [item("a")]}, "patient or for the visit"),
            ({"name": "x", "roles": ["wizard"], "items": [item("a")]}, "Unknown role"),
            ({"name": "x", "items": [item("a", show_when=0, show_when_value="yes")]}, "above it"),
            ({"name": "x", "items": [item("a"), item("b", show_when=0)]}, "needs the answer"),
            ({"name": "x", "items": [item("a")] * 41}, "at most 40"),
        ]
        for form, text in cases:
            r = self.save_form(form)
            self.assertEqual(r.status_code, 400, form)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(CustomForm.objects.count(), 0)

    def test_duplicate_name(self):
        self.save_form(self.basic())
        r = self.save_form(self.basic())
        self.assertEqual(r.status_code, 400)
        self.assertIn("already exists", r.json()["detail"])

    def test_only_admins_build(self):
        self.assertEqual(self.save_form(self.basic(), self.registrar).status_code, 403)

    def test_roles_decide_who_sees_a_form(self):
        self.save_form(self.basic(roles=["nurse"]))
        self.assertEqual(len(self.as_user(self.nurse).get(FORMS).json()["forms"]), 1)
        self.assertEqual(self.as_user(self.registrar).get(FORMS).json()["forms"], [])
        self.assertEqual(len(self.as_user(self.admin).get(FORMS).json()["forms"]), 1)

    def test_inactive_hidden_from_staff_but_not_admin(self):
        self.save_form(self.basic(active=False))
        self.assertEqual(self.as_user(self.registrar).get(FORMS).json()["forms"], [])
        self.assertEqual(len(self.as_user(self.admin).get(FORMS).json()["forms"]), 1)

    def test_delete_removes_form_and_answers(self):
        form = self.save_form(self.basic()).json()["forms"][0]
        CustomFormAnswer.objects.create(item_id=form["items"][0]["id"], patient=self.patient, value="yes")
        r = self.as_user(self.admin).delete(f"{FORMS}?id={form['id']}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((CustomForm.objects.count(), CustomFormAnswer.objects.count()), (0, 0))

    def test_clinics_are_separate(self):
        self.save_form(self.basic())
        self.assertEqual(self.as_user(self.outsider).get(FORMS).json()["forms"], [])


class AnswerTests(Base):
    def setUp(self):
        super().setUp()
        self.pform = self.saved({"name": "Interpreter", "used_as": "patient", "items": [item("Interpreter needed", "yes_no"), item("Type", "dictionary", options=["Phone", "In person"]), item("Notes"), item("Since", "date"), item("Visits", "number")]})
        self.vform = self.saved({"name": "Transport", "used_as": "visit", "roles": ["nurse", "registrar"], "items": [item("Ride needed", "yes_no")]})
        self.url = f"/api/custom-form-answers/{self.patient_user.id}/"
        self.visit = Registration.objects.create(patient=self.patient, organization=self.org)
        self.ids = {i["label"]: i["id"] for f in (self.pform, self.vform) for i in f["items"]}

    def put(self, answers, visit=None, user=None):
        body = {"answers": answers}
        if visit:
            body["visit"] = visit.pk
        return self.as_user(user or self.registrar).put(self.url, body, format="json")

    def test_patient_answers_are_kept_across_visits(self):
        r = self.put({str(self.ids["Interpreter needed"]): "Yes", str(self.ids["Type"]): "phone", str(self.ids["Notes"]): "  Spanish  "})
        self.assertEqual(r.status_code, 200, r.content)
        got = r.json()["answers"]
        self.assertEqual((got[str(self.ids["Interpreter needed"])], got[str(self.ids["Type"])], got[str(self.ids["Notes"])]), ("yes", "Phone", "Spanish"))
        other_visit = Registration.objects.create(patient=self.patient, organization=self.org)
        again = self.as_user(self.registrar).get(self.url, {"visit": other_visit.pk}).json()["answers"]
        self.assertEqual(again[str(self.ids["Interpreter needed"])], "yes")

    def test_visit_answers_belong_to_the_visit(self):
        self.put({str(self.ids["Ride needed"]): "yes"}, visit=self.visit)
        mine = self.as_user(self.registrar).get(self.url, {"visit": self.visit.pk}).json()["answers"]
        self.assertEqual(mine[str(self.ids["Ride needed"])], "yes")
        other_visit = Registration.objects.create(patient=self.patient, organization=self.org)
        theirs = self.as_user(self.registrar).get(self.url, {"visit": other_visit.pk}).json()["answers"]
        self.assertNotIn(str(self.ids["Ride needed"]), theirs)

    def test_visit_form_needs_a_visit(self):
        r = self.put({str(self.ids["Ride needed"]): "yes"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Save the visit first", r.json()["detail"])

    def test_blank_clears(self):
        self.put({str(self.ids["Notes"]): "x"})
        r = self.put({str(self.ids["Notes"]): ""})
        self.assertNotIn(str(self.ids["Notes"]), r.json()["answers"])
        self.assertEqual(CustomFormAnswer.objects.count(), 0)

    def test_updates_in_place(self):
        self.put({str(self.ids["Notes"]): "a"})
        self.put({str(self.ids["Notes"]): "b"})
        self.assertEqual(CustomFormAnswer.objects.get().value, "b")

    def test_value_checks(self):
        for label, value, text in [("Interpreter needed", "maybe", "Yes or No"), ("Type", "Carrier pigeon", "not a choice"), ("Since", "03/02/2026", "date like"), ("Visits", "many", "must be a number"), ("Notes", "x" * 1001, "longer than 1000")]:
            r = self.put({str(self.ids[label]): value})
            self.assertEqual(r.status_code, 400, label)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(CustomFormAnswer.objects.count(), 0)

    def test_role_limits_a_form(self):
        r = self.put({str(self.ids["Ride needed"]): "yes"}, visit=self.visit, user=self.admin)
        self.assertEqual(r.status_code, 200)  # admins see every form
        self.save_form({**self.vform, "roles": ["nurse"]})
        denied = self.put({str(self.ids["Ride needed"]): "no"}, visit=self.visit, user=self.registrar)
        self.assertEqual(denied.status_code, 403)

    def test_unknown_question_and_visit_of_another_patient(self):
        self.assertEqual(self.put({"999999": "x"}).status_code, 400)
        stranger_user = make_user("pat2", "patient", self.org)
        stranger = Patient.objects.get(user=stranger_user)
        foreign_visit = Registration.objects.create(patient=stranger, organization=self.org)
        r = self.as_user(self.registrar).put(self.url, {"visit": foreign_visit.pk, "answers": {}}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_other_clinic_and_patients_kept_out(self):
        self.assertEqual(self.as_user(self.outsider).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(self.patient_user).get(self.url).status_code, 403)


class VisitDetailsTests(Base):
    def test_visit_details_save_and_clear(self):
        c = self.as_user(self.registrar)
        r = c.post("/api/users/registrations/", {"patient": self.patient.pk, "admit_source": "Self", "mode_of_arrival": "Wheelchair", "service": "Cardiology", "expected_los_days": 3}, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
        got = r.json()
        self.assertEqual((got["admit_source"], got["mode_of_arrival"], got["service"], got["expected_los_days"]), ("Self", "Wheelchair", "Cardiology", 3))
        r2 = c.patch(f"/api/users/registrations/{got['id']}/", {"admit_source": "", "expected_los_days": None}, format="json")
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertEqual((r2.json()["admit_source"], r2.json()["expected_los_days"]), ("", None))
