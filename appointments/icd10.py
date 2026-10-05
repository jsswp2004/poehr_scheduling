"""
ICD-10-CM code search for the order diagnosis picker.

The browser never talks to an outside service. It calls our own endpoint
(GET /api/icd10/search/?q=...), which asks the National Library of Medicine's
free Clinical Tables ICD-10-CM service and returns [{code, description}].
Only the typed search words leave our system -- no patient information.

  * Needs no account or API key. NLM updates the code set each fiscal year.
  * Repeated searches are served from the Django cache, so typing the same
    thing twice (or two users searching "diabetes") is one outside call.
  * If NLM is slow or down, the endpoint answers 503 with a plain message and
    the picker falls back to letting staff type a code, so ordering never stops.
"""

import logging

import requests
from django.core.cache import cache
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.rights import user_has_right

logger = logging.getLogger(__name__)

NLM_URL = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 80
DEFAULT_LIMIT = 15
MAX_LIMIT = 30
TIMEOUT_SECONDS = 4
CACHE_SECONDS = 60 * 60 * 24  # the code set only changes once a year


class Icd10LookupError(Exception):
    """The outside service could not be reached or answered with something unusable."""


def normalize_query(query):
    """Collapse whitespace and trim; returns '' for anything that isn't text."""
    if not isinstance(query, str):
        return ""
    return " ".join(query.split())[:MAX_QUERY_LENGTH]


def parse_nlm_response(data):
    """
    NLM answers [total, [codes...], extra-or-null, [[code, name], ...]].
    Returns [{"code", "description"}] and ignores any row that isn't shaped
    like that, so a surprise in the response never becomes a crash.
    """
    if not isinstance(data, list) or len(data) < 4 or not isinstance(data[3], list):
        raise Icd10LookupError("Unexpected response from the ICD-10 service.")
    results = []
    for row in data[3]:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        code, name = str(row[0]).strip(), str(row[1]).strip()
        if code:
            results.append({"code": code, "description": name})
    return results


def search_icd10(query, limit=DEFAULT_LIMIT):
    """Return up to `limit` matching ICD-10-CM codes for `query` (code or words)."""
    query = normalize_query(query)
    if len(query) < MIN_QUERY_LENGTH:
        return []
    limit = max(1, min(int(limit), MAX_LIMIT))

    cache_key = "icd10cm:" + str(limit) + ":" + query.lower().replace(" ", "_")
    # memcached-style backends reject spaces/long keys, so keep it simple and short.
    cache_key = cache_key[:200]
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        response = requests.get(
            NLM_URL,
            params={"sf": "code,name", "df": "code,name", "terms": query, "maxList": limit},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = parse_nlm_response(response.json())
    except Icd10LookupError:
        raise
    except (requests.RequestException, ValueError) as exc:
        logger.warning("ICD-10 lookup failed: %s", exc)
        raise Icd10LookupError("The ICD-10 service could not be reached.") from exc

    cache.set(cache_key, results, CACHE_SECONDS)
    return results


class Icd10SearchPermission(permissions.BasePermission):
    """Anyone who can place or edit an order may look up a diagnosis for it."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user_has_right(user, "orders.place") or user_has_right(user, "orders.view"))
        )


class Icd10SearchView(APIView):
    """GET /api/icd10/search/?q=diab&limit=15  ->  {"results": [{"code", "description"}]}"""

    permission_classes = [permissions.IsAuthenticated, Icd10SearchPermission]

    def get(self, request):
        query = normalize_query(request.query_params.get("q", ""))
        try:
            limit = int(request.query_params.get("limit", DEFAULT_LIMIT))
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT
        if len(query) < MIN_QUERY_LENGTH:
            return Response({"results": []})
        try:
            return Response({"results": search_icd10(query, limit)})
        except Icd10LookupError as exc:
            return Response(
                {"detail": str(exc), "results": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
