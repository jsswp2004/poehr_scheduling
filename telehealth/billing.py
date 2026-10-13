"""Telehealth billing context. Pure functions, no database access.

This module only labels how the visit was delivered. It never chooses a CPT/E&M
code or a time-based level: that stays a provider and coder decision.

Defaults reflect the common rules:
  * Place of service 10 = telehealth where the patient is at home.
  * Place of service 02 = telehealth where the patient is anywhere else.
  * Modifier 95 = synchronous telemedicine, real-time audio AND video.
  * Modifier 93 = synchronous telemedicine, audio only.

Payer rules differ and change (some payers want 95 with POS 02/10, some want POS
only, some want other modifiers). Have billing/compliance confirm your payer mix,
then override MODIFIERS with settings.TELEHEALTH_MODIFIERS if needed.
"""
from django.conf import settings

HOME = "home"
OTHER = "other"
LOCATIONS = (HOME, OTHER)

AUDIO_VIDEO = "audio_video"
AUDIO_ONLY = "audio_only"
MODALITIES = (AUDIO_VIDEO, AUDIO_ONLY)

POS_HOME = "10"
POS_OTHER = "02"

DEFAULT_MODIFIERS = {AUDIO_VIDEO: "95", AUDIO_ONLY: "93"}


def place_of_service(patient_location: str) -> str:
    """POS code for where the PATIENT is. Empty string until the provider confirms it."""
    if patient_location == HOME:
        return POS_HOME
    if patient_location == OTHER:
        return POS_OTHER
    return ""


def modifier_for(modality: str) -> str:
    table = {**DEFAULT_MODIFIERS, **getattr(settings, "TELEHEALTH_MODIFIERS", {})}
    return table.get(modality, "")
