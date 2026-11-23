"""
Which country is this visitor in? Used by the public Pricing page to show Philippine pesos to visitors
in the Philippines. The country comes from the visitor's IP address: a CDN country header when one is
present, otherwise a lookup against a free service. The IP is used for this one lookup and is never
stored; only the two-letter country is cached (for a few hours) against a hash of the address.
"""
import hashlib
import ipaddress
import logging

import requests
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

COUNTRY_HEADERS = ("HTTP_CF_IPCOUNTRY", "HTTP_X_COUNTRY_CODE", "HTTP_X_APPENGINE_COUNTRY", "HTTP_CLOUDFRONT_VIEWER_COUNTRY")
LOOKUP_URL = "https://ipwho.is/{ip}?fields=success,country_code"
CACHE_SECONDS = 6 * 60 * 60


def client_ip(request):
    """The visitor's public IP, or None if it cannot be told (local network, missing)."""
    candidates = []
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        candidates.append(forwarded.split(",")[0])
    candidates.append(request.META.get("HTTP_X_AZURE_CLIENTIP", ""))
    candidates.append(request.META.get("REMOTE_ADDR", ""))
    for raw in candidates:
        raw = (raw or "").strip()
        if raw.count(":") == 1:  # IPv4 with a port, e.g. 1.2.3.4:5678
            raw = raw.split(":")[0]
        try:
            ip = ipaddress.ip_address(raw.strip("[]"))
        except ValueError:
            continue
        if ip.is_global:
            return str(ip)
    return None


def country_for(request):
    for header in COUNTRY_HEADERS:
        code = (request.META.get(header) or "").strip().upper()
        if len(code) == 2 and code.isalpha() and code not in ("XX", "T1"):
            return code
    ip = client_ip(request)
    if not ip:
        return None
    key = "visitor-country:" + hashlib.sha256(ip.encode()).hexdigest()[:32]
    cached = cache.get(key)
    if cached is not None:
        return cached or None  # "" means "looked up, unknown"
    code = ""
    try:
        r = requests.get(LOOKUP_URL.format(ip=ip), timeout=3)
        data = r.json() if r.ok else {}
        if data.get("success") and len(data.get("country_code") or "") == 2:
            code = data["country_code"].upper()
    except Exception as exc:  # the page just falls back to dollars
        logger.info("Visitor country lookup failed: %s", exc.__class__.__name__)
    cache.set(key, code, CACHE_SECONDS if code else 15 * 60)
    return code or None


@api_view(["GET"])
@permission_classes([AllowAny])
def visitor_country(request):
    return Response({"country": country_for(request)})
