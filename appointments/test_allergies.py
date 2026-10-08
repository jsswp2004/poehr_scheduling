"""Allergy module: coding, substance search (RxNorm mocked), reactions, order
alerts, FHIR export, and the data files' check digits."""

from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from . import allergies as al
from . import orders_workflow as ow
from .models import Appointment, Order, Orderable, PatientAllergy, PatientAllergyStatus
from .test_patient_header import Base, make_user

# ---- Verhoeff (SNOMED CT identifiers carry a Verhoeff check digit) --------
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_ok(number):
    c = 0
    for i, ch in enumerate(reversed(str(number))):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


class DataFileTests(SimpleTestCase):
    def test_verhoeff_known_values(self):
        self.assertTrue(verhoeff_ok("39579001"))   # Anaphylaxis
        self.assertFalse(verhoeff_ok("39579002"))

    def test_every_reaction_code_has_a_valid_check_digit(self):
        for code, display in al.REACTIONS:
            self.assertTrue(verhoeff_ok(code), f"{code} {display}")

    def test_every_catalog_code_has_a_valid_check_digit(self):
        concepts = al.catalog()
        self.assertGreater(len(concepts), 200)
        for c in concepts:
            self.assertTrue(verhoeff_ok(c["code"]), f"{c['code']} {c['display']}")
            self.assertIn(c["category"], {"food", "environment", "biologic", "other"})

    def test_no_known_allergy_code_is_valid(self):
        self.assertTrue(verhoeff_ok(al.NO_KNOWN_ALLERGY[0]))

    def test_catalog_has_no_duplicate_codes(self):
        codes = [c["code"] for c in al.catalog()]
        self.assertEqual(len(codes), len(set(codes)))


class CleanTests(SimpleTestCase):
    def test_reactions_keep_only_known_codes(self):
        out, err = al.clean_reactions([{"code": "126485001", "display": "whatever"}, {"code": "999", "display": "Odd"}, "Rash x"])
        self.assertIsNone(err)
        self.assertEqual(out[0], {"code": "126485001", "display": "Hives (urticaria)"})
        self.assertEqual(out[1], {"code": "", "display": "Odd"})
        self.assertEqual(out[2], {"code": "", "display": "Rash x"})

    def test_reactions_dedupe_and_limits(self):
        out, _ = al.clean_reactions(["Rash", "rash", {"display": ""}])
        self.assertEqual(len(out), 1)
        self.assertIsNotNone(al.clean_reactions("nope")[1])
        self.assertIsNotNone(al.clean_reactions(["x"] * 21)[1])

    def test_coding_rules(self):
        ok, err = al.clean_coding({"category": "Food", "code_system": "snomed", "code": "762952008"})
        self.assertIsNone(err)
        self.assertEqual(ok["category"], "food")
        self.assertIsNotNone(al.clean_coding({"code_system": "snomed"})[1])
        self.assertIsNotNone(al.clean_coding({"code": "123"})[1])
        self.assertIsNotNone(al.clean_coding({"code_system": "icd", "code": "1"})[1])
        self.assertIsNotNone(al.clean_coding({"code_system": "snomed", "code": "12x"})[1])
        self.assertIsNotNone(al.clean_coding({"category": "pets"})[1])
        self.assertIsNotNone(al.clean_coding({"reaction_type": "whim"})[1])
        self.assertEqual(al.clean_coding({})[0]["reaction_type"], "allergy")


class DrugTermTests(SimpleTestCase):
    def test_brand_names_expand(self):
        ings, groups = al.drug_terms("Augmentin 875 mg tablet")
        self.assertIn("amoxicillin", ings)
        self.assertIn("penicillins", groups)

    def test_class_alias(self):
        ings, groups = al.drug_terms("Sulfa")
        self.assertEqual(groups, {"sulfonamide antibiotics"})
        self.assertFalse(ings)

    def test_no_partial_word_matches(self):
        self.assertEqual(al.drug_terms("Statin")[1], {"statins"})
        self.assertEqual(al.drug_terms("Metastatic work-up")[1], set())


class SearchTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_catalog_search_by_category(self):
        out = al.search_substances("pean", "food")
        names = [r["display"] for r in out["results"]]
        self.assertIn("Peanut", names)
        self.assertTrue(all(r["category"] == "food" for r in out["results"]))
        self.assertEqual(out["rxnorm"], "idle")

    def test_short_query_is_empty(self):
        self.assertEqual(al.search_substances("a")["results"], [])

    @override_settings(ALLERGY_RXNORM_ENABLED=False)
    def test_local_drug_names_when_rxnorm_off(self):
        out = al.search_substances("amoxi", "medication")
        self.assertEqual(out["rxnorm"], "off")
        by_name = {r["display"]: r for r in out["results"]}
        self.assertEqual(by_name["Amoxicillin"]["code"], "")

    def _fake_get(self, url, params=None, **kw):
        resp = mock.Mock()
        resp.raise_for_status = lambda: None
        if "approximateTerm" in url:
            resp.json.return_value = {"approximateGroup": {"candidate": [{"rxcui": "723"}, {"rxcui": "1665005"}, {"rxcui": "723"}]}}
        elif "1665005/properties" in url:
            resp.json.return_value = {"properties": {"rxcui": "1665005", "name": "amoxicillin 500 MG Oral Capsule", "tty": "SCD"}}
        elif "723/properties" in url:
            resp.json.return_value = {"properties": {"rxcui": "723", "name": "amoxicillin", "tty": "IN"}}
        elif "1665005/related" in url:
            resp.json.return_value = {"relatedGroup": {"conceptGroup": [{"tty": "IN", "conceptProperties": [
                {"rxcui": "723", "name": "amoxicillin", "tty": "IN"}]}]}}
        else:
            raise AssertionError(url)
        return resp

    def test_rxnorm_results_are_coded_deduped_and_cached(self):
        with mock.patch.object(al.requests, "get", side_effect=self._fake_get) as g:
            out = al.search_substances("amoxicillin", "medication")
            first_calls = g.call_count
            again = al.search_substances("Amoxicillin", "medication")
        self.assertEqual(out["rxnorm"], "ok")
        coded = [r for r in out["results"] if r["source"] == "rxnorm"]
        self.assertEqual(coded, [{"display": "Amoxicillin", "code": "723", "system": "rxnorm", "category": "medication", "source": "rxnorm"}])
        # the local entry with the same name is not listed twice
        self.assertEqual([r["display"] for r in out["results"]].count("Amoxicillin"), 1)
        self.assertEqual(g.call_count, first_calls)  # second search came from the cache
        self.assertEqual(again["results"][0]["code"], "723")

    def test_rxnorm_outage_falls_back_to_local(self):
        with mock.patch.object(al.requests, "get", side_effect=al.requests.ConnectionError("down")):
            out = al.search_substances("ibupro", "medication")
        self.assertEqual(out["rxnorm"], "unavailable")
        self.assertEqual(out["rxnorm_detail"], "could not connect")
        self.assertEqual(out["results"][0]["display"], "Ibuprofen")

    def test_rxnorm_timeout_and_http_error_are_described(self):
        with mock.patch.object(al.requests, "get", side_effect=al.requests.Timeout("slow")):
            self.assertEqual(al.search_substances("ibupro", "medication")["rxnorm_detail"], "timed out")
        bad = mock.Mock(status_code=403)
        err = al.requests.HTTPError("no", response=bad)
        resp = mock.Mock()
        resp.raise_for_status.side_effect = err
        cache.clear()
        with mock.patch.object(al.requests, "get", return_value=resp):
            self.assertEqual(al.search_substances("ibupro", "medication")["rxnorm_detail"], "HTTP 403")

    def test_first_request_failure_is_retried(self):
        calls = {"n": 0}
        real = self._fake_get

        def flaky(url, params=None, **kw):
            calls["n"] += 1
            if calls["n"] == 1:
                raise al.requests.ConnectionError("blip")
            return real(url, params, **kw)

        with mock.patch.object(al.requests, "get", side_effect=flaky):
            out = al.search_substances("amoxicillin", "medication")
        self.assertEqual(out["rxnorm"], "ok")
        self.assertTrue(any(r["source"] == "rxnorm" for r in out["results"]))

    def test_one_failed_candidate_does_not_lose_the_others(self):
        real = self._fake_get

        def partly(url, params=None, **kw):
            if "1665005" in url:
                raise al.requests.ConnectionError("blip")
            return real(url, params, **kw)

        with mock.patch.object(al.requests, "get", side_effect=partly):
            out = al.search_substances("amoxicillin", "medication")
        self.assertEqual([r["code"] for r in out["results"] if r["source"] == "rxnorm"], ["723"])

    def test_empty_rxnorm_answer_says_so_and_is_not_cached(self):
        def empty(url, params=None, **kw):
            resp = mock.Mock()
            resp.raise_for_status = lambda: None
            resp.json.return_value = {"approximateGroup": {"inputTerm": None}}
            return resp

        with mock.patch.object(al.requests, "get", side_effect=empty):
            out = al.search_substances("zzzz", "medication")
        self.assertEqual(out["rxnorm"], "ok")
        self.assertIn("no drug ingredients", out["rxnorm_detail"])


