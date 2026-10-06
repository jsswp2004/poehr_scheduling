"""
Status Board Builder API (admins only): save, publish and restore versions of an ED board layout.

A scope is a clinic default (no unit) or one emergency department. Each scope has at most one draft and one
published version. Publishing archives the old published version, so history is kept; restoring an old
version copies it into a new draft rather than rewriting history.

  GET    status-boards/?unit=<id>            versions, draft, published, built-in default and people to pick from
  POST   status-boards/                      {unit?, from_version?}  start a draft
  GET    status-boards/<id>/                 one version with its layout (used to compare)
  PATCH  status-boards/<id>/                 {config?, note?}        edit the draft
  DELETE status-boards/<id>/                 throw the draft away
  POST   status-boards/<id>/publish/         {note?}                 make the draft live
  POST   status-boards/<id>/restore/                                 copy any version into a new draft
"""
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Unit

from .admissions import _bad, _org
from .board_config import ConfigError, clean_config, default_config
from .models import CustomUser, StatusBoardVersion

ADMIN_ROLES = ("admin", "system_admin")


def _person(user):
    return {"id": user.pk, "name": f"{user.last_name}, {user.first_name}".strip(", ") or user.username} if user else None


def version_data(v, with_config=False):
    data = {
        "id": v.pk,
        "number": v.number,
        "status": v.status,
        "unit": v.unit_id,
        "note": v.note,
        "author": _person(v.author),
        "created_at": v.created_at,
        "published_at": v.published_at,
        "published_by": _person(v.published_by),
    }
    if with_config:
        data["config"] = v.config
    return data


