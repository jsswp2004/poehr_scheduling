"""
Model call for the Documentation assistant, through Amazon Bedrock (Converse API, with tools).

Same AWS account, region and IAM role as POWER Dictate: no access keys in settings. The AWS side needs
the BAA, and the role needs bedrock:InvokeModel on the model (see dictation/iam_policy.json).
Keep Bedrock *model invocation logging OFF* (the default): turning it on would store chart text in
your AWS account.

settings.DOCUMENTATION_ASSISTANT_MODEL_ID   Bedrock model / inference-profile id
                                            (falls back to DICTATION_CLEANUP_MODEL_ID)
settings.DICTATION_AWS_REGION               region (shared with Dictation)
"""

import logging

import boto3
from botocore.config import Config
from django.conf import settings

logger = logging.getLogger(__name__)

_client = None


def model_id():
    return (
        getattr(settings, "DOCUMENTATION_ASSISTANT_MODEL_ID", "")
        or getattr(settings, "DICTATION_CLEANUP_MODEL_ID", "")
        or ""
    ).strip()


def is_configured():
    return bool(model_id())


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-runtime",
            region_name=getattr(settings, "DICTATION_AWS_REGION", "") or "us-east-1",
            config=Config(connect_timeout=5, read_timeout=20, retries={"max_attempts": 1}),
        )
    return _client


def _tool_config(tools):
    return {
        "tools": [
            {
                "toolSpec": {
                    "name": t["name"],
                    "description": t["description"],
                    "inputSchema": {"json": t["input_schema"]},
                }
            }
            for t in tools
        ]
    }


def converse(system, messages, tools, max_tokens):
    """
    One model call. `messages` are in Bedrock Converse format
    ({"role": "user"|"assistant", "content": [{"text": ...} | {"toolUse": ...} | {"toolResult": ...}]}).

    Returns {"text", "tool_uses": [{"id", "name", "input"}], "stop_reason", "message", "input_tokens",
    "output_tokens"}. `message` is the assistant turn to append to `messages` before sending tool results.
    """
    kwargs = {
        "modelId": model_id(),
        "system": [{"text": system}],
        "messages": messages,
        # no temperature: some newer Claude models reject it
        "inferenceConfig": {"maxTokens": max_tokens},
    }
    if tools:
        kwargs["toolConfig"] = _tool_config(tools)
    response = _get_client().converse(**kwargs)
    message = response["output"]["message"]
    blocks = message.get("content") or []
    usage = response.get("usage") or {}
    return {
        "text": "".join(b.get("text", "") for b in blocks).strip(),
        "tool_uses": [
            {"id": b["toolUse"]["toolUseId"], "name": b["toolUse"]["name"], "input": b["toolUse"].get("input") or {}}
            for b in blocks
            if "toolUse" in b
        ],
        "stop_reason": response.get("stopReason", ""),
        "message": message,
        "input_tokens": int(usage.get("inputTokens", 0) or 0),
        "output_tokens": int(usage.get("outputTokens", 0) or 0),
    }
