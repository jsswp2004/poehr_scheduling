"""ICD-10-CM search for the order diagnosis picker (appointments/icd10.py).
The outside service is always mocked -- these tests never touch the network."""

from unittest import mock

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from users.models import Organization

from . import icd10

User = get_user_model()

URL = "/api/icd10/search/"

# What NLM sends back for "diabetes": [total, [codes], null, [[code, name], ...]]
NLM_DIABETES = [
    2,
    ["E11.9", "E10.9"],
    None,
    [
        ["E11.9", "Type 2 diabetes mellitus without complications"],
        ["E10.9", "Type 1 diabetes mellitus without complications"],
    ],
]


def fake_response(payload, status=200):
    response = mock.Mock()
    response.status_code = status
    response.json.return_value = payload
    if status >= 400:
        response.raise_for_status.side_effect = requests.HTTPError(f"{status}")
    else:
        response.raise_for_status.return_value = None
    return response


class ParseTests(SimpleTestCase):
    def test_reads_code_and_description(self):
        self.assertEqual(
            icd10.parse_nlm_response(NLM_DIABETES),
            [
                {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"},
                {"code": "E10.9", "description": "Type 1 diabetes mellitus without complications"},
            ],
        )

    def test_no_matches_is_an_empty_list(self):
        self.assertEqual(icd10.parse_nlm_response([0, [], None, []]), [])

    def test_skips_malformed_rows(self):
        data = [3, [], None, [["I10", "Essential hypertension"], ["bad"], "x", ["", "no code"]]]
        self.assertEqual(
            icd10.parse_nlm_response(data),
            [{"code": "I10", "description": "Essential hypertension"}],
        )

    def test_unexpected_shapes_raise(self):
        for bad in (None, {}, "oops", [1, 2], [1, [], None, "nope"]):
            with self.assertRaises(icd10.Icd10LookupError):
                icd10.parse_nlm_response(bad)

    def test_normalize_query(self):
        self.assertEqual(icd10.normalize_query("  type   2 \n diabetes "), "type 2 diabetes")
        self.assertEqual(icd10.normalize_query(None), "")
        self.assertEqual(icd10.normalize_query(123), "")
        self.assertEqual(len(icd10.normalize_query("a" * 500)), icd10.MAX_QUERY_LENGTH)


class SearchTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_asks_nlm_with_the_search_words_only(self):
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)) as get:
            results = icd10.search_icd10("diabetes", limit=5)
        self.assertEqual(results[0]["code"], "E11.9")
        _, kwargs = get.call_args
        self.assertEqual(kwargs["params"]["terms"], "diabetes")
        self.assertEqual(kwargs["params"]["maxList"], 5)
        self.assertEqual(kwargs["params"]["sf"], "code,name")
        self.assertEqual(kwargs["timeout"], icd10.TIMEOUT_SECONDS)

    def test_too_short_a_query_never_calls_out(self):
        with mock.patch("appointments.icd10.requests.get") as get:
            self.assertEqual(icd10.search_icd10("a"), [])
            self.assertEqual(icd10.search_icd10("   "), [])
        get.assert_not_called()

    def test_repeat_searches_come_from_the_cache(self):
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)) as get:
            first = icd10.search_icd10("Diabetes")
            second = icd10.search_icd10("  diabetes ")
        self.assertEqual(first, second)
        self.assertEqual(get.call_count, 1)

    def test_no_matches_are_cached_too(self):
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response([0, [], None, []])) as get:
            self.assertEqual(icd10.search_icd10("zzzz"), [])
            self.assertEqual(icd10.search_icd10("zzzz"), [])
        self.assertEqual(get.call_count, 1)

    def test_limit_is_capped(self):
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)) as get:
            icd10.search_icd10("diabetes", limit=9999)
        self.assertEqual(get.call_args[1]["params"]["maxList"], icd10.MAX_LIMIT)

    def test_network_errors_become_a_lookup_error_and_are_not_cached(self):
        with mock.patch("appointments.icd10.requests.get", side_effect=requests.ConnectionError("down")):
            with self.assertRaises(icd10.Icd10LookupError):
                icd10.search_icd10("diabetes")
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)):
            self.assertEqual(len(icd10.search_icd10("diabetes")), 2)

    def test_server_errors_and_bad_json_become_a_lookup_error(self):
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response({}, status=500)):
            with self.assertRaises(icd10.Icd10LookupError):
                icd10.search_icd10("diabetes")
        broken = fake_response(None)
        broken.json.side_effect = ValueError("not json")
        with mock.patch("appointments.icd10.requests.get", return_value=broken):
            with self.assertRaises(icd10.Icd10LookupError):
                icd10.search_icd10("hypertension")


class EndpointTests(TestCase):
    def setUp(self):
        cache.clear()
        self.org = Organization.objects.create(name="Clinic A")
        self.doctor = User.objects.create_user(
            username="doc", email="doc@example.com", password="pw-12345-xyz", role="doctor", organization=self.org
        )
        self.patient = User.objects.create_user(
            username="pat", email="pat@example.com", password="pw-12345-xyz", role="patient", organization=self.org
        )
        self.client = APIClient()

    def test_requires_login(self):
        self.assertIn(self.client.get(URL, {"q": "diabetes"}).status_code, (401, 403))

    def test_patients_cannot_search(self):
        self.client.force_authenticate(self.patient)
        with mock.patch("appointments.icd10.requests.get") as get:
            response = self.client.get(URL, {"q": "diabetes"})
        self.assertEqual(response.status_code, 403)
        get.assert_not_called()

    def test_returns_code_and_description(self):
        self.client.force_authenticate(self.doctor)
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)):
            response = self.client.get(URL, {"q": "diabetes", "limit": "5"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["results"][0],
            {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"},
        )

    def test_short_or_missing_query_is_an_empty_list_not_an_error(self):
        self.client.force_authenticate(self.doctor)
        with mock.patch("appointments.icd10.requests.get") as get:
            self.assertEqual(self.client.get(URL).json(), {"results": []})
            self.assertEqual(self.client.get(URL, {"q": "d"}).json(), {"results": []})
        get.assert_not_called()

    def test_bad_limit_falls_back_to_the_default(self):
        self.client.force_authenticate(self.doctor)
        with mock.patch("appointments.icd10.requests.get", return_value=fake_response(NLM_DIABETES)) as get:
            response = self.client.get(URL, {"q": "diabetes", "limit": "lots"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(get.call_args[1]["params"]["maxList"], icd10.DEFAULT_LIMIT)

    def test_outside_service_down_is_a_503_with_a_message(self):
        self.client.force_authenticate(self.doctor)
        with mock.patch("appointments.icd10.requests.get", side_effect=requests.Timeout("slow")):
            response = self.client.get(URL, {"q": "diabetes"})
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["results"], [])
        self.assertIn("could not be reached", body["detail"])

    def test_a_saved_diagnosis_keeps_its_description(self):
        """The picker saves {code, description}; the order workflow must keep both."""
        from .orders_workflow import _clean_diagnosis_codes

        cleaned = _clean_diagnosis_codes(
            [{"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"}, "I10"]
        )
        self.assertEqual(cleaned[0]["description"], "Type 2 diabetes mellitus without complications")
        self.assertEqual(cleaned[1], {"code": "I10", "description": ""})
