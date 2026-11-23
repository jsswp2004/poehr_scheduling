"""
POWER Lab Portal API.

For partner-lab staff, mounted at /api/lab-portal/ (portal logins can reach nothing else: TenantAwareJWTAuthentication):
    POST register/                          a lab signs up (no login); pending until a POWER admin approves it
    GET  me/                                who I am, my lab, whether it can work
    GET  requests/?tab=new|waiting|collected|in_process|to_release|history
    GET  requests/<id>/                     one request (minimum patient data)
    POST requests/<id>/action/              {action: accept|decline|collect|start|recollect, ...}
    POST requests/<id>/results/             save entered values (not released)
    POST requests/<id>/report-file/         the signed report PDF (multipart "file")
    POST requests/<id>/critical-call/       {called_name, called_number, called_at, read_back_confirmed}
    POST requests/<id>/release/             {status: preliminary|final}
    POST claim/                             {code, birthdate, mobile_last4}
    GET  notices/, POST notices/<id>/read/
    GET/POST staff/, PATCH staff/<id>/      the lab administrator manages the lab's people

For clinic users, mounted at /api/lab-requests/:
    GET  /?patient=<id>&open=1               the clinic's lab requests
    POST /                                   send signed lab orders to a lab (see services.create_requests)
    GET  <id>/, POST <id>/cancel/ {reason}
    GET/POST clinic-labs/, PATCH clinic-labs/<id>/     the lab directory (administrators change it)
    GET  partners/                           approved partner labs, to link a directory entry
    GET  admin/partners/, POST admin/partners/<id>/status/ {action: approve|suspend|reinstate, reason}  (system admin)
"""

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services as s
from .models import ClinicLab, LabPortalNotice, LabRequest, PartnerLab, PartnerLabStaff


def _error(exc):
    return Response({"detail": exc.message}, status=exc.status_code)


# --------------------------------------------------------------------------- the lab portal

class PortalView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    needs_working_lab = True

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        from rest_framework.exceptions import PermissionDenied

        if getattr(request.user, "role", None) not in s.PORTAL_ROLES or s.partner_of(request.user) is None:
            raise PermissionDenied("The POWER Lab Portal is for partner laboratory staff.")
        if self.needs_working_lab:
            problem = s.partner_problem(s.partner_of(request.user))
            if problem:
                raise PermissionDenied(problem)

    def get_request(self, pk):
        return s.request_for(self.request.user, pk)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            partner, user = s.register(request.data)
        except s.LabPortalError as exc:
            return _error(exc)
        return Response({"lab": s.serialize_partner(partner), "username": user.username,
                         "detail": "Registered. Your laboratory can use the portal once POWER approves it."}, status=201)


class MeView(PortalView):
    needs_working_lab = False

    def get(self, request):
        partner = s.partner_of(request.user)
        m = s.membership(request.user)
        return Response({
            "user": {"name": m.full_name, "role": request.user.role, "license_number": m.license_number,
                     "can_release": m.can_release, "is_pathologist": s.is_pathologist(request.user), "is_admin": s.can_manage_staff(request.user)},
            "lab": s.serialize_partner(partner),
            "problem": s.partner_problem(partner),
            "unread_notices": partner.notices.filter(read_at__isnull=True).count(),
            "counts": s.counts(request.user) if not s.partner_problem(partner) else {},
        })


class RequestListView(PortalView):
    def get(self, request):
        tab = request.query_params.get("tab") or "new"
        if tab not in s.TABS:
            return Response({"detail": "Unknown tab."}, status=400)
        rows = list(s.tab_queryset(request.user, tab).order_by("-updated_at")[:200])
        s.log_access(request.user, f"list:{tab}", request=request, detail={"count": len(rows)})
        return Response({"counts": s.counts(request.user), "results": [s.serialize(r) for r in rows]})


class RequestDetailView(PortalView):
    def get(self, request, pk):
        req = self.get_request(pk)
        if req is None:
            return Response({"detail": "Lab request not found."}, status=404)
        s.log_access(request.user, "view", req, request)
        return Response(s.serialize(req, detail=True))


class _RequestWrite(PortalView):
    log_action = ""

    def run(self, request, req):  # pragma: no cover - overridden
        raise NotImplementedError

    def post(self, request, pk):
        req = self.get_request(pk)
        if req is None:
            return Response({"detail": "Lab request not found."}, status=404)
        action = self.log_action or str(request.data.get("action") or "")
        try:
            self.run(request, req)
        except s.LabPortalError as exc:
            s.log_access(request.user, f"{action}_refused"[:40], req, request, {"reason": exc.message[:200]})
            return _error(exc)
        s.log_access(request.user, action, req, request)
        fresh = s.request_for(request.user, req.pk) or LabRequest.objects.get(pk=req.pk)
        return Response(s.serialize(fresh, detail=True))


class RequestActionView(_RequestWrite):
    def run(self, request, req):
        s.act(request.user, req, str(request.data.get("action") or ""), request.data)


