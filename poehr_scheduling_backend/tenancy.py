"""
Multi-tenant data isolation: a fail-safe default manager for models scoped
by `organization`.

Why this exists
----------------
Every tenant-scoped model (Appointment, Patient, ClinicalNote, ...) has an
`organization` foreign key, but until now nothing *enforced* that a query
was actually filtered by it -- each view was individually responsible for
adding `.filter(organization=user.organization)`. That's easy to get right
in the views that already exist, and easy to forget in the next one someone
writes six months from now. A single missed filter on a clinical-data model
means one clinic can see another clinic's patients.

This module makes the DEFAULT manager (`Model.objects`) safe by construction:

    * During a normal web request, TenantScopeMiddleware (see below) records
      the current user's organization for the duration of that request.
    * A model whose default manager is TenantScopedManager() automatically
      filters every `.objects` query to that organization -- no `.filter()`
      call required, and none of the existing manual `.filter(organization=
      user.organization)` calls break; they just become redundant (harmless).
    * If NO organization context is available at all -- a management
      command, a cron job, a Celery task, a shell session, anything that
      isn't a scoped web request -- `.objects` returns an EMPTY queryset
      instead of every tenant's rows. Fail closed, not open.
    * Code that legitimately needs to see (or explicitly operate on) more
      than one organization -- a system_admin view, a cross-org cron job, a
      management command -- uses `Model.all_objects` instead, by name, on
      purpose. That's a visible, greppable opt-out, not a silent default.

Rollout is per-model and deliberate: converting a model's default manager
touches every existing `.objects` call site for it, so each model is
audited individually before its manager is swapped. See the model's own
comment for whether it has been converted yet.
"""

import threading

from django.db import models
from django.utils.deprecation import MiddlewareMixin
from rest_framework_simplejwt.authentication import JWTAuthentication

_local = threading.local()

# Sentinel distinguishing "no context has been established at all" (fail
# closed) from "context was established and the organization is None" (an
# anonymous/unauthenticated request, or a user with no organization -- also
# fail closed, but for a different, equally legitimate reason).
_NOT_SET = object()


def set_current_organization(organization):
    """Record the organization for the current request/thread."""
    _local.organization = organization


def get_current_organization():
    """
    Returns the current organization, or _NOT_SET if no context has ever
    been established on this thread (i.e. TenantScopeMiddleware never ran --
    a management command, cron job, or similar).
    """
    return getattr(_local, "organization", _NOT_SET)


def clear_current_organization():
    """
    Remove the current organization. MUST be called at the end of every
    request (see TenantScopeMiddleware) -- WSGI/ASGI worker threads are
    reused across unrelated requests, so leaving this set would leak one
    request's organization into the next request handled by the same
    thread.
    """
    if hasattr(_local, "organization"):
        del _local.organization


class TenantScopeMiddleware(MiddlewareMixin):
    """
    Guarantees a clean organization context for every request and clears it
    afterwards. This does NOT set the organization from `request.user`:
    this app authenticates via JWT bearer tokens (rest_framework_simplejwt),
    and `request.user` is only resolved by DRF's authentication classes
    *inside* view dispatch -- which runs after every regular Django
    middleware's process_request/process_view. By the time this middleware
    would see it, `request.user` is still whatever AuthenticationMiddleware
    set from the (nonexistent, for a stateless JWT client) session --
    i.e. always AnonymousUser. Reading it here would silently and
    permanently scope every JWT-authenticated request to "no organization",
    which fails closed (empty results) rather than open, but defeats the
    entire point of tenant scoping.

    The organization is instead set by TenantAwareJWTAuthentication (below),
    which runs at the point DRF actually resolves the user -- early enough
    that it's in place before any view's get_queryset()/create() executes.
    This middleware's job is just the safety net: reset at the start of
    every request (so a worker thread reused across requests never carries
    a stale value into one that never authenticates), and clear at the end.

    Must still sit after AuthenticationMiddleware in MIDDLEWARE for Django
    admin / session-authenticated requests, which don't go through DRF at
    all -- for those, request.user IS reliably resolved by that point, so
    we set from it as a courtesy (harmless no-op for JWT API requests,
    since TenantAwareJWTAuthentication overwrites it moments later inside
    the view).
    """

    def process_request(self, request):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            set_current_organization(getattr(user, "organization", None))
        else:
            clear_current_organization()

    def process_response(self, request, response):
        clear_current_organization()
        return response

    def process_exception(self, request, exception):
        clear_current_organization()
        return None


class TenantAwareJWTAuthentication(JWTAuthentication):
    """
    Drop-in replacement for rest_framework_simplejwt's JWTAuthentication
    that also records the authenticated user's organization for
    TenantScopedManager, at the point DRF actually authenticates the
    request (APIView.initial() -> perform_authentication -- before
    get_queryset()/create() run). See TenantScopeMiddleware's docstring for
    why this can't be done from ordinary Django middleware for a JWT API.

    Set as DEFAULT_AUTHENTICATION_CLASSES in settings.py in place of the
    stock JWTAuthentication.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, _validated_token = result
            set_current_organization(getattr(user, "organization", None))
        return result


class TenantScopedManager(models.Manager):
    """
    Default manager for a tenant-scoped model. Filters to the current
    request's organization automatically; returns nothing if no
    organization context is available at all, or if the current user has
    no organization.

    Pair with `all_objects = models.Manager()` on the same model for code
    that needs explicit cross-organization access, and with
    `class Meta: base_manager_name = "all_objects"` so reverse relations
    (e.g. `organization.appointments.all()`) are unaffected -- this manager
    is only meant to guard the model's own top-level `.objects` entry
    point, not relation traversal.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        organization = get_current_organization()
        if organization is _NOT_SET or organization is None:
            return qs.none()
        return qs.filter(organization=organization)
