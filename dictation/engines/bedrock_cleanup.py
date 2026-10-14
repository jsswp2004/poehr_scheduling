"""Text model for the AI cleanup step, through Amazon Bedrock (Converse API).

Bedrock is covered by the same AWS BAA when you use a HIPAA-eligible model, and it uses the
server's IAM role, so no API keys live in settings. Keep Bedrock *model invocation logging OFF*
(the default): turning it on would store dictated clinical text in your account.

settings.DICTATION_CLEANUP_MODEL_ID = "<a Bedrock model or inference profile id>"   (required)
settings.DICTATION_AWS_REGION       = "us-east-1"                                  (optional)

Any other model works: write a function with this signature and point
settings.DICTATION_CLEANUP_BACKEND ("module.path.function") at it.
    complete(system: str, user_text: str, max_tokens: int) -> str
"""
import boto3
from django.conf import settings

from . import EngineUnavailable
from .transcribe import region


def complete(system: str, user_text: str, max_tokens: int = 2000) -> str:
    model_id = getattr(settings, "DICTATION_CLEANUP_MODEL_ID", None)
    if not model_id:
        raise EngineUnavailable("no_cleanup_model")
    client = boto3.client("bedrock-runtime", region_name=region())
    response = client.converse(
        modelId=model_id,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user_text}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
    )
    return "".join(block.get("text", "") for block in response["output"]["message"]["content"])
