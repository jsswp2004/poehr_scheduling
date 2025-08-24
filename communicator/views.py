from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
import csv
import logging
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.utils import timezone

from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from .models import Contact, MessageLog
from .serializers import ContactSerializer, MessageLogSerializer
from .utils import send_sms, send_email


class MessageLogFilter(django_filters.FilterSet):
    message_type = django_filters.CharFilter(field_name="message_type")
    created_at__gte = django_filters.DateFilter(
        field_name="created_at", lookup_expr="gte"
    )
    created_at__lt = django_filters.DateFilter(
        field_name="created_at", lookup_expr="lt"
    )
    created_at__lte = django_filters.DateFilter(
        field_name="created_at", lookup_expr="lte"
    )
    organization = django_filters.NumberFilter(method="filter_by_organization")

    def filter_by_organization(self, queryset, name, value):
        """Filter messages by organization ID through user relationship"""
        from django.db.models import Q

        return queryset.filter(Q(user__organization_id=value) | Q(user__isnull=True))

    class Meta:
        model = MessageLog
        fields = ["message_type", "created_at__gte", "created_at__lte", "organization"]


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        import logging

        logger = logging.getLogger(__name__)

        queryset = Contact.objects.filter(uploaded_by=self.request.user).order_by(
            "-created_at"
        )
        logger.info(
            f"📋 ContactViewSet: User {self.request.user.id} requesting contacts, found {queryset.count()} contacts"
        )

        return queryset

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class BulkUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        try:
            file = request.FILES.get("file")
            if not file:
                return Response({"error": "No file provided"}, status=400)

            if not file.name.endswith(".csv"):
                return Response({"error": "File must be a CSV file"}, status=400)

            # Read and decode file with proper error handling
            try:
                decoded = file.read().decode("utf-8").splitlines()
            except UnicodeDecodeError:
                try:
                    # Try with different encoding
                    file.seek(0)  # Reset file pointer
                    decoded = file.read().decode("utf-8-sig").splitlines()
                except UnicodeDecodeError:
                    return Response(
                        {
                            "error": "Unable to decode file. Please ensure it is UTF-8 encoded."
                        },
                        status=400,
                    )

            if not decoded:
                return Response({"error": "File is empty"}, status=400)

            # Parse CSV with error handling
            try:
                reader = csv.DictReader(decoded)

                # Validate headers
                expected_headers = {"name", "phone", "email"}
                actual_headers = set(reader.fieldnames or [])

                if not expected_headers.issubset(actual_headers):
                    missing_headers = expected_headers - actual_headers
                    return Response(
                        {
                            "error": f'Missing required headers: {", ".join(missing_headers)}. Expected: name, phone, email'
                        },
                        status=400,
                    )

                created = 0
                errors = []

                for row_num, row in enumerate(
                    reader, start=2
                ):  # Start at 2 because row 1 is headers
                    try:
                        # Validate required fields
                        name = row.get("name", "").strip()
                        phone = row.get("phone", "").strip()
                        email = row.get("email", "").strip()

                        if not name:
                            errors.append(f"Row {row_num}: Name is required")
                            continue

                        if not phone and not email:
                            errors.append(
                                f"Row {row_num}: At least one contact method (phone or email) is required"
                            )
                            continue

                        # Create contact
                        contact = Contact.objects.create(
                            uploaded_by=request.user,
                            name=name,
                            phone=phone,
                            email=email,
                        )
                        created += 1

                        # Debug logging
                        import logging

                        logger = logging.getLogger(__name__)
                        logger.info(
                            f"✅ Created contact: {contact.id} - {contact.name} (uploaded_by: {request.user.id})"
                        )

                    except Exception as e:
                        errors.append(f"Row {row_num}: {str(e)}")
                        continue

                # Return results
                result = {"created": created}
                if errors:
                    result["errors"] = errors
                    result["message"] = (
                        f"Partially successful: {created} contacts created, {len(errors)} errors"
                    )
                else:
                    result["message"] = f"Successfully created {created} contacts"

                return Response(result, status=200)

            except csv.Error as e:
                return Response({"error": f"CSV parsing error: {str(e)}"}, status=400)

        except Exception as e:
            # Log the full error for debugging
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Unexpected error in contact upload: {str(e)}", exc_info=True)

            return Response({"error": f"Upload failed: {str(e)}"}, status=500)


class SendBulkMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        message = request.data.get("message")
        subject = request.data.get("subject", "Notification")
        send_email_flag = request.data.get("send_email", False)
        send_sms_flag = request.data.get("send_sms", True)

        contacts = Contact.objects.filter(uploaded_by=request.user)
        for contact in contacts:
            if send_sms_flag and contact.phone:
                try:
                    send_sms(
                        contact.phone,
                        message,
                        user=request.user,
                        organization=getattr(request.user, "organization", None),
                    )
                except Exception:
                    pass
            if send_email_flag and contact.email:
                try:
                    send_email(
                        contact.email,
                        subject,
                        message,
                        user=request.user,
                        organization=getattr(request.user, "organization", None),
                    )
                except Exception:
                    pass

        return Response({"sent": contacts.count()})


class MessageLogViewSet(viewsets.ModelViewSet):
    serializer_class = MessageLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "delete"]
    filter_backends = [DjangoFilterBackend]
    filterset_class = MessageLogFilter

    def get_queryset(self):
        """
        Filter message logs based on user role:
        - system_admin: sees all messages
        - admin/registrar: sees only messages from their organization, including system logs tagged with their org
        - others: sees their own messages only
        """
        from django.db.models import Q

        user = self.request.user

        if user.role == "system_admin":
            # System admins see everything
            return MessageLog.objects.all().order_by("-created_at")
        elif user.role in ["admin", "registrar"] and user.organization:
            # Admins and registrars see org messages and system-tagged org messages
            return MessageLog.objects.filter(
                Q(user__organization=user.organization)
                | Q(organization=user.organization)
            ).order_by("-created_at")
        else:
            # Regular users see only their own messages
            return MessageLog.objects.filter(user=user).order_by("-created_at")