class AllergyApiTests(Base):
    URL = "/api/patient-header/{}/allergies/"

    def post(self, body, user=None):
        self.client.force_authenticate(user or self.doctor)
        return self.client.post(self.URL.format(self.patient.pk), body, format="json")

    def test_coded_entry_round_trip(self):
        r = self.post({
            "substance": "Penicillin G", "category": "medication", "code_system": "rxnorm", "code": "7980",
            "severity": "severe", "reaction_type": "allergy",
            "reactions": [{"code": "39579001", "display": "x"}, {"display": "Metallic taste"}],
        })
        self.assertEqual(r.status_code, 201, r.content)
        rec = r.json()["records"][0]
        self.assertEqual((rec["code_system"], rec["code"], rec["category"]), ("rxnorm", "7980", "medication"))
        self.assertEqual(rec["reactions"][0], {"code": "39579001", "display": "Anaphylaxis"})
        self.assertEqual(rec["reaction"], "Anaphylaxis, Metallic taste")  # text stays in sync
        self.assertEqual(rec["reaction_type"], "allergy")

    def test_free_text_still_works(self):
        r = self.post({"substance": "Mystery rash cream", "reaction": "Rash"})
        self.assertEqual(r.status_code, 201)
        rec = r.json()["records"][0]
        self.assertEqual((rec["code"], rec["reactions"]), ("", [{"code": "", "display": "Rash"}]))

    def test_bad_coding_is_rejected(self):
        self.assertEqual(self.post({"substance": "X", "code": "123"}).status_code, 400)
        self.assertEqual(self.post({"substance": "X", "reactions": "Rash"}).status_code, 400)
        self.assertEqual(self.post({"substance": "X", "category": "pets"}).status_code, 400)

    def test_duplicate_by_code_even_with_a_different_name(self):
        self.assertEqual(self.post({"substance": "Peanut", "code_system": "snomed", "code": "762952008"}).status_code, 201)
        r = self.post({"substance": "Peanuts (groundnut)", "code_system": "snomed", "code": "762952008"})
        self.assertEqual(r.status_code, 400)

    def test_patch_reactions_type_and_category(self):
        self.post({"substance": "Latex"})
        a = PatientAllergy.objects.get()
        self.client.force_authenticate(self.doctor)
        r = self.client.patch(self.URL.format(self.patient.pk) + f"{a.pk}/",
                              {"reactions": ["Hives (urticaria)"], "reaction_type": "intolerance", "category": "environment"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        a.refresh_from_db()
        self.assertEqual((a.reaction, a.reaction_type, a.category), ("Hives (urticaria)", "intolerance", "environment"))
        bad = self.client.patch(self.URL.format(self.patient.pk) + f"{a.pk}/", {"reaction_type": "x"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_substance_search_and_reactions_endpoints(self):
        self.client.force_authenticate(self.nurse)
        r = self.client.get("/api/allergy-substances/", {"q": "latex", "category": "environment"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["results"][0]["code"], "111088007")
        r = self.client.get("/api/allergy-reactions/")
        self.assertEqual(r.json()["reactions"][0]["display"], "Anaphylaxis")
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.get("/api/allergy-reactions/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/allergy-reactions/").status_code, 401)

    def test_fhir_bundle(self):
        self.post({"substance": "Peanut", "category": "food", "code_system": "snomed", "code": "762952008",
                   "severity": "severe", "reactions": [{"code": "126485001"}]})
        self.post({"substance": "Dust", "reaction_type": "intolerance"})
        self.client.force_authenticate(self.doctor)
        r = self.client.get(self.URL.format(self.patient.pk) + "fhir/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("fhir+json", r["Content-Type"])
        b = r.json()
        self.assertEqual((b["resourceType"], b["total"]), ("Bundle", 2))
        by_text = {e["resource"]["code"]["text"]: e["resource"] for e in b["entry"]}
        peanut = by_text["Peanut"]
        self.assertEqual(peanut["resourceType"], "AllergyIntolerance")
        self.assertEqual(peanut["criticality"], "high")
        self.assertEqual(peanut["category"], ["food"])
        self.assertEqual(peanut["code"]["coding"][0]["system"], "http://snomed.info/sct")
        self.assertEqual(peanut["reaction"][0]["manifestation"][0]["coding"][0]["code"], "126485001")
        self.assertEqual(peanut["reaction"][0]["severity"], "severe")
        self.assertEqual(peanut["patient"]["reference"], f"Patient/{self.patient.pk}")
        self.assertEqual(by_text["Dust"]["type"], "intolerance")
        self.assertEqual(by_text["Dust"]["criticality"], "unable-to-assess")
        self.assertNotIn("coding", by_text["Dust"]["code"])

    def test_fhir_no_known_allergy_and_tenancy(self):
        PatientAllergyStatus.objects.create(patient=self.patient, no_known_allergies=True)
        self.client.force_authenticate(self.doctor)
        b = self.client.get(self.URL.format(self.patient.pk) + "fhir/").json()
        self.assertEqual(b["entry"][0]["resource"]["code"]["coding"][0]["code"], "716186003")
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.URL.format(self.patient.pk) + "fhir/").status_code, 404)


class OrderAlertTests(Base):
    def allergic_to(self, substance, severity="severe", **kw):
        return PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance=substance,
                                             severity=severity, reaction="Hives", **kw)

    def test_levels(self):
        self.allergic_to("Penicillin")
        same = al.check_order(self.patient, "Penicillin V potassium")
        self.assertEqual(same[0]["level"], "ingredient")
        cls = al.check_order(self.patient, "Amoxicillin 500 mg capsule")
        self.assertEqual((cls[0]["level"], cls[0]["matched"]), ("class", "Penicillins"))
        brand = al.check_order(self.patient, "Augmentin")
        self.assertEqual(brand[0]["level"], "class")
        cross = al.check_order(self.patient, "Ceftriaxone 1 g IV")
        self.assertEqual((cross[0]["level"], cross[0]["matched"]), ("cross", "Cephalosporins"))
        self.assertEqual(al.check_order(self.patient, "Azithromycin"), [])
        self.assertEqual(al.check_order(self.patient, "Basic metabolic panel"), [])

    def test_ingredient_allergy_flags_its_class(self):
        self.allergic_to("Amoxicillin")
        self.assertEqual(al.check_order(self.patient, "Amoxicillin")[0]["level"], "ingredient")
        self.assertEqual(al.check_order(self.patient, "Ampicillin")[0]["level"], "class")

    def test_rxnorm_code_match(self):
        self.allergic_to("Some local name", code_system="rxnorm", code="723")
        out = al.check_order(self.patient, "Amoxil brand", "rxnorm", "723")
        self.assertEqual(out[0]["level"], "ingredient")

    def test_inactive_allergies_do_not_alert(self):
        a = self.allergic_to("Penicillin")
        a.status = "inactive"
        a.save()
        self.assertEqual(al.check_order(self.patient, "Amoxicillin"), [])

    def test_strongest_level_first_and_one_per_allergy(self):
        self.allergic_to("Penicillin", severity="mild")
        self.allergic_to("Cephalexin")
        out = al.check_order(self.patient, "Cefazolin")
        self.assertEqual([a["substance"] for a in out], ["Cephalexin", "Penicillin"])
        self.assertEqual([a["level"] for a in out], ["class", "cross"])

    def test_check_endpoint(self):
        self.allergic_to("Sulfa")
        self.client.force_authenticate(self.doctor)
        r = self.client.post("/api/allergy-check/", {"patient": self.patient.pk, "name": "Bactrim DS"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["alerts"][0]["level"], "class")
        self.assertEqual(self.client.post("/api/allergy-check/", {"patient": self.patient.pk}, format="json").status_code, 400)
        self.client.force_authenticate(self.outsider)
        r = self.client.post("/api/allergy-check/", {"patient": self.patient.pk, "name": "x"}, format="json")
        self.assertEqual(r.status_code, 404)


class SigningTests(Base):
    def setUp(self):
        super().setUp()
        self.appt = Appointment.all_objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        self.amox = Orderable.objects.create(code="amox", name="Amoxicillin 500 mg capsule", category="medication")
        self.cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Penicillin",
                                      severity="severe", reaction="Anaphylaxis")

    def draft(self, orderable):
        sched = {"frequency": "bid", "dose": "500 mg", "route": "PO"} if orderable.category == "medication" else None
        return ow.create_draft_order(self.doctor, self.appt, orderable, schedule=sched)

    def api(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.doctor).access_token}")
        return c

    def test_signing_stops_on_an_alert(self):
        o = self.draft(self.amox)
        with self.assertRaises(ow.OrderWorkflowError) as ctx:
            ow.sign_order(o, self.doctor)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.errors[0]["allergy_alerts"][0]["substance"], "Penicillin")
        o.refresh_from_db()
        self.assertEqual(o.status, "draft")

    def test_override_reason_signs_and_is_recorded(self):
        o = ow.sign_order(self.draft(self.amox), self.doctor, "Tolerated before, allergy label disputed")
        self.assertEqual(o.status, "active")
        event = o.events.filter(event_type="signed").first()
        self.assertEqual(event.detail["allergy_override"]["reason"], "Tolerated before, allergy label disputed")
        self.assertEqual(event.detail["allergy_override"]["alerts"][0]["level"], "class")

    def test_non_medication_orders_are_never_blocked(self):
        self.assertEqual(ow.sign_order(self.draft(self.cbc), self.doctor).status, "active")

    def test_no_allergies_no_block(self):
        PatientAllergy.objects.all().delete()
        self.assertEqual(ow.sign_order(self.draft(self.amox), self.doctor).status, "active")

    def test_api_sign_409_then_override(self):
        o = self.draft(self.amox)
        c = self.api()
        r = c.post(f"/api/orders/{o.pk}/sign/")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()["errors"][0]["allergy_alerts"][0]["level"], "class")
        r = c.post(f"/api/orders/{o.pk}/sign/", {"allergy_override_reason": "Benefit outweighs risk"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "active")

    def test_api_allergy_check_action(self):
        o = self.draft(self.amox)
        r = self.api().get(f"/api/orders/{o.pk}/allergy-check/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["alerts"][0]["substance"], "Penicillin")
        lab = self.draft(self.cbc)
        self.assertEqual(self.api().get(f"/api/orders/{lab.pk}/allergy-check/").json()["alerts"], [])

    def test_sign_many_is_all_or_nothing_with_alerts(self):
        a, b = self.draft(self.amox), self.draft(self.cbc)
        c = self.api()
        r = c.post("/api/orders/sign/", {"ids": [a.pk, b.pk]}, format="json")
        self.assertEqual(r.status_code, 409, r.content)
        flagged = [e for e in r.json()["errors"] if e.get("allergy_alerts")]
        self.assertEqual(len(flagged), 1)
        b.refresh_from_db()
        self.assertEqual(b.status, "draft")
        r = c.post("/api/orders/sign/", {"ids": [a.pk, b.pk], "allergy_override_reason": "Reviewed"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
