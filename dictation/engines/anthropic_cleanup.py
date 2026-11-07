"""Text model for the AI cleanup step, through the Anthropic API directly.

Same contract as bedrock_cleanup.complete and vertex_cleanup.complete, so the cleanup rules around it
(proposals only, transcript fenced as data, server-side validation) do not change.
Select it with DICTATION_CLEANUP_PROVIDER=anthropic.

Before real patient text goes through: get a signed BAA with Anthropic that covers the API, and ask for
zero data retention on the organization. Until then use made-up text only.

settings.DICTATION_ANTHROPIC_API_KEY  = "<api key>"            (required; keep it only in the host's environment)
settings.DICTATION_CLEANUP_MODEL_ID   = "claude-sonnet-5-5"    (required)
"""
import logging

from django.conf import settings

from . import EngineUnavailable

log = logging.getLogger(__name__)


def complete(system: str, user_text: str, max_tokens: int = 2000) -> str:
    model_id = getattr(settings, "DICTATION_CLEANUP_MODEL_ID", None)
    if not model_id:
        raise EngineUnavailable("no_cleanup_model")
    api_key = getattr(settings, "DICTATION_ANTHROPIC_API_KEY", "") or ""
    if not api_key.strip():
        raise EngineUnavailable("no_anthropic_key")
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key.strip(), timeout=60.0)
    response = client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_text}],
    )
    text = "".join(getattr(block, "text", "") for block in response.content)
    stop_reason = getattr(response, "stop_reason", None)
    if "{" not in text or stop_reason == "max_tokens":
        # Diagnostic only, never the text itself (it may hold clinical content): was the reply empty or cut off at the token limit?
        usage = getattr(response, "usage", None)
        log.warning(
            "dictation cleanup: model reply incomplete or without JSON (stop_reason=%s, blocks=%s, output_tokens=%s, chars=%d)",
            stop_reason,
            [getattr(block, "type", "?") for block in response.content],
            getattr(usage, "output_tokens", None),
            len(text),
        )
    return text