class ResultsView(_RequestWrite):
    log_action = "save_results"

    def run(self, request, req):
        s.save_results(request.user, req, request.data)


class ReportFileView(_RequestWrite):
    log_action = "report_file"
    parser_classes = [MultiPartParser, FormParser]

    def run(self, request, req):
        s.save_report_file(request.user, req, request.FILES.get("file"))


class ReportFileReadView(PortalView):
    """Values read from the attached PDF, to pre-fill the Results form (nothing is saved)."""

    def post(self, request, pk):
        req = self.get_request(pk)
        if req is None:
            return Response({"detail": "Lab request not found."}, status=404)
        try:
            data = s.read_report_pdf(request.user, req)
        except s.LabPortalError as exc:
            s.log_access(request.user, "read_pdf_refused", req, request, {"reason": exc.message[:200]})
            return _error(exc)
        s.log_access(request.user, "read_pdf", req, request)
        return Response(data)


class CriticalCallView(_RequestWrite):
    log_action = "critical_call"

    def run(self, request, req):
        s.log_critical_call(request.user, req, request.data)


class ReleaseView(_RequestWrite):
    log_action = "release"

    def run(self, request, req):
        s.release(request.user, req, str(request.data.get("status") or ""))


class ClaimView(PortalView):
    def post(self, request):
        try:
            req = s.claim(request.user, request.data.get("code"), request.data.get("birthdate"), request.data.get("mobile_last4"))
        except s.LabPortalError as exc:
            return _error(exc)
        return Response(s.serialize(s.request_for(request.user, req.pk), detail=True))


class NoticeListView(PortalView):
    needs_working_lab = False

    def get(self, request):
        partner = s.partner_of(request.user)
        rows = partner.notices.all()[:100]
        return Response([{"id": n.pk, "title": n.title, "body": n.body, "request": n.request_id,
                          "read": n.read_at is not None, "created_at": n.created_at.isoformat()} for n in rows])


class NoticeReadView(PortalView):
    needs_working_lab = False

    def post(self, request, pk):
        LabPortalNotice.objects.filter(pk=pk, partner=s.partner_of(request.user), read_at__isnull=True).update(read_at=timezone.now())
        return Response({"ok": True})


def _staff_row(m):
    return {"id": m.pk, "full_name": m.full_name, "license_number": m.license_number, "email": m.email, "mobile": m.mobile,
            "is_admin": m.is_admin, "is_pathologist": m.is_pathologist, "can_release": m.can_release, "is_active": m.is_active,
            "username": m.user.username if m.user_id else ""}


class StaffView(PortalView):
    needs_working_lab = False

    def get(self, request):
        return Response([_staff_row(m) for m in s.partner_of(request.user).staff.select_related("user")])

    def post(self, request):
        from users.models import CustomUser

        if not s.can_manage_staff(request.user):
            return Response({"detail": "Only your lab's administrator can add people."}, status=403)
        partner = s.partner_of(request.user)
        data = request.data
        full_name = s._text(data, "full_name", 160)
        if not full_name:
            return Response({"detail": "Enter the person's name."}, status=400)
        try:
            mobile = s.normalize_mobile(data.get("mobile"), partner.country)
        except s.LabPortalError as exc:
            return _error(exc)
        user = None
        username, password = s._text(data, "username", 150), str(data.get("password") or "")
        if username:
            if len(password) < 10:
                return Response({"detail": "Use a password of at least 10 characters."}, status=400)
            if CustomUser.objects.filter(username=username).exists():
                return Response({"detail": "That username is taken."}, status=400)
            role = "ext_lab_pathologist" if s._yes(data, "is_pathologist") else "ext_lab_tech"
            parts = full_name.split(" ", 1)
            user = CustomUser.objects.create_user(username=username, password=password, role=role, email=s._text(data, "email", 254),
                                                  first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "")
        m = PartnerLabStaff.objects.create(partner=partner, user=user, full_name=full_name, license_number=s._text(data, "license_number", 40),
                                           email=s._text(data, "email", 254), mobile=mobile, is_pathologist=s._yes(data, "is_pathologist"),
                                           can_release="can_release" not in data or s._yes(data, "can_release"))
        s.log_access(request.user, "staff_add", detail={"staff": m.pk})
        return Response(_staff_row(m), status=201)


class StaffDetailView(PortalView):
    needs_working_lab = False

    def patch(self, request, pk):
        if not s.can_manage_staff(request.user):
            return Response({"detail": "Only your lab's administrator can change people."}, status=403)
        partner = s.partner_of(request.user)
        m = PartnerLabStaff.objects.filter(pk=pk, partner=partner).select_related("user").first()
        if m is None:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field, n in (("full_name", 160), ("license_number", 40), ("email", 254)):
            if field in data:
                setattr(m, field, s._text(data, field, n))
        if "mobile" in data:
            try:
                m.mobile = s.normalize_mobile(data.get("mobile"), partner.country)
            except s.LabPortalError as exc:
                return _error(exc)
        for field in ("is_pathologist", "can_release", "is_active"):
            if field in data:
                setattr(m, field, s._yes(data, field))
        if m.user_id == request.user.pk and not m.is_active:
            return Response({"detail": "You can't deactivate yourself."}, status=400)
        m.save()
        if m.user_id:
            m.user.is_active = m.is_active
            m.user.save(update_fields=["is_active"])
        s.log_access(request.user, "staff_change", detail={"staff": m.pk})
        return Response(_staff_row(m))


