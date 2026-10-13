"""Model adapter for Amazon Bedrock (Converse API).

Bedrock is covered by the same AWS BAA as Chime when you use a HIPAA-eligible model, and it
uses your IAM role, so no API keys live in settings. Keep model invocation logging OFF
(it is off by default): turning it on would store prompts in your account.

settings.TELEHEALTH_ASSISTANT_BACKEND = "telehealth.assistant.bedrock.complete"
settings.TELEHEALTH_ASSISTANT_MODEL_ID = "<a Bedrock model or inference profile id>"
settings.TELEHEALTH_ASSISTANT_REGION   = "us-east-1"   # optional

Any other model works too: write a function with this signature and point the setting at it.
    complete(system: str, messages: list, tools: list) -> {"text": str, "tool_calls": [{"id","name","input"}]}
"""
import boto3
from django.conf import settings


def _client():
    return boto3.client(
        "bedrock-runtime", region_name=getattr(settings, "TELEHEALTH_ASSISTANT_REGION", None)
    )


def _to_converse(messages):
    out = []
    for m in messages:
        if m["role"] == "tool":
            blocks = [
                {"toolResult": {"toolUseId": r["id"], "content": [{"text": r["content"]}]}}
                for r in m["results"]
            ]
            out.append({"role": "user", "content": blocks})
        elif m["role"] == "assistant" and m.get("tool_calls"):
            blocks = [{"text": m["content"]}] if m.get("content") else []
            blocks += [
                {"toolUse": {"toolUseId": c["id"], "name": c["name"], "input": c.get("input") or {}}}
                for c in m["tool_calls"]
            ]
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": m["role"], "content": [{"text": m["content"]}]})
    return out


def complete(system, messages, tools):
    response = _client().converse(
        modelId=settings.TELEHEALTH_ASSISTANT_MODEL_ID,
        system=[{"text": system}],
        messages=_to_converse(messages),
        toolConfig={
            "tools": [
                {"toolSpec": {"name": t["name"], "description": t["description"], "inputSchema": {"json": t["input_schema"]}}}
                for t in tools
            ]
        },
        inferenceConfig={"maxTokens": 600, "temperature": 0},
    )
    text, calls = "", []
    for block in response["output"]["message"]["content"]:
        if "text" in block:
            text += block["text"]
        elif "toolUse" in block:
            use = block["toolUse"]
            calls.append({"id": use["toolUseId"], "name": use["name"], "input": use.get("input") or {}})
    return {"text": text, "tool_calls": calls}