@method_decorator(csrf_exempt, name="dispatch")
class SMSWebhookView(APIView):
    """
    Webhook endpoint to handle incoming SMS messages from Twilio.
    Processes STOP, UNSUBSCRIBE, and other opt-out keywords.
    """

    permission_classes = [AllowAny]  # Twilio webhook needs to access this endpoint

    def post(self, request):
        logger = logging.getLogger(__name__)

        try:
            # Extract Twilio webhook data
            from_phone = request.data.get("From", "").strip()
            body = request.data.get("Body", "").strip().upper()
            to_phone = request.data.get("To", "").strip()

            logger.info(
                f"📱 SMS Webhook received: From={from_phone}, Body='{body}', To={to_phone}"
            )

            if not from_phone or not body:
                logger.warning("❌ SMS Webhook: Missing required fields (From or Body)")
                return HttpResponse("OK", content_type="text/plain")

            # Define opt-out keywords
            opt_out_keywords = [
                "STOP",
                "UNSUBSCRIBE",
                "QUIT",
                "END",
                "CANCEL",
                "OPTOUT",
            ]
            opt_in_keywords = ["START", "SUBSCRIBE", "YES", "OPTIN"]

            # Check if message contains opt-out keyword
            if any(keyword in body for keyword in opt_out_keywords):
                success = self._handle_opt_out(from_phone, body, logger)
                if success:
                    logger.info(
                        f"✅ SMS Opt-out processed successfully for {from_phone}"
                    )
                else:
                    logger.warning(f"⚠️ SMS Opt-out failed for {from_phone}")

            # Check if message contains opt-in keyword
            elif any(keyword in body for keyword in opt_in_keywords):
                success = self._handle_opt_in(from_phone, body, logger)
                if success:
                    logger.info(
                        f"✅ SMS Opt-in processed successfully for {from_phone}"
                    )
                else:
                    logger.warning(f"⚠️ SMS Opt-in failed for {from_phone}")

            else:
                # Log other messages for debugging
                logger.info(f"📝 SMS message received (no action): {body}")

            # Create message log entry
            MessageLog.objects.create(
                message_type="sms_webhook",
                content=f"Webhook: {body}",
                phone_number=from_phone,
                status="received",
                organization=None,  # Will be populated if we find the user
                user=None,
            )

            # Twilio expects empty 200 response
            return HttpResponse("OK", content_type="text/plain")

        except Exception as e:
            logger.error(f"❌ SMS Webhook error: {str(e)}", exc_info=True)
            return HttpResponse("ERROR", status=500, content_type="text/plain")

    def _handle_opt_out(self, phone_number, message_body, logger):
        """Handle SMS opt-out request"""
        try:
            from users.models import CustomUser
            from .utils import format_phone_to_international

            # Format phone number to match database format
            formatted_phone = format_phone_to_international(phone_number)

            # Find user by phone number
            user = CustomUser.objects.filter(phone_number=formatted_phone).first()

            if not user:
                # Try without formatting
                user = CustomUser.objects.filter(phone_number=phone_number).first()

            if user:
                # Update opt-out status
                user.sms_opt_out = True
                user.sms_opt_out_date = timezone.now()

                # Determine opt-out method based on keyword
                if "STOP" in message_body:
                    user.sms_opt_out_method = "STOP"
                elif "UNSUBSCRIBE" in message_body:
                    user.sms_opt_out_method = "UNSUBSCRIBE"
                else:
                    user.sms_opt_out_method = "STOP"  # Default

                user.save()

                logger.info(
                    f"✅ User {user.id} ({user.username}) opted out via {user.sms_opt_out_method}"
                )

                # Send confirmation message (optional - be careful about loops)
                try:
                    confirmation_msg = f"You have been unsubscribed from SMS notifications. Reply START to opt back in."
                    send_sms(
                        phone_number,
                        confirmation_msg,
                        user=user,
                        organization=user.organization,
                        bypass_opt_out=True,  # Allow this confirmation message
                    )
                except Exception as e:
                    logger.warning(f"⚠️ Could not send opt-out confirmation: {str(e)}")

                return True
            else:
                logger.warning(
                    f"⚠️ No user found for phone number: {phone_number} (formatted: {formatted_phone})"
                )
                return False

        except Exception as e:
            logger.error(f"❌ Error handling opt-out: {str(e)}", exc_info=True)
            return False

    def _handle_opt_in(self, phone_number, message_body, logger):
        """Handle SMS opt-in request"""
        try:
            from users.models import CustomUser
            from .utils import format_phone_to_international

            # Format phone number to match database format
            formatted_phone = format_phone_to_international(phone_number)

            # Find user by phone number
            user = CustomUser.objects.filter(phone_number=formatted_phone).first()

            if not user:
                # Try without formatting
                user = CustomUser.objects.filter(phone_number=phone_number).first()

            if user:
                # Update opt-in status
                user.sms_opt_out = False
                user.sms_opt_out_date = None
                user.sms_opt_out_method = None
                user.sms_consent = True
                user.sms_consent_date = timezone.now()
                user.save()

                logger.info(f"✅ User {user.id} ({user.username}) opted back in")

                # Send confirmation message
                try:
                    confirmation_msg = f"Welcome back! You will now receive SMS notifications. Reply STOP to opt out."
                    send_sms(
                        phone_number,
                        confirmation_msg,
                        user=user,
                        organization=user.organization,
                    )
                except Exception as e:
                    logger.warning(f"⚠️ Could not send opt-in confirmation: {str(e)}")

                return True
            else:
                logger.warning(
                    f"⚠️ No user found for phone number: {phone_number} (formatted: {formatted_phone})"
                )
                return False

        except Exception as e:
            logger.error(f"❌ Error handling opt-in: {str(e)}", exc_info=True)
            return False
