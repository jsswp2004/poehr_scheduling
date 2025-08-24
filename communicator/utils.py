from twilio.rest import Client
from django.core.mail import send_mail
from django.conf import settings
from .models import MessageLog


def format_phone_to_international(phone):
    """
    Format phone number to international format with +1 prefix
    """
    if not phone:
        return phone

    # Remove all non-numeric characters
    cleaned = "".join(filter(str.isdigit, phone))

    # Handle different scenarios
    if len(cleaned) == 10:
        # US number without country code: 3018806015 → +13018806015
        return f"+1{cleaned}"
    elif len(cleaned) == 11 and cleaned.startswith("1"):
        # US number with country code: 13018806015 → +13018806015
        return f"+{cleaned}"
    elif len(cleaned) == 11 and not cleaned.startswith("1"):
        # Assume US number: 03018806015 → +13018806015 (remove leading 0)
        return f"+1{cleaned[1:]}"
    elif phone.startswith("+1") and len(cleaned) == 11:
        # Already formatted correctly: +13018806015
        return phone
    elif phone.startswith("+") and len(cleaned) >= 10:
        # International format: +441234567890
        return phone

    # If we can't determine format, assume US and try to fix
    if len(cleaned) >= 10:
        return f"+1{cleaned[-10:]}"

    # Return original if we can't format
    return phone


def send_sms(to: str, message: str, user=None, organization=None):
    # Determine organization scope
    org = (
        organization
        if organization is not None
        else getattr(user, "organization", None)
    )

    # Format phone number to international format
    formatted_phone = format_phone_to_international(to)

    print(f"=== SMS SEND DEBUG ===")
    print(f"Original phone number: '{to}'")
    print(f"Formatted phone number: '{formatted_phone}'")
    print(f"Organization: {org.name if org else 'None'}")

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    try:
        print(f"Sending to Twilio with number: '{formatted_phone}'")
        result = client.messages.create(
            body=message,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=formatted_phone,  # Use formatted phone number
        )
        print(f"✅ Twilio success - SID: {result.sid}")
        MessageLog.objects.create(
            user=user,
            organization=org,
            recipient=formatted_phone,  # Log the formatted number
            body=message,
            message_type="sms",
            status="sent",
            provider_id=result.sid,
        )
        print(f"✅ MessageLog created with recipient: '{formatted_phone}'")
        return result
    except Exception as exc:
        print(f"❌ Twilio error: {str(exc)}")
        MessageLog.objects.create(
            user=user,
            organization=org,
            recipient=formatted_phone,  # Log the formatted number even for failures
            body=message,
            message_type="sms",
            status="failed",
            provider_id=str(exc),
        )
        raise


def send_email(to_email: str, subject: str, message: str, user=None, organization=None):
    # Determine organization scope
    org = (
        organization
        if organization is not None
        else getattr(user, "organization", None)
    )

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
            organization=org,
            recipient=to_email,
            subject=subject,
            body=message,
            message_type="email",
            status="sent",
        )
    except Exception as exc:
        MessageLog.objects.create(
            user=user,
            organization=org,
            recipient=to_email,
            subject=subject,
            body=message,
            message_type="email",
            status="failed",
            provider_id=str(exc),
        )
        raise
