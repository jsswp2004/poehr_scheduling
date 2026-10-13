"""Thin wrapper around the Amazon Chime SDK Meetings API (boto3 'chime-sdk-meetings').

Credentials come from the environment's IAM role (task/instance profile), never
from keys in settings. Media capture is deliberately not enabled anywhere.
"""
import logging
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from rest_framework.exceptions import APIException

log = logging.getLogger(__name__)


class ChimeUnavailable(APIException):
    status_code = 502
    default_detail = "video_service_unavailable"
    default_code = "video_service_unavailable"


@lru_cache(maxsize=1)
def _client():
    return boto3.client("chime-sdk-meetings", region_name=settings.TELEHEALTH_CHIME_API_REGION)


def create_meeting(external_meeting_id: str, request_token: str) -> dict:
    """request_token makes the call idempotent (we pass the session id)."""
    try:
        resp = _client().create_meeting(
            ClientRequestToken=request_token,
            ExternalMeetingId=external_meeting_id,
            MediaRegion=settings.TELEHEALTH_CHIME_MEDIA_REGION,
        )
        return resp["Meeting"]
    except (BotoCoreError, ClientError) as exc:
        log.exception("chime create_meeting failed")
        raise ChimeUnavailable() from exc


def create_attendee(meeting_id: str, external_user_id: str) -> dict:
    try:
        resp = _client().create_attendee(MeetingId=meeting_id, ExternalUserId=external_user_id)
        return resp["Attendee"]
    except (BotoCoreError, ClientError) as exc:
        log.exception("chime create_attendee failed")
        raise ChimeUnavailable() from exc


def delete_attendee(meeting_id: str, attendee_id: str) -> bool:
    """Best effort. A failure here must never block the visit."""
    try:
        _client().delete_attendee(MeetingId=meeting_id, AttendeeId=attendee_id)
        return True
    except (BotoCoreError, ClientError):
        log.warning("chime delete_attendee failed (ignored)", exc_info=True)
        return False


def delete_meeting(meeting_id: str) -> bool:
    """Best effort. Ending the session in our DB matters more than Chime cleanup."""
    try:
        _client().delete_meeting(MeetingId=meeting_id)
        return True
    except (BotoCoreError, ClientError):
        log.warning("chime delete_meeting failed (ignored)", exc_info=True)
        return False
