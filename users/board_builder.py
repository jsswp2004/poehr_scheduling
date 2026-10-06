"""
Status Board Builder API (admins only): named ED board views and the settings every view shares.

  GET    status-views/                 views, shared settings, departments, people to pick from
  POST   status-views/                 {name, from_view?}  make a view (a copy of another one, or the built-in layout)
  PATCH  status-views/<id>/            {name?, config?, is_default?}  save a view; saving a layout keeps the one before it
  DELETE status-views/<id>/            delete a view
  POST   status-views/<id>/undo/       put back the layout from before the last save (undo again to redo)
  PATCH  status-views/settings/        {statuses?, vitals_overdue_minutes?, custom_columns?, roster?}
"""
from django.db import transaction
from django.db.models import Max
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Unit

from .admissions import _bad, _org
from .board_config import (
    MAX_VIEWS,
    ConfigError,
    clean_settings,
    clean_view_config,
    default_view_config,
    get_settings,
    view_payload,
)
from .models import CustomUser, StatusBoardSettings, StatusBoardView

ADMIN_ROLES = ("admin", "system_admin")


def _person(user):
    return {"id": user.pk, "name": f"{user.last_name}, {user.first_name}".strip(", ") or user.username} if user else None


def _view_data(view, settings):
    data = view_payload(view, settings)
    data.update(
        {
            "name": view.name,
            "is_default": view.is_default,
            "can_undo": view.previous_config is not None,
            "author": _person(view.author),
            "updated_at": view.updated_at,
        }
    )
    return data


class _Admin(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def setup_org(self, request):
        if request.user.role not in ADMIN_ROLES:
            return None, _bad("Only an admin can change the status board.", 403)
        org = _org(request)
        if org is None:
            return None, _bad("No clinic is selected.")
        return org, None

    def view_for(self, org, pk):
        return StatusBoardView.objects.filter(pk=pk, organization=org).select_related("author").first()


def _name(request, org, current=None):
    """(clean name, error response): 1 to 60 characters, not already used by another view."""
    name = " ".join(str(request.data.get("name") or "").split())
    if not name:
        return None, _bad("Give the view a name.")
    if len(name) > 60:
        return None, _bad("A view name can be at most 60 characters.")
    clash = StatusBoardView.objects.filter(organization=org, name__iexact=name)
    if current is not None:
        clash = clash.exclude(pk=current.pk)
    if clash.exists():
        return None, _bad("Another view already has that name.")
    return name, None


class StatusViewListView(_Admin):
    def get(self, request):
        org, err = self.setup_org(request)
        if err:
            return err
        settings = get_settings(org)
        departments = [
            {"id": u.pk, "name": u.name, "facility_name": u.facility.name}
            for u in Unit.objects.filter(facility__organization=org, care_type="emergency", is_active=True, facility__is_active=True)
            .select_related("facility")
            .order_by("facility__name", "name")
        ]
        people = CustomUser.objects.filter(organization=org, is_active=True, role__in=("nurse", "doctor")).order_by("last_name", "first_name")
        return Response(
            {
                "views": [_view_data(v, settings) for v in StatusBoardView.objects.filter(organization=org).select_related("author")],
                "settings": settings,
                "departments": departments,
                "default_view_config": default_view_config(),
                "people": {
                    "nurses": [_person(u) for u in people if u.role == "nurse"],
                    "doctors": [_person(u) for u in people if u.role == "doctor"],
                },
            }
        )

    def post(self, request):
        org, err = self.setup_org(request)
        if err:
            return err
        name, err = _name(request, org)
        if err:
            return err
        if StatusBoardView.objects.filter(organization=org).count() >= MAX_VIEWS:
            return _bad(f"A clinic can have at most {MAX_VIEWS} views.")
        settings = get_settings(org)
        config = default_view_config()
        if request.data.get("from_view"):
            source = self.view_for(org, request.data["from_view"])
            if source is None:
                return _bad("That view was not found.", 404)
            config = source.config
        try:
            config = clean_view_config(config, settings)
        except ConfigError:
            config = clean_view_config(default_view_config(), settings)
        position = (StatusBoardView.objects.filter(organization=org).aggregate(m=Max("position"))["m"] or 0) + 1
        view = StatusBoardView.objects.create(organization=org, name=name, position=position, config=config, author=request.user)
        return Response(_view_data(view, settings), status=201)


class StatusViewDetailView(_Admin):
    def patch(self, request, pk):
        org, err = self.setup_org(request)
        if err:
            return err
        view = self.view_for(org, pk)
        if view is None:
            return _bad("That view was not found.", 404)
        settings = get_settings(org)
        if "name" in request.data:
            name, err = _name(request, org, view)
            if err:
                return err
            view.name = name
        if "config" in request.data:
            try:
                config = clean_view_config(request.data["config"], settings)
            except ConfigError as exc:
                return _bad(str(exc))
            if config != view.config:
                view.previous_config = view.config
                view.config = config
        with transaction.atomic():
            if "is_default" in request.data:
                make_default = bool(request.data["is_default"])
                if make_default:
                    StatusBoardView.objects.filter(organization=org, is_default=True).exclude(pk=view.pk).update(is_default=False)
                view.is_default = make_default
            view.save()
        return Response(_view_data(view, settings))

    def delete(self, request, pk):
        org, err = self.setup_org(request)
        if err:
            return err
        view = self.view_for(org, pk)
        if view is None:
            return _bad("That view was not found.", 404)
        view.delete()
        return Response(status=204)


class StatusViewUndoView(_Admin):
    def post(self, request, pk):
        org, err = self.setup_org(request)
        if err:
            return err
        view = self.view_for(org, pk)
        if view is None:
            return _bad("That view was not found.", 404)
        if view.previous_config is None:
            return _bad("There is nothing to undo.")
        settings = get_settings(org)
        view.config, view.previous_config = view.previous_config, view.config
        view.save()
        return Response(_view_data(view, settings))


class StatusSettingsView(_Admin):
    def patch(self, request):
        org, err = self.setup_org(request)
        if err:
            return err
        current = get_settings(org)
        try:
            settings = clean_settings(request.data, org, current)
        except ConfigError as exc:
            return _bad(str(exc))
        StatusBoardSettings.objects.update_or_create(
            organization=org,
            defaults={
                "statuses": settings["statuses"],
                "vitals_overdue_minutes": settings["vitals_overdue_minutes"],
                "custom_columns": settings["custom_columns"],
                "roster": settings["roster"],
                "updated_by": request.user,
            },
        )
        # a custom column that was removed leaves its place in every view (and any rule that used it)
        removed = {c["key"] for c in current["custom_columns"]} - {c["key"] for c in settings["custom_columns"]}
        if removed:
            for view in StatusBoardView.objects.filter(organization=org):
                config = dict(view.config or {})
                config["columns"] = [c for c in config.get("columns", []) if c.get("key") not in removed]
                config["rules"] = [r for r in config.get("rules", []) if r.get("field") not in removed]
                view.config = config
                view.save(update_fields=["config", "updated_at"])
        return Response(settings)
