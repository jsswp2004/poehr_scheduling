"""
POWER Pharmacy Portal API, for partner-pharmacy staff (mounted at /api/pharmacy-portal/). Every request by a portal
user is limited to this prefix centrally (TenantAwareJWTAuthentication), every view below checks the role, and
each pharmacy only ever sees its own prescriptions. Every view and action is written to PortalAccessLog (RA 10173).

    POST register/                      a pharmacy signs up (no login needed); it stays pending until approved
    GET  me/                            who I am, my pharmacy and whether it can work
    GET  rx/?tab=new|in_progress|ready|changes|renewals|history
    GET  rx/<id>/                       one prescription (minimum patient data)
    POST rx/<id>/action/                {action: accept|decline|ready|dispense|refill, ...}
    POST rx/<id>/requests/              {kind: out_of_stock|strength_form|clarification|renewal, message, proposed}
    POST claim/                         {code, birthdate, mobile_last4}   (pharmacists; 5 failures an hour lock it)
    GET  notices/, POST notices/<id>/read/
    GET/POST staff/, PATCH staff/<id>/  the pharmacy's pharmacists (its administrator adds, edits, deactivates)
"""

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from . import portal as pt
from .models import PartnerPharmacist, PortalNotice


def _error(exc):
    return Response({"detail": exc.message}, status=exc.status_code)


class PortalView(APIView):
    """Portal users only; anyone else (clinic staff included) is refused."""

    permission_classes = [permissions.IsAuthenticated]
    needs_working_pharmacy = True

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        from rest_framework.exceptions import PermissionDenied

        if getattr(request.user, "role", None) not in pt.PORTAL_ROLES or pt.partner_of(request.user) is None:
            raise PermissionDenied("The POWER Pharmacy Portal is for partner pharmacy staff.")
        if self.needs_working_pharmacy:
            problem = pt.partner_problem(pt.partner_of(request.user))
            if problem:
                raise PermissionDenied(problem)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            partner, user = pt.register(request.data)
        except pt.PortalError as exc:
            return _error(exc)
        return Response({"pharmacy": pt.serialize_partner(partner), "username": user.username,
                         "detail": "Registered. Your pharmacy can use the portal once POWER approves it."}, status=201)


class MeView(PortalView):
    needs_working_pharmacy = False

    def get(self, request):
        partner = pt.partner_of(request.user)
        m = pt.membership(request.user)
        return Response({
            "user": {"name": m.full_name, "role": request.user.role, "prc_number": m.prc_number,
                     "can_dispense": request.user.role == "ext_pharmacist" and bool(m.prc_number)},
            "pharmacy": pt.serialize_partner(partner),
            "problem": pt.partner_problem(partner),
            "unread_notices": partner.notices.filter(read_at__isnull=True).count(),
        })


class RxListView(PortalView):
    def get(self, request):
        tab = request.query_params.get("tab") or "new"
        if tab not in pt.TABS:
            return Response({"detail": "Unknown tab."}, status=400)
        rows = list(pt.tab_queryset(request.user, tab).order_by("-updated_at")[:200])
        pt.log_access(request.user, f"list:{tab}", request=request, detail={"count": len(rows)})
        return Response({"counts": pt.counts(request.user), "results": [pt.serialize(r) for r in rows]})


class RxDetailView(PortalView):
    def get(self, request, pk):
        portal_rx = pt.portal_rx_for(request.user, pk)
        if portal_rx is None:
            return Response({"detail": "Prescription not found."}, status=404)
        pt.log_access(request.user, "view", portal_rx.prescription, request)
        return Response(pt.serialize(portal_rx, detail=True))


class RxActionView(PortalView):
    def post(self, request, pk):
        portal_rx = pt.portal_rx_for(request.user, pk)
        if portal_rx is None:
            return Response({"detail": "Prescription not found."}, status=404)
        action = str(request.data.get("action") or "")
        try:
            portal_rx = pt.act(request.user, portal_rx, action, request.data)
        except pt.PortalError as exc:
            pt.log_access(request.user, f"{action}_refused"[:40], portal_rx.prescription, request, {"reason": exc.message[:200]})
            return _error(exc)
        pt.log_access(request.user, action, portal_rx.prescription, request)
        # after a decline the prescription is no longer this pharmacy's: answer with what it just did
        return Response(pt.serialize(pt.portal_rx_for(request.user, portal_rx.pk) or portal_rx, detail=True))


class RxRequestView(PortalView):
    def post(self, request, pk):
        portal_rx = pt.portal_rx_for(request.user, pk)
        if portal_rx is None:
            return Response({"detail": "Prescription not found."}, status=404)
        try:
            req = pt.request_change(request.user, portal_rx, request.data.get("kind"), request.data.get("message"), request.data.get("proposed"))
        except pt.PortalError as exc:
            return _error(exc)
        pt.log_access(request.user, f"request:{req.kind}", portal_rx.prescription, request)
        return Response(pt.serialize_request(req), status=201)


