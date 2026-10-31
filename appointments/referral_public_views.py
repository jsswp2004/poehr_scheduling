"""
The pages a specialist reaches from the secure referral link. No login: the link's key (opened once,
then a short-lived session proven by the code) is the only credential. See referral_links.py.

Every answer for a bad, expired, turned-off or used-up link is the same 410, so the endpoints never
reveal which links exist.
"""

from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from . import referral_links as rl
from . import referrals as rf


class LinkThrottle(SimpleRateThrottle):
    scope = "referral_link"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class CodeThrottle(SimpleRateThrottle):
    scope = "referral_code"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def _reply(data=None, status=200):
    response = Response(data, status=status)
    response["Cache-Control"] = "no-store"
    return response


def _unavailable():
    return _reply({"detail": "link_unavailable"}, status=410)


def _session_link(request):
    """The link behind the session in 'Authorization: Referral <session>'."""
    header = request.META.get("HTTP_AUTHORIZATION", "")
    scheme, _, token = header.partition(" ")
    if scheme != "Referral" or not token:
        raise rl.LinkUnavailable()
    return rl.from_session(token.strip())


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LinkThrottle])
def open_link(request):
    """The page loads and sends the key from the address. Returns a session, or asks for the code first."""
    try:
        link = rl.resolve(request.data.get("token"))
    except rl.LinkUnavailable:
        return _unavailable()
    rl.record_open(link)
    org = link.referral.organization.name
    if not link.require_code:
        return _reply({"needs_code": False, "session": rl.make_session(link), "organization": org})
    try:
        # a page reload while a code is still good does not send another one
        if not rl.code_is_outstanding(link):
            rl.send_code(link)
    except rf.ReferralError as exc:
        return _reply({"detail": exc.message}, status=exc.status_code)
    return _reply({"needs_code": True, "sent_to": rl.code_hint(link), "organization": org})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CodeThrottle])
def resend_code(request):
    try:
        link = rl.resolve(request.data.get("token"))
    except rl.LinkUnavailable:
        return _unavailable()
    if not link.require_code:
        return _reply({"detail": "No code is needed."}, status=400)
    try:
        hint = rl.send_code(link)
    except rf.ReferralError as exc:
        return _reply({"detail": exc.message}, status=exc.status_code)
    return _reply({"sent_to": hint})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CodeThrottle])
def verify_code(request):
    try:
        link = rl.resolve(request.data.get("token"))
    except rl.LinkUnavailable:
        return _unavailable()
    try:
        session = rl.verify_code(link, request.data.get("code"))
    except rf.ReferralError as exc:
        return _reply({"detail": exc.message}, status=exc.status_code)
    return _reply({"session": session})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LinkThrottle])
def get_packet(request):
    try:
        link = _session_link(request)
    except rl.LinkUnavailable:
        return _unavailable()
    return _reply(rl.packet(link))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LinkThrottle])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def post_reply(request):
    try:
        link = _session_link(request)
    except rl.LinkUnavailable:
        return _unavailable()
    try:
        data = rl.handle_reply(link, request.data, request.FILES.getlist("files"))
    except rf.ReferralError as exc:
        return _reply({"detail": exc.message}, status=exc.status_code)
    return _reply(data)