class _Admin(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def setup_scope(self, request):
        """(org, error response). Admins only."""
        if request.user.role not in ADMIN_ROLES:
            return None, _bad("Only an admin can change the status board.", 403)
        org = _org(request)
        if org is None:
            return None, _bad("No clinic is selected.")
        return org, None

    def unit_for(self, org, raw):
        """(unit or None, error response): empty means the clinic default."""
        if raw in (None, "", "null"):
            return None, None
        unit = Unit.objects.filter(pk=raw, facility__organization=org, care_type="emergency").first() if str(raw).isdigit() else None
        if unit is None:
            return None, _bad("That is not an emergency department in this clinic.", 404)
        return unit, None

    def version_for(self, org, pk):
        return StatusBoardVersion.objects.filter(pk=pk, organization=org).select_related("author", "published_by").first()


def _start_draft(org, unit, config, user, note=""):
    number = (StatusBoardVersion.objects.filter(organization=org, unit=unit).aggregate(m=Max("number"))["m"] or 0) + 1
    return StatusBoardVersion.objects.create(organization=org, unit=unit, number=number, status=StatusBoardVersion.DRAFT, note=note, config=config, author=user)


class StatusBoardScopeView(_Admin):
    def get(self, request):
        org, err = self.setup_scope(request)
        if err:
            return err
        unit, err = self.unit_for(org, request.query_params.get("unit"))
        if err:
            return err
        versions = list(StatusBoardVersion.objects.filter(organization=org, unit=unit).select_related("author", "published_by"))
        draft = next((v for v in versions if v.status == StatusBoardVersion.DRAFT), None)
        published = next((v for v in versions if v.status == StatusBoardVersion.PUBLISHED), None)
        departments = [
            {"id": u.pk, "name": u.name, "facility_name": u.facility.name}
            for u in Unit.objects.filter(facility__organization=org, care_type="emergency", is_active=True, facility__is_active=True)
            .select_related("facility")
            .order_by("facility__name", "name")
        ]
        people = CustomUser.objects.filter(organization=org, is_active=True, role__in=("nurse", "doctor")).order_by("last_name", "first_name")
        return Response(
            {
                "unit": unit.pk if unit else None,
                "departments": departments,
                "default_config": default_config(),
                "draft": version_data(draft, True) if draft else None,
                "published": version_data(published, True) if published else None,
                "versions": [version_data(v) for v in versions],
                "people": {
                    "nurses": [_person(u) for u in people if u.role == "nurse"],
                    "doctors": [_person(u) for u in people if u.role == "doctor"],
                },
            }
        )

    def post(self, request):
        org, err = self.setup_scope(request)
        if err:
            return err
        unit, err = self.unit_for(org, request.data.get("unit"))
        if err:
            return err
        if StatusBoardVersion.objects.filter(organization=org, unit=unit, status=StatusBoardVersion.DRAFT).exists():
            return _bad("There is already a draft. Publish it or discard it first.")
        source = None
        if request.data.get("from_version"):
            source = self.version_for(org, request.data["from_version"])
            if source is None:
                return _bad("That version was not found.", 404)
            config = source.config
        else:
            live = StatusBoardVersion.objects.filter(organization=org, unit=unit, status=StatusBoardVersion.PUBLISHED).first()
            if live is None and unit is not None:
                live = StatusBoardVersion.objects.filter(organization=org, unit__isnull=True, status=StatusBoardVersion.PUBLISHED).first()
            config = live.config if live else default_config()
        try:
            config = clean_config(config, org)
        except ConfigError:
            # a saved layout that no longer validates (for example a person who left): start from the default
            config = default_config()
        draft = _start_draft(org, unit, config, request.user)
        return Response(version_data(draft, True), status=201)


class StatusBoardVersionView(_Admin):
    def get(self, request, pk):
        org, err = self.setup_scope(request)
        if err:
            return err
        v = self.version_for(org, pk)
        if v is None:
            return _bad("That version was not found.", 404)
        return Response(version_data(v, True))

    def patch(self, request, pk):
        org, err = self.setup_scope(request)
        if err:
            return err
        v = self.version_for(org, pk)
        if v is None:
            return _bad("That version was not found.", 404)
        if v.status != StatusBoardVersion.DRAFT:
            return _bad("Only a draft can be edited. Restore this version to start a new draft.")
        if "config" in request.data:
            try:
                v.config = clean_config(request.data["config"], org)
            except ConfigError as exc:
                return _bad(str(exc))
        if "note" in request.data:
            v.note = str(request.data["note"] or "").strip()[:300]
        v.save()
        return Response(version_data(v, True))

    def delete(self, request, pk):
        org, err = self.setup_scope(request)
        if err:
            return err
        v = self.version_for(org, pk)
        if v is None:
            return _bad("That version was not found.", 404)
        if v.status != StatusBoardVersion.DRAFT:
            return _bad("Only a draft can be discarded.")
        v.delete()
        return Response(status=204)


class StatusBoardPublishView(_Admin):
    def post(self, request, pk):
        org, err = self.setup_scope(request)
        if err:
            return err
        v = self.version_for(org, pk)
        if v is None:
            return _bad("That version was not found.", 404)
        if v.status != StatusBoardVersion.DRAFT:
            return _bad("Only a draft can be published.")
        try:
            config = clean_config(v.config, org)
        except ConfigError as exc:
            return _bad(str(exc))
        with transaction.atomic():
            StatusBoardVersion.objects.filter(organization=org, unit=v.unit, status=StatusBoardVersion.PUBLISHED).update(status=StatusBoardVersion.ARCHIVED)
            v.config = config
            v.status = StatusBoardVersion.PUBLISHED
            v.published_at = timezone.now()
            v.published_by = request.user
            if "note" in request.data:
                v.note = str(request.data["note"] or "").strip()[:300]
            v.save()
        return Response(version_data(v, True))


class StatusBoardRestoreView(_Admin):
    def post(self, request, pk):
        org, err = self.setup_scope(request)
        if err:
            return err
        v = self.version_for(org, pk)
        if v is None:
            return _bad("That version was not found.", 404)
        if StatusBoardVersion.objects.filter(organization=org, unit=v.unit, status=StatusBoardVersion.DRAFT).exists():
            return _bad("There is already a draft. Publish it or discard it first.")
        try:
            config = clean_config(v.config, org)
        except ConfigError:
            return _bad("That version can no longer be restored as it is (someone on its roster has left). Open it in a new draft from the current layout instead.")
        draft = _start_draft(org, v.unit, config, request.user, note=f"Restored from version {v.number}")
        return Response(version_data(draft, True), status=201)