class ClaimView(PortalView):
    def post(self, request):
        try:
            portal_rx = pt.claim(request.user, request.data.get("code"), request.data.get("birthdate"), request.data.get("mobile_last4"))
        except pt.PortalError as exc:
            code = str(request.data.get("code") or "")
            if exc.status_code == 404:  # a wrong code, birthdate or mobile number counts toward the lockout
                pt.log_access(request.user, "claim_failed", None, request, {"code": code[:4] + "****"})
            elif exc.status_code != 429:
                pt.log_access(request.user, "claim_refused", None, request, {"code": code[:4] + "****", "reason": exc.message[:120]})
            return _error(exc)
        return Response(pt.serialize(portal_rx, detail=True), status=201)


class NoticeListView(PortalView):
    needs_working_pharmacy = False

    def get(self, request):
        partner = pt.partner_of(request.user)
        return Response({"results": [
            {"id": n.pk, "title": n.title, "body": n.body, "portal_rx": n.portal_id, "read": bool(n.read_at), "created_at": n.created_at.isoformat()}
            for n in partner.notices.all()[:100]
        ]})


class NoticeReadView(PortalView):
    needs_working_pharmacy = False

    def post(self, request, pk):
        PortalNotice.objects.filter(pk=pk, partner=pt.partner_of(request.user), read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=204)


def _staff_json(s):
    return {"id": s.pk, "full_name": s.full_name, "prc_number": s.prc_number, "email": s.email, "mobile": s.mobile, "is_admin": s.is_admin,
            "username": s.user.username if s.user_id else "", "has_login": bool(s.user_id), "is_active": s.is_active}


class StaffView(PortalView):
    needs_working_pharmacy = False

    def get(self, request):
        partner = pt.partner_of(request.user)
        return Response({"results": [_staff_json(s) for s in partner.staff.select_related("user")], "can_manage": pt.can_manage_staff(request.user)})

    def post(self, request):
        """The pharmacy's administrator (its first account) adds a pharmacist login with a PRC number."""
        from users.models import CustomUser

        partner = pt.partner_of(request.user)
        if not pt.can_manage_staff(request.user):
            return Response({"detail": "Only your pharmacy's administrator can add staff."}, status=403)
        d = request.data
        username, password = str(d.get("username") or "").strip()[:150], str(d.get("password") or "")
        prc, name = str(d.get("prc_number") or "").strip()[:40], str(d.get("full_name") or "").strip()[:160]
        email = str(d.get("email") or "").strip()[:254]
        if not (prc and name and email):
            return Response({"detail": "Enter the pharmacist's name, PRC license number and email."}, status=400)
        try:
            mobile = pt.normalize_ph_mobile(d.get("mobile"))
        except pt.PortalError as exc:
            return Response({"detail": exc.message}, status=400)
        user = None
        if username or password:  # a portal login is optional: some pharmacists only receive the emails
            if len(password) < 10:
                return Response({"detail": "Use a password of at least 10 characters."}, status=400)
            if CustomUser.objects.filter(username=username).exists():
                return Response({"detail": "That username is taken."}, status=400)
            user = CustomUser.objects.create_user(username=username, password=password, role="ext_pharmacist", email=email,
                                                  first_name=name.split(" ")[0], last_name=" ".join(name.split(" ")[1:]))
        s = PartnerPharmacist.objects.create(partner=partner, user=user, full_name=name, prc_number=prc, email=email, mobile=mobile)
        pt.log_access(request.user, "staff_added", None, request, {"staff": s.pk})
        return Response(_staff_json(s), status=201)


class StaffDetailView(PortalView):
    """PATCH: the pharmacy's administrator edits a pharmacist (name, PRC number, email) or deactivates them."""

    needs_working_pharmacy = False

    def patch(self, request, pk):
        partner = pt.partner_of(request.user)
        if not pt.can_manage_staff(request.user):
            return Response({"detail": "Only your pharmacy's administrator can change staff."}, status=403)
        s = partner.staff.select_related("user").filter(pk=pk).first()
        if s is None:
            return Response({"detail": "Not found."}, status=404)
        d = request.data
        for key, limit in (("full_name", 160), ("prc_number", 40), ("email", 254)):
            if key in d:
                value = str(d.get(key) or "").strip()[:limit]
                if key in ("full_name", "prc_number") and not value:
                    return Response({"detail": "The name and PRC license number can't be blank."}, status=400)
                setattr(s, key, value)
        if "mobile" in d:
            try:
                s.mobile = pt.normalize_ph_mobile(d.get("mobile"))
            except pt.PortalError as exc:
                return Response({"detail": exc.message}, status=400)
        if "is_active" in d:
            active = bool(d.get("is_active"))
            if not active and s.user_id == request.user.pk:
                return Response({"detail": "You can't deactivate yourself."}, status=400)
            s.is_active = active
            if s.user_id:  # a deactivated pharmacist can no longer sign in to the portal
                s.user.is_active = active
                s.user.save(update_fields=["is_active"])
        s.save()
        pt.log_access(request.user, "staff_changed", None, request, {"staff": s.pk, "fields": sorted(d.keys())})
        return Response(_staff_json(s))
