from twilio.rest import Client
from django.core.mail import send_mail
from django.conf import settings
from .models import MessageLog


def send_sms(to: str, message: str, user=None):
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    try:
        result = client.messages.create(
            body=message,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=to,
        )
        MessageLog.objects.create(
            user=user,
            recipient=to,
            body=message,
            message_type="sms",
            status="sent",
            provider_id=result.sid,
        )
        return result
    except Exception as exc:
        MessageLog.objects.create(
            user=user,
            recipient=to,
            body=message,
            message_type="sms",
            status="failed",
            provider_id=str(exc),
        )
        raise


def send_email(to_email: str, subject: str, message: str, user=None):
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        MessageLog.objects.create(
            user=user,
            recipient=to_email,
            subject=subject,
            body=message,
            message_type="email",
            status="sent",
        )
    except Exception as exc:
        MessageLog.objects.create(
            user=user,
            recipient=to_email,
            subject=subject,
            body=message,
            message_type="email",
            status="failed",
            provider_id=str(exc),
        )
        raise
