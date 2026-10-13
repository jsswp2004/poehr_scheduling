"""Model adapter for the Anthropic API, using the same environment variables as the
Staffing and Communicator assistants (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ASSISTANT_ENABLED).

settings: TELEHEALTH_ASSISTANT_BACKEND = "telehealth.assistant.anthropic_backend.complete"

PHI: the model only ever receives visit codes, times and states (see telehealth/assistant/),
never names or contact details. Even so, check that your agreement with the provider covers
this use before turning it on. Setting ASSISTANT_ENABLED=0 switches it off, as for the others.
"""
import os

from staffing import assistant as shared

from .agent import AssistantUnavailable


def _client():
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise AssistantUnavailable()
    return anthropic.Anthropic(api_key=key)


def _to_anthropic(messages):
    out = []
    for m in messages:
        if m["role"] == "tool":
            out.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": r["id"], "content": r["content"]}
                        for r in m["results"]
                    ],
                }
            )
        elif m["role"] == "assistant" and m.get("tool_calls"):
            blocks = [{"type": "text", "text": m["content"]}] if m.get("content") else []
            blocks += [
                {"type": "tool_use", "id": c["id"], "name": c["name"], "input": c.get("input") or {}}
                for c in m["tool_calls"]
            ]
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out


def complete(system, messages, tools):
    if not shared._enabled():
        raise AssistantUnavailable()
    response = _client().messages.create(
        model=os.environ.get("ANTHROPIC_MODEL", shared.DEFAULT_MODEL),
        max_tokens=600,
        temperature=0,
        system=system,
        messages=_to_anthropic(messages),
        tools=[{"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]} for t in tools],
    )
    text, calls = "", []
    for block in response.content:
        if block.type == "text":
            text += block.text
        elif block.type == "tool_use":
            calls.append({"id": block.id, "name": block.name, "input": dict(block.input or {})})
    return {"text": text, "tool_calls": calls}