# --------------------------------------------------------------------------- the clinic side

class ClinicView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        from rest_framework.exceptions import PermissionDenied

        if getattr(request.user, "role", None) in s.PORTAL_ROLES or getattr(request.user, "role", None) == "patient":
            raise PermissionDenied("Not available.")


class ClinicRequestListView(ClinicView):
    def get(self, request):
        qs = s.clinic_queryset(request.user)
        patient = request.query_params.get("patient")
        if patient and str(patient).isdigit():
            qs = qs.filter(patient_id=int(patient))
        if request.query_params.get("open") in ("1", "true"):
            qs = qs.filter(status__in=("unclaimed", "new", "accepted", "collected", "in_process", "preliminary", "declined"))
        return Response([s.serialize_for_clinic(r) for r in qs.order_by("-updated_at")[:200]])

    def post(self, request):
        try:
            created = s.create_requests(request.user, request.data)
        except s.LabPortalError as exc:
            return _error(exc)
        return Response([s.serialize_for_clinic(r) for r in created], status=201)


class ClinicRequestDetailView(ClinicView):
    def get(self, request, pk):
        req = s.clinic_queryset(request.user).filter(pk=pk).first()
        if req is None:
            return Response({"detail": "Lab request not found."}, status=404)
        return Response(s.serialize_for_clinic(req))


class ClinicRequestCancelView(ClinicView):
    def post(self, request, pk):
        req = s.clinic_queryset(request.user).filter(pk=pk).first()
        if req is None:
            return Response({"detail": "Lab request not found."}, status=404)
        try:
            req = s.cancel_request(request.user, req, request.data.get("reason"))
        except s.LabPortalError as exc:
            return _error(exc)
        return Response(s.serialize_for_clinic(req))


class ClinicLabListView(ClinicView):
    def get(self, request):
        org = getattr(request.user, "organization", None)
        qs = ClinicLab.objects.filter(organization=org).select_related("partner") if org else ClinicLab.objects.none()
        if request.query_params.get("all") not in ("1", "true"):
            qs = qs.filter(is_active=True)
        return Response({"country": getattr(org, "country", "PH"), "results": [s.serialize_clinic_lab(c) for c in qs]})

    def post(self, request):
        try:
            c = s.save_clinic_lab(request.user, request.data)
        except s.LabPortalError as exc:
            return _error(exc)
        return Response(s.serialize_clinic_lab(c), status=201)


class ClinicLabDetailView(ClinicView):
    def patch(self, request, pk):
        c = ClinicLab.objects.filter(pk=pk).first()
        if c is None:
            return Response({"detail": "Lab not found."}, status=404)
        try:
            c = s.save_clinic_lab(request.user, request.data, c)
        except s.LabPortalError as exc:
            return _error(exc)
        return Response(s.serialize_clinic_lab(c))


class PartnerDirectoryView(ClinicView):
    """Approved partner labs a clinic administrator can link to (only what a clinic needs to choose one)."""

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = PartnerLab.objects.filter(status="approved")
        if q:
            qs = qs.filter(name__icontains=q) | qs.filter(city__icontains=q)
        return Response([{"id": p.pk, "name": p.name, "city": p.city, "province": p.province, "country": p.country,
                          "hours": p.hours, "offers_bedside": p.offers_bedside, "offers_courier": p.offers_courier,
                          "problem": s.partner_problem(p)} for p in qs.order_by("name")[:100]])


class AdminPartnerListView(ClinicView):
    def get(self, request):
        if request.user.role != "system_admin":
            return Response({"detail": "POWER administrators only."}, status=403)
        return Response([s.serialize_partner(p) for p in PartnerLab.objects.all().order_by("status", "name")])


class AdminPartnerStatusView(ClinicView):
    def post(self, request, pk):
        partner = PartnerLab.objects.filter(pk=pk).first()
        if partner is None:
            return Response({"detail": "Not found."}, status=404)
        try:
            partner = s.set_status(request.user, partner, request.data.get("action"), request.data.get("reason"))
        except s.LabPortalError as exc:
            return _error(exc)
        return Response(s.serialize_partner(partner))


class ReportFileDownloadView(PortalView):
    """The lab can download the PDF it uploaded (to check it)."""

    def get(self, request, pk):
        req = self.get_request(pk)
        f = getattr(req, "report_file", None) if req is not None else None
        if f is None:
            return Response({"detail": "No file."}, status=404)
        s.log_access(request.user, "report_file_view", req, request)
        resp = HttpResponse(bytes(f.data), content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="{f.file_name}"'
        return resp
