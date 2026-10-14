"""AWS Transcribe Medical streaming.

The browser talks to Transcribe directly over a WebSocket, so audio never passes through this
server and no AWS key ever reaches the browser. This module only builds a SigV4 *presigned* URL
that is good for a few seconds. The signing identity is the server's own IAM role / credentials
(see dictation/iam_policy.json).

Transcribe Medical streaming is HIPAA-eligible under the AWS BAA. It does not keep your audio.
"""
import os
from urllib.parse import urlencode

import boto3
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from django.conf import settings

from . import EngineUnavailable

SAMPLE_RATE = 16000  # Hz, 16-bit little-endian mono PCM
PRESIGN_SECONDS = 60  # how long the URL may be used to START a stream
LANGUAGE = "en-US"  # Transcribe Medical streaming is US English only
SPECIALTIES = {"PRIMARYCARE", "CARDIOLOGY", "NEUROLOGY", "ONCOLOGY", "RADIOLOGY", "UROLOGY"}


def region() -> str:
    return getattr(settings, "DICTATION_AWS_REGION", None) or os.environ.get("AWS_REGION") or "us-east-1"


def presign_medical_stream(specialty: str, *, credentials=None, region_name: str = None) -> str:
    """Return a wss:// URL the browser can open to start a Transcribe Medical dictation stream."""
    if specialty not in SPECIALTIES:
        raise ValueError(f"unknown specialty {specialty!r}")
    region_name = region_name or region()
    if credentials is None:
        found = boto3.Session().get_credentials()
        if found is None:
            raise EngineUnavailable("no_aws_credentials")
        credentials = found.get_frozen_credentials()

    query = urlencode(
        {
            "language-code": LANGUAGE,
            "media-encoding": "pcm",
            "sample-rate": SAMPLE_RATE,
            "specialty": specialty,
            "type": "DICTATION",
        }
    )
    url = f"https://transcribestreaming.{region_name}.amazonaws.com:8443/medical-stream-transcription-websocket?{query}"
    request = AWSRequest(method="GET", url=url)
    SigV4QueryAuth(credentials, "transcribe", region_name, expires=PRESIGN_SECONDS).add_auth(request)
    return "wss://" + request.url[len("https://"):]
