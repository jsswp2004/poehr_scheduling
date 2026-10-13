"""Opaque visit references. The assistant sees these instead of names or appointment ids.

A reference is an HMAC of the appointment id and the asking user, so it is stable across a
conversation, can't be guessed, and means nothing to anyone else.
"""
import re

from django.utils import timezone
from django.utils.crypto import salted_hmac

from .. import services

REF_PATTERN = re.compile(r"\bv_[0-9a-f]{8}\b")


def ref_for(user, appointment_id) -> str:
    digest = salted_hmac("telehealth.assistant.ref", f"{user.pk}:{appointment_id}").hexdigest()
    return f"v_{digest[:8]}"


def todays_visits(user):
    """{ref: appointment} for the video visits this user may see today."""
    can_manage = services.can_manage_right(user)
    day = timezone.localdate()
    appointments = services.video_appointments(day, None if can_manage else user.pk)
    return {ref_for(user, a.pk): a for a in appointments}
