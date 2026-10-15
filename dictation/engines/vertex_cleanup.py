"""Text model for the AI cleanup step, through Claude on Google Cloud (Vertex AI / Agent Platform).

Same contract as bedrock_cleanup.complete, so the cleanup rules around it (proposals only, transcript
fenced as data, server-side validation) do not change. Select it with DICTATION_CLEANUP_PROVIDER=vertex.

Needs a signed Google Cloud BAA that covers the service, and Claude enabled in Model Garden.
Do NOT turn on request-response logging for this model: it would store dictated clinical text.

settings.DICTATION_VERTEX_PROJECT           = "<gcp project id>"                      (required)
settings.DICTATION_VERTEX_REGION            = "global"                                (optional)
settings.DICTATION_CLEANUP_MODEL_ID         = "claude-sonnet-5-5"                     (required)
settings.DICTATION_VERTEX_CREDENTIALS_JSON  = "<service account key, JSON text>"      (optional)

Without the credentials JSON the Google client library falls back to the environment's default
credentials (for example GOOGLE_APPLICATION_CREDENTIALS).
"""
import json

from django.conf import settings

from . import EngineUnavailable

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def _credentials():
    raw = getattr(settings, "DICTATION_VERTEX_CREDENTIALS_JSON", "") or ""
    if not raw.strip():
        return None
    try:
        info = json.loads(raw)
    except ValueError:
        raise EngineUnavailable("bad_vertex_credentials")
    from google.oauth2 import service_account

    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def complete(system: str, user_text: str, max_tokens: int = 2000) -> str:
    model_id = getattr(settings, "DICTATION_CLEANUP_MODEL_ID", None)
    project = getattr(settings, "DICTATION_VERTEX_PROJECT", None)
    if not model_id or not project:
        raise EngineUnavailable("no_cleanup_model")
    from anthropic import AnthropicVertex

    client = AnthropicVertex(
        region=getattr(settings, "DICTATION_VERTEX_REGION", None) or "global",
        project_id=project,
        credentials=_credentials(),
    )
    response = client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_text}],
    )
    return "".join(getattr(block, "text", "") for block in response.content)
