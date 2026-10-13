"""One assistant turn: scrub input, let the model call tools, return text and proposals.

PHI rules this module enforces:
  * the model only sees scrubbed text and de-identified tool results
  * no tool changes anything; actions come back as proposals for a person to confirm
  * logging records counts and names of tools, never message or reply text
"""
import json
import logging
import time

from django.conf import settings
from django.utils.module_loading import import_string

from .. import services
from . import tools
from .refs import REF_PATTERN, todays_visits
from .scrub import scrub

log = logging.getLogger("telehealth.assistant")

MAX_STEPS = 4
MAX_MESSAGES = 10
MAX_CHARS = 2000

SYSTEM_PROMPT = """You help clinic staff run today's telehealth video visits.

Rules:
- Visits are identified only by codes like v_1a2b3c4d. You never see names, phone numbers or dates of birth. Never ask for them. If the user gives one, say you can't use it and refer to the visit by its code.
- Use the tools for facts about visits. Do not guess. If a tool doesn't say it, you don't know it.
- You cannot change anything. To admit a patient, send a link, end a visit or record where a patient is, call propose_action. That only prepares a card the user must confirm. Never say an action is done; say you have prepared it for them to confirm.
- You do not give medical advice, interpret symptoms, or choose billing codes. Say so briefly and point to the provider.
- Keep answers short and plain. Mention visits by their codes."""


class AssistantUnavailable(Exception):
    pass


def _backend():
    path = getattr(settings, "TELEHEALTH_ASSISTANT_BACKEND", None)
    if not path:
        raise AssistantUnavailable()
    return import_string(path)


def clean_history(raw, known_names):
    """Keep recent turns, cap their size, and scrub them. Roles other than user/assistant are dropped."""
    messages = []
    for item in (raw or [])[-MAX_MESSAGES:]:
        role, content = item.get("role"), item.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": scrub(content[:MAX_CHARS], known_names)})
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    return messages


def run_turn(user, raw_messages):
    complete = _backend()
    started = time.monotonic()
    visits = todays_visits(user)
    names = {ref: services.patient_display_name(a) for ref, a in visits.items()}
    messages = clean_history(raw_messages, names)
    if not messages or messages[-1]["role"] != "user":
        raise ValueError("last message must be from the user")

    proposals, used = [], []
    reply = ""
    for _ in range(MAX_STEPS):
        out = complete(SYSTEM_PROMPT, messages, tools.TOOL_SPECS)
        calls = out.get("tool_calls") or []
        if not calls:
            reply = (out.get("text") or "").strip()
            break
        messages.append({"role": "assistant", "content": out.get("text") or "", "tool_calls": calls})
        results = []
        for call in calls:
            used.append(call["name"])
            handler = tools.HANDLERS.get(call["name"])
            result = handler(user, call.get("input") or {}) if handler else {"error": "unknown tool"}
            if call["name"] == "propose_action" and result.get("ok"):
                proposals.append(result["proposal"])
            results.append({"id": call["id"], "content": json.dumps(result)})
        messages.append({"role": "tool", "results": results})
    else:
        reply = "I couldn't finish that. Try asking in a simpler way."

    reply = reply[:1500] or "I don't have an answer for that."
    mentioned = set(REF_PATTERN.findall(reply)) | {p["ref"] for p in proposals}
    refs = {r: {"appointment_id": visits[r].pk} for r in mentioned if r in visits}
    # Counts and tool names only. Never the question or the answer.
    log.info(
        "assistant turn user=%s tools=%s proposals=%s ms=%d",
        user.pk, ",".join(used) or "-", ",".join(p["kind"] for p in proposals) or "-",
        int((time.monotonic() - started) * 1000),
    )
    return {"reply": reply, "proposals": proposals, "refs": refs}
