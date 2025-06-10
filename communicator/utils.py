from twilio.rest import Client
from django.core.mail import send_mail
from django.conf import settings


def send_sms(to: str, message: str):
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return client.messages.create(body=message, from_=settings.TWILIO_PHONE_NUMBER, to=to)


def send_email(to_email: str, subject: str, message: str):
    send_mail(subject=subject, message=message, from_email=settings.DEFAULT_FROM_EMAIL, recipient_list=[to_email], fail_silently=False)
