from rest_framework import generics, filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.generics import (
    RetrieveAPIView,
    RetrieveUpdateAPIView,
    DestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    CreateAPIView,
)
from rest_framework.parsers import MultiPartParser, JSONParser
from django.contrib.auth import update_session_auth_hash
from django.db.models import Q
from django.http import HttpResponse
from django.conf import settings
from twilio.rest import Client
import os
import csv
import logging
from django.db import transaction

from .models import CustomUser, Patient
from .serializers import (
    UserSerializer,
    PatientSerializer,
    OrganizationSerializer,
    get_admin_emails,
)
from .stripe_service import StripeService
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer
from .models import Organization
from rest_framework import permissions
from appointments.permissions import IsAdminOrSystemAdmin
from communicator.utils import send_email

logger = logging.getLogger(__name__)

# Remove global Twilio client - will create clients locally when needed


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, JSONParser]  # Accept both file uploads and JSON

    def get_queryset(self):
        """
        Filter organizations based on user role:
        - system_admin: can see all organizations
        - admin/registrar: can see their own organization
        - others: can see their own organization
        """
        user = self.request.user
        if user.role == "system_admin":
            return Organization.objects.all()
        elif user.organization:
            return Organization.objects.filter(id=user.organization.id)
        else:
            return Organization.objects.none()

    def perform_create(self, serializer):
        """Allow admin, system_admin, and registrar to create organizations"""
        user = self.request.user

        if user.role not in ["admin", "system_admin", "registrar"]:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "You do not have permission to create organizations."
            )

        serializer.save()

    def perform_update(self, serializer):
        """Only allow admin and system_admin to update organizations"""
        user = self.request.user
        if user.role not in ["admin", "system_admin"]:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to edit organizations.")
        serializer.save()

    def perform_destroy(self, instance):
        """Only allow system_admin to delete organizations"""
        user = self.request.user
        if user.role != "system_admin":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "You do not have permission to delete organizations."
            )
        instance.delete()


class UserDetailView(RetrieveUpdateDestroyAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"
    lookup_url_kwarg = "pk"

    def get(self, request, *args, **kwargs):
        """Override get method with debugging"""
        try:
            print(f"🔍 GET request for user ID {kwargs.get('pk')}")
            print(
                f"🔍 Request user: {request.user.username if request.user.is_authenticated else 'Anonymous'}"
            )
            print(f"🔍 Is authenticated: {request.user.is_authenticated}")
            return super().get(request, *args, **kwargs)
        except Exception as e:
            print(f"❌ Error in GET method: {str(e)}")
            import traceback

            print(f"❌ Traceback: {traceback.format_exc()}")
            return Response(
                {"error": f"Failed to retrieve user: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        """Delete a user with proper permission checks"""
        try:
            user_id = kwargs.get("pk")
            logger.info(f"🗑️ DELETE request for user ID: {user_id}")
            print(f"🗑️ DELETE request for user ID: {user_id}")

            # Log request details
            logger.info(
                f"🔍 Request user: {request.user.username if request.user.is_authenticated else 'Anonymous'}"
            )
            logger.info(f"🔍 Request method: {request.method}")
            logger.info(f"🔍 Request path: {request.path}")
            print(
                f"🔍 Request user: {request.user.username if request.user.is_authenticated else 'Anonymous'}"
            )
            print(f"🔍 Request method: {request.method}")
            print(f"🔍 Request path: {request.path}")

            # Check if user exists
            try:
                user_to_delete = self.get_object()
                logger.info(
                    f"✅ Found user to delete: {user_to_delete.username} (ID: {user_to_delete.pk})"
                )
                print(
                    f"✅ Found user to delete: {user_to_delete.username} (ID: {user_to_delete.pk})"
                )
            except Exception as get_error:
                error_msg = str(get_error)
                logger.error(f"❌ User not found: {error_msg}")
                print(f"❌ User not found: {error_msg}")
                return Response(
                    {"error": f"User with ID {user_id} not found: {error_msg}"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            requesting_user = request.user

            print(
                f"🗑️ Delete request: User {requesting_user.username} (role: {requesting_user.role}) trying to delete user ID {user_id}"
            )

            # Security check: Only allow admins to delete users, and prevent self-deletion
            if requesting_user.role not in ["admin", "system_admin"]:
                print(
                    f"❌ Permission denied: User role '{requesting_user.role}' not in allowed roles"
                )
                return Response(
                    {"error": "Only administrators can delete users"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if user_to_delete.pk == requesting_user.pk:
                print(f"❌ Self-deletion attempted")
                return Response(
                    {"error": "Cannot delete your own account"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Optional: Check if user belongs to same organization (unless system admin)
            if (
                requesting_user.role != "system_admin"
                and requesting_user.organization != user_to_delete.organization
            ):
                print(
                    f"❌ Organization mismatch: {requesting_user.organization} vs {user_to_delete.organization}"
                )
                return Response(
                    {"error": "Can only delete users from your organization"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Perform the deletion
            username = user_to_delete.username
            user_id = user_to_delete.pk
            print(f"✅ Deleting user: {username} (ID: {user_id})")

            # Check for related records that might prevent deletion
            from django.db import models

            related_objects = []

            # Check if user has related records
            if (
                hasattr(user_to_delete, "patient_set")
                and user_to_delete.patient_set.exists()
            ):
                patient_count = user_to_delete.patient_set.count()
                related_objects.append(f"{patient_count} patient records")

            if (
                hasattr(user_to_delete, "appointment_set")
                and user_to_delete.appointment_set.exists()
            ):
                appointment_count = user_to_delete.appointment_set.count()
                related_objects.append(f"{appointment_count} appointments")

            if related_objects:
                print(f"⚠️ User has related records: {', '.join(related_objects)}")
                print(f"🔧 Attempting deletion anyway...")

            # Try to delete the user
            try:
                user_to_delete.delete()
                print(f"✅ User {username} (ID: {user_id}) deleted successfully")
                return Response(
                    {"message": f"User {username} deleted successfully"},
                    status=status.HTTP_204_NO_CONTENT,
                )
            except Exception as delete_error:
                error_msg = str(delete_error)
                print(f"❌ Delete error: {error_msg}")

                # Handle specific missing table errors
                if "django_rest_passwordreset_resetpasswordtoken" in error_msg:
                    print("🔧 Password reset table missing - trying manual cleanup...")

                    # Try to delete related password reset tokens manually if table exists
                    try:
                        from django_rest_passwordreset.models import ResetPasswordToken

                        ResetPasswordToken.objects.filter(user=user_to_delete).delete()
                        print("✅ Password reset tokens cleaned up manually")
                    except Exception:
                        print(
                            "⚠️ Could not clean up password reset tokens (table missing)"
                        )

                    # Try deleting user again
                    try:
                        # Delete user without cascade to avoid the missing table
                        from django.db import connection

                        with connection.cursor() as cursor:
                            cursor.execute(
                                "DELETE FROM users_customuser WHERE id = %s",
                                [user_to_delete.pk],
                            )

                        print(
                            f"✅ User {username} (ID: {user_id}) deleted successfully (manual)"
                        )
                        return Response(
                            {"message": f"User {username} deleted successfully"},
                            status=status.HTTP_204_NO_CONTENT,
                        )
                    except Exception as manual_error:
                        print(f"❌ Manual deletion also failed: {manual_error}")
                        raise delete_error
                elif "users_onlineuser" in error_msg:
                    print("🔧 OnlineUser table missing - trying manual cleanup...")

                    # Try deleting user with manual cleanup of missing table references
                    try:
                        from django.db import connection

                        with connection.cursor() as cursor:
                            # First, try to delete any OnlineUser records if table exists
                            try:
                                cursor.execute(
                                    "DELETE FROM users_onlineuser WHERE user_id = %s",
                                    [user_to_delete.pk],
                                )
                                print("✅ OnlineUser records cleaned up")
                            except Exception:
                                print(
                                    "⚠️ OnlineUser table doesn't exist, skipping cleanup"
                                )

                            # Now delete the main user record
                            cursor.execute(
                                "DELETE FROM users_customuser WHERE id = %s",
                                [user_to_delete.pk],
                            )

                        print(
                            f"✅ User {username} (ID: {user_id}) deleted successfully (manual - OnlineUser handled)"
                        )
                        return Response(
                            {"message": f"User {username} deleted successfully"},
                            status=status.HTTP_204_NO_CONTENT,
                        )
                    except Exception as manual_error:
                        error_msg_manual = str(manual_error)
                        print(f"❌ Manual deletion also failed: {error_msg_manual}")

                        # If still failing due to missing table, provide specific guidance
                        if "users_onlineuser" in error_msg_manual:
                            return Response(
                                {
                                    "error": "Cannot delete user due to missing database table 'users_onlineuser'. Please create this table first or contact system administrator.",
                                    "table_needed": "users_onlineuser",
                                    "sql_needed": "CREATE TABLE users_onlineuser (user_id INTEGER PRIMARY KEY, is_online BOOLEAN DEFAULT FALSE, last_seen TIMESTAMP DEFAULT NOW(), FOREIGN KEY (user_id) REFERENCES users_customuser(id) ON DELETE CASCADE);",
                                },
                                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            )
                        raise delete_error
                else:
                    # Re-raise other errors
                    raise delete_error

        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error in delete method: {error_msg}")
            logger.error(f"❌ Exception type: {type(e).__name__}")
            print(f"❌ Error in delete method: {error_msg}")
            print(f"❌ Exception type: {type(e).__name__}")
            import traceback

            traceback_str = traceback.format_exc()
            logger.error(f"❌ Traceback: {traceback_str}")
            print(f"❌ Traceback: {traceback_str}")

            # Return more detailed error information
            return Response(
                {
                    "error": f"Failed to delete user: {error_msg}",
                    "error_type": type(e).__name__,
                    "user_id": kwargs.get("pk", "unknown"),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PatientUpdateView(RetrieveUpdateAPIView):
    queryset = Patient.objects.select_related("user")
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user__id"
    lookup_url_kwarg = "user_id"

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)


class PatientDetailView(RetrieveAPIView):
    queryset = Patient.objects.select_related("user")
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user_id"
    lookup_url_kwarg = "user_id"


class DoctorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == "system_admin":
            doctors = CustomUser.objects.filter(role="doctor")
        else:
            doctors = CustomUser.objects.filter(
                role="doctor", organization=user.organization
            )
        serializer = UserSerializer(doctors, many=True)
        return Response(serializer.data)


class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        data = request.data

        # Extract Stripe-related data from the request
        payment_method_id = data.get("payment_method_id")
        subscription_tier = data.get("subscription_tier", "basic")
        is_enrollment = data.get(
            "is_enrollment", False
        )  # Check if this is service enrollment

        # Debug: Show what enrollment data was received
        if is_enrollment:
            print(f"📝 Enrollment data received:")
            print(f"   - Organization Name: '{data.get('organization_name')}'")
            print(f"   - Organization Type: '{data.get('organization_type')}'")
            print(f"   - User Name: '{data.get('first_name')} {data.get('last_name')}'")
            print(f"   - Email: '{data.get('email')}'")
            print(f"   - Is Enrollment: {is_enrollment}")

        # Store plain password for welcome email before it gets hashed
        plain_password = data.get("password", "") if is_enrollment else ""

        # If the user is authenticated, use their organization
        if request.user.is_authenticated:
            # User is logged in, use their organization
            organization = request.user.organization
        else:
            # User is not logged in, use the organization_name from the form or default
            org_name = data.get("organization_name") or "Default Organization"
            org_type = data.get("organization_type", "personal")
            print(f"🏢 Creating/getting organization: '{org_name}' (type: {org_type})")
            organization, created = Organization.objects.get_or_create(name=org_name)
            if created:
                print(f"✅ Created new organization: {organization.name}")
            else:
                print(f"♻️ Using existing organization: {organization.name}")

        # Validate the serializer first (without Stripe fields and organization_name)
        serializer_data = {
            k: v
            for k, v in data.items()
            if k
            not in [
                "payment_method_id",
                "subscription_tier",
                "is_enrollment",
                "organization_name",
            ]
        }

        serializer = self.get_serializer(data=serializer_data)

        # Debug validation errors in detail
        if not serializer.is_valid():
            print("❌ Serializer validation errors:", serializer.errors)
            print("❌ Registration data causing errors:", serializer_data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Use atomic transaction to ensure all-or-nothing behavior
        try:
            with transaction.atomic():
                # Create the user (this will be rolled back if Stripe fails)
                user = serializer.save(organization=organization)

                # Set role to 'admin' for service enrollment
                if is_enrollment:
                    user.role = "admin"
                    user.save()  # Save the role change

                # Only create Stripe customer for service enrollment, not patient registration
                if is_enrollment:
                    try:
                        print(
                            f"🔄 Starting Stripe operations for user: {user.username}"
                        )
                        print(f"🔄 Subscription tier: {subscription_tier}")
                        print(f"🔄 Payment method ID: {payment_method_id}")

                        # Debug: Check settings before initializing StripeService
                        from django.conf import settings

                        print(
                            f"🔧 Stripe secret key available: {bool(getattr(settings, 'STRIPE_SECRET_KEY', None))}"
                        )
                        print(
                            f"🔧 Basic price ID: {getattr(settings, 'STRIPE_BASIC_PRICE_ID', 'NOT_SET')}"
                        )

                        # Initialize Stripe service
                        stripe_service = StripeService()
                        print("✅ StripeService initialized successfully")

                        # Create or retrieve Stripe customer
                        customer = stripe_service.create_customer(
                            user=user, payment_method_id=payment_method_id
                        )

                        if not customer:
                            print("❌ Stripe customer creation failed")
                            raise Exception("Failed to create Stripe customer")

                        print(f"✅ Stripe customer created: {customer.id}")

                        # Create trial subscription
                        subscription = stripe_service.create_trial_subscription(
                            user=user,
                            tier=subscription_tier,
                            payment_method_id=payment_method_id,
                        )

                        if not subscription:
                            print("❌ Stripe subscription creation failed")
                            raise Exception("Failed to create subscription")

                        print(f"✅ Stripe subscription created: {subscription.id}")

                    except Exception as stripe_error:
                        # This will trigger the transaction rollback
                        print(f"❌ Stripe error during enrollment: {str(stripe_error)}")
                        print(f"❌ Stripe error type: {type(stripe_error).__name__}")
                        import traceback

                        print(f"❌ Full traceback: {traceback.format_exc()}")
                        logger.error(
                            f"❌ Stripe error during enrollment: {str(stripe_error)}"
                        )
                        raise Exception(
                            f"Payment processing failed: {str(stripe_error)}"
                        )

                # If we get here, everything succeeded
                print(f"✅ User created successfully: {user.username}")

        except Exception as e:
            # Transaction was rolled back, user was not created
            print(f"❌ Registration failed, transaction rolled back: {str(e)}")
            print(f"❌ Error type: {type(e).__name__}")
            import traceback

            print(f"❌ Full traceback: {traceback.format_exc()}")
            logger.error(f"Registration failed: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Send welcome email if enrollment was successful
        if is_enrollment:
            # Send welcome email to new enrollee
            try:
                # Format trial end date
                trial_end_formatted = (
                    user.trial_end_date.strftime("%B %d, %Y")
                    if user.trial_end_date
                    else "N/A"
                )

                # Create welcome email content
                subject = f"🎉 Welcome to POWER Scheduling - Your {user.subscription_tier.title()} Plan is Ready!"
                message = f"""
Welcome to POWER Scheduling, {user.first_name}!

Your account has been successfully created and your 7-day free trial has started.

📋 Account Details:
• Organization: {user.organization.name}
• Username: {user.username}
• Password: {plain_password}
• Email: {user.email}
• Subscription Plan: {user.subscription_tier.title()}

⏰ Trial Information:
Your free trial ends on {trial_end_formatted}. After the trial period, your subscription will automatically continue with monthly billing.

🚀 Getting Started:
1. Log in to your account at: http://127.0.0.1:3000/login
2. Complete your organization setup
3. Start scheduling appointments and managing patients

📞 Need Help?
If you have any questions or need assistance, feel free to reach out to our support team.

Thank you for choosing POWER Scheduling!

Best regards,
The POWER Scheduling Team
                """

                send_email(
                    to_email=user.email,
                    subject=subject,
                    message=message.strip(),
                    user=user,
                )

            except Exception as email_error:
                # Log email error but don't fail the registration
                logger.error(
                    f"Failed to send welcome email to {user.email}: {str(email_error)}"
                )
                print(f"⚠️ Welcome email failed for {user.email}: {str(email_error)}")

            # Send admin notification email for new enrollment
            try:
                admin_emails = (
                    get_admin_emails()
                )  # Get system admins (no specific organization)

                if admin_emails:
                    admin_subject = (
                        f"🚀 New Organization Enrollment - {user.organization.name}"
                    )
                    admin_message = f"""
New Organization Enrollment Alert

A new organization has successfully enrolled in POWER Scheduling!

🏢 Organization Details:
• Name: {user.organization.name}
• Type: {user.organization_type.title()}
• Subscription Plan: {user.subscription_tier.title()}

👤 Admin Contact:
• Name: {user.first_name} {user.last_name}
• Email: {user.email}
• Username: {user.username}
• Phone: {user.phone_number or 'Not provided'}

💳 Subscription Details:
• Plan: {user.subscription_tier.title()}
• Status: {user.subscription_status}
• Trial End Date: {trial_end_formatted}
• Stripe Customer ID: {getattr(user, 'stripe_customer_id', 'N/A')}

📅 Enrollment Date: {user.date_joined.strftime('%B %d, %Y at %I:%M %p')}

🔗 Quick Actions:
• View organization in admin panel
• Monitor trial usage and conversion
• Provide onboarding support if needed

This is an automated notification from POWER Scheduling.
                    """

                    for admin_email in admin_emails:
                        send_email(
                            to_email=admin_email,
                            subject=admin_subject,
                            message=admin_message.strip(),
                            user=user,  # Associate with enrolling user's organization
                        )

                    print(f"✅ Admin notification sent to {len(admin_emails)} admin(s)")

            except Exception as admin_email_error:
                # Log admin email error but don't fail the registration
                logger.error(
                    f"Failed to send admin notification for enrollment {user.email}: {str(admin_email_error)}"
                )
                print(
                    f"⚠️ Admin notification failed for enrollment {user.email}: {str(admin_email_error)}"
                )

        # Return success response
        if is_enrollment:
            return Response(
                {
                    "message": "User created successfully with 7-day free trial",
                    "user_id": user.id,
                    "trial_end_date": user.trial_end_date,
                    "subscription_tier": user.subscription_tier,
                    "subscription_status": user.subscription_status,
                },
                status=status.HTTP_201_CREATED,
            )
        else:
            return Response(
                {
                    "message": "Patient registered successfully",
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                },
                status=status.HTTP_201_CREATED,
            )


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Returns a paginated list of patients:
    - If doctor: only assigned patients
    - If registrar/admin: all patients in their org
    - If system_admin: all patients (all orgs)
    Supports search and provider filtering."""
    try:
        user = request.user
        logger.info(
            f"🔍 get_patients called by user: {user.username} (role: {user.role})"
        )

        if user.role not in ["doctor", "registrar", "admin", "system_admin"]:
            logger.warning(
                f"❌ Access denied for user {user.username} with role {user.role}"
            )
            return Response({"detail": "Access denied"}, status=403)

        if user.role == "doctor":
            patients = Patient.objects.select_related(
                "user", "user__provider", "organization"
            ).filter(user__provider=user)
        elif user.role == "system_admin":
            patients = Patient.objects.select_related(
                "user", "user__provider", "organization"
            ).all()
        else:
            # registrar or admin
            patients = Patient.objects.select_related(
                "user", "user__provider", "organization"
            ).filter(user__organization=user.organization)

        logger.info(f"📊 Initial patient count: {patients.count()}")

        search = request.GET.get("search")
        provider_id = request.GET.get("provider")

        if search:
            logger.info(f"🔍 Applying search filter: {search}")
            patients = patients.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__provider__first_name__icontains=search)
                | Q(user__provider__last_name__icontains=search)
            )

        if provider_id:
            logger.info(f"🔍 Applying provider filter: {provider_id}")
            patients = patients.filter(user__provider_id=provider_id)

        logger.info(f"📊 Filtered patient count: {patients.count()}")

        # Get page size from frontend parameter, default to 10
        page_size = request.GET.get("page_size", 10)
        try:
            page_size = int(page_size)
            # Limit page size to prevent excessive requests
            page_size = min(page_size, 100)
        except (ValueError, TypeError):
            page_size = 10

        logger.info(f"📄 Page size: {page_size}")

        paginator = PageNumberPagination()
        paginator.page_size = page_size
        result_page = paginator.paginate_queryset(
            patients.order_by("user__last_name"), request
        )

        logger.info(
            f"📄 Paginated result count: {len(result_page) if result_page else 0}"
        )

        serializer = PatientSerializer(result_page, many=True)
        logger.info(f"✅ Serialization completed successfully")

        return paginator.get_paginated_response(serializer.data)

    except Exception as e:
        logger.error(f"❌ Error in get_patients: {str(e)}", exc_info=True)
        return Response({"detail": f"Internal server error: {str(e)}"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    try:
        user = request.user
        current_password = request.data.get("current_password")
        new_password = request.data.get("new_password")
        confirm_password = request.data.get("confirm_password")

        print(f"🔍 Password change attempt for user: {user.username}")
        print(f"🔍 Current password provided: '{current_password}'")
        print(f"🔍 New password: '{new_password}'")
        print(f"🔍 Confirm password: '{confirm_password}'")

        if not current_password:
            print(f"❌ No current password provided")
            return Response(
                {"detail": "Current password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not new_password:
            print(f"❌ No new password provided")
            return Response(
                {"detail": "New password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.check_password(current_password):
            print(f"❌ Current password check failed for user: {user.username}")
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_password != confirm_password:
            print(
                f"❌ New passwords don't match: '{new_password}' vs '{confirm_password}'"
            )
            return Response(
                {"detail": "New passwords do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Set the new password
        user.set_password(new_password)
        user.save()

        # Note: update_session_auth_hash is not needed for JWT authentication
        # update_session_auth_hash(request, user)

        print(f"✅ Password changed successfully for user: {user.username}")
        return Response(
            {"detail": "Password changed successfully."}, status=status.HTTP_200_OK
        )

    except Exception as e:
        print(f"❌ Unexpected error during password change: {str(e)}")
        print(f"❌ Error type: {type(e).__name__}")
        import traceback

        print(f"❌ Traceback: {traceback.format_exc()}")
        return Response(
            {"detail": "An error occurred while changing the password."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_users(request):
    user = request.user

    # Only admin and system_admin can search users
    if user.role not in ["admin", "system_admin"]:
        return Response({"detail": "Access denied"}, status=403)

    query = request.GET.get("q", "")

    # Base query filter for all searches
    search_filter = (
        Q(username__icontains=query)
        | Q(email__icontains=query)
        | Q(first_name__icontains=query)
        | Q(last_name__icontains=query)
        | Q(role__icontains=query)
        | Q(organization__name__icontains=query)
    )

    # For system_admin, allow searching all users across organizations
    if user.role == "system_admin":
        users = CustomUser.objects.filter(search_filter)
    # For regular admins, restrict to their organization
    else:
        users = CustomUser.objects.filter(search_filter, organization=user.organization)

    serializer = UserSerializer(users.distinct(), many=True)
    return Response(serializer.data)


class UserViewSet(viewsets.ModelViewSet):
    """ViewSet for managing users."""

    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "first_name",
        "last_name",
        "email",
        "provider__first_name",
        "provider__last_name",
    ]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_sms(request):
    """
    Enhanced SMS sending endpoint with improved error handling and logging
    """
    phone = request.data.get("phone")
    message = request.data.get("message")

    logger.info(
        f"📨 SMS REQUEST RECEIVED from user {request.user.username}: phone={phone}, message_length={len(message) if message else 0}"
    )

    # Validate required fields
    if not phone or not message:
        error_msg = "Phone and message are required."
        logger.warning(f"SMS validation failed: {error_msg}")
        return Response({"error": error_msg}, status=400)

    # Validate phone number format (basic check)
    if not phone.startswith("+") or len(phone) < 10:
        error_msg = "Phone number must be in international format (e.g., +1234567890)"
        logger.warning(f"SMS phone validation failed: {error_msg} for phone={phone}")
        return Response({"error": error_msg}, status=400)

    try:
        # Create Twilio client with proper settings
        logger.info("🔧 Creating Twilio client...")
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        # Send SMS message
        logger.info(f"📤 Sending SMS to {phone} from {settings.TWILIO_PHONE_NUMBER}")
        sent = client.messages.create(
            body=message, from_=settings.TWILIO_PHONE_NUMBER, to=phone
        )

        logger.info(f"✅ SMS SENT successfully: SID={sent.sid}, Status={sent.status}")
        return Response(
            {"message": "SMS sent successfully", "sid": sent.sid, "status": sent.status}
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ TWILIO ERROR: {error_msg}")

        # Provide more specific error messages
        if "not a valid phone number" in error_msg.lower():
            return Response(
                {
                    "error": "Invalid phone number format. Use international format (e.g., +1234567890)"
                },
                status=400,
            )
        elif "not a mobile number" in error_msg.lower():
            return Response(
                {
                    "error": "Phone number is not a mobile number capable of receiving SMS"
                },
                status=400,
            )
        elif "account" in error_msg.lower() and "suspended" in error_msg.lower():
            return Response(
                {
                    "error": "SMS service temporarily unavailable. Please try again later."
                },
                status=503,
            )
        else:
            return Response({"error": f"SMS delivery failed: {error_msg}"}, status=500)


from django.core.mail import send_mail
from smtplib import SMTPException, SMTPAuthenticationError, SMTPConnectError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_sms_email(request):
    phone = request.data.get("phone")
    carrier = request.data.get("carrier")
    message = request.data.get("message")

    carrier_domains = {
        "verizon": "vtext.com",
        "att": "txt.att.net",
        "tmobile": "tmomail.net",
        "sprint": "messaging.sprintpcs.com",
    }

    if not phone or not carrier or not message:
        return Response(
            {"error": "Phone, carrier, and message are required."}, status=400
        )

    domain = carrier_domains.get(carrier.lower())
    if not domain:
        return Response({"error": "Unsupported carrier"}, status=400)

    to_email = f"{phone}@{domain}"

    try:
        send_mail(
            subject="",
            message=message,
            from_email=None,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return Response({"message": f"SMS sent to {phone} via {carrier}"})
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_patient_email(request):
    """
    Enhanced email sending endpoint with comprehensive logging and error handling
    """

    # Enhanced logging setup
    logger = logging.getLogger(__name__)
    logger.info(f"Email send request from user: {request.user.username}")

    try:
        # Extract and validate request data
        email = request.data.get("email")
        subject = request.data.get("subject", "Message from your provider")
        message = request.data.get("message")

        logger.info(
            f"Email request data: email={email}, subject='{subject}', message_length={len(message) if message else 0}"
        )

        # Validate required fields
        if not email or not message:
            error_msg = "Email and message are required."
            logger.warning(f"Validation failed: {error_msg}")
            return Response({"error": error_msg}, status=400)

        # Validate email format
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError

        try:
            validate_email(email)
        except ValidationError as e:
            error_msg = f"Invalid email format: {email}"
            logger.warning(f"Email validation failed: {error_msg}")
            return Response({"error": error_msg}, status=400)

        # Log email settings for debugging
        from django.conf import settings
        import os

        # Log environment variables directly for debugging
        logger.info("=== EMAIL DEBUG INFORMATION ===")
        logger.info(
            f"EMAIL_HOST_PASSWORD from env: {'***' if os.environ.get('EMAIL_HOST_PASSWORD') else 'NOT SET'}"
        )
        logger.info(
            f"EMAIL_HOST_USER from env: {os.environ.get('EMAIL_HOST_USER', 'NOT SET')}"
        )
        logger.info(f"EMAIL_HOST from env: {os.environ.get('EMAIL_HOST', 'NOT SET')}")
        logger.info(f"EMAIL_PORT from env: {os.environ.get('EMAIL_PORT', 'NOT SET')}")

        logger.info(f"Email backend: {settings.EMAIL_BACKEND}")
        logger.info(f"Email host: {getattr(settings, 'EMAIL_HOST', 'Not configured')}")
        logger.info(f"Email port: {getattr(settings, 'EMAIL_PORT', 'Not configured')}")
        logger.info(
            f"Email use SSL: {getattr(settings, 'EMAIL_USE_SSL', 'Not configured')}"
        )
        logger.info(
            f"Email host user: {getattr(settings, 'EMAIL_HOST_USER', 'Not configured')}"
        )
        logger.info(
            f"Default from email: {getattr(settings, 'DEFAULT_FROM_EMAIL', 'Not configured')}"
        )

        # Check email configuration before attempting to send
        email_backend = getattr(settings, "EMAIL_BACKEND", None)
        email_host = getattr(settings, "EMAIL_HOST", None)
        email_password = getattr(settings, "EMAIL_HOST_PASSWORD", None)

        logger.info(f"Current email backend: {email_backend}")
        logger.info(f"Current email host: {email_host}")
        logger.info(f"Email password configured: {'Yes' if email_password else 'No'}")

        # Only validate SMTP settings if using SMTP backend
        if email_backend == "django.core.mail.backends.smtp.EmailBackend":
            if not email_host:
                error_msg = "Email host is not configured"
                logger.error(error_msg)
                return Response(
                    {"error": "Email service is not configured"}, status=500
                )

            if not email_password:
                error_msg = "Email host password is not configured"
                logger.error(error_msg)
                return Response(
                    {"error": "Email service authentication is not configured"},
                    status=500,
                )
        elif email_backend == "django.core.mail.backends.console.EmailBackend":
            logger.info(
                "Using console email backend - emails will be logged instead of sent"
            )
        else:
            # Console backend or other backends don't need SMTP validation
            logger.info(f"Using non-SMTP backend: {email_backend}")

        # Attempt to send email with specific error handling
        logger.info(f"Attempting to send email to: {email}")
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=None,  # defaults to DEFAULT_FROM_EMAIL
                recipient_list=[email],
                fail_silently=False,
            )

            success_msg = f"Email sent successfully to {email}"
            logger.info(success_msg)
            return Response({"message": "Email sent successfully"})

        except SMTPAuthenticationError as e:
            error_msg = f"SMTP Authentication failed: {str(e)}"
            logger.error(error_msg)
            return Response(
                {"error": "Email service authentication failed"}, status=500
            )

        except SMTPConnectError as e:
            error_msg = f"SMTP Connection failed: {str(e)}"
            logger.error(error_msg)
            return Response({"error": "Cannot connect to email service"}, status=500)

        except SMTPException as e:
            error_msg = f"SMTP Error: {str(e)}"
            logger.error(error_msg)
            return Response({"error": f"Email service error: {str(e)}"}, status=500)

    except Exception as e:
        error_msg = f"Email sending failed: {str(e)}"
        logger.error(error_msg)
        logger.error(f"Exception type: {type(e).__name__}")

        # Log additional context for debugging
        import traceback

        logger.error(f"Full traceback: {traceback.format_exc()}")

        return Response(
            {"error": str(e), "detail": "Check server logs for more information"},
            status=500,
        )


class PatientDeleteView(DestroyAPIView):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user_id"  # because you're deleting via user_id


class DownloadProvidersCSVTemplate(APIView):
    permission_classes = [IsAdminOrSystemAdmin]

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="providers_template.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(
            [
                "username",
                "email",
                "first_name",
                "last_name",
                "organization",
                "phone_number",
                "provider",
                "role",
                "password",
            ]
        )
        return response


class UploadProvidersCSV(APIView):
    permission_classes = [IsAdminOrSystemAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        logger.info("🔵 Starting provider CSV upload")

        try:
            file = request.FILES.get("file")
            if not file:
                logger.error("❌ No file provided in provider upload request")
                return Response({"error": "No file provided."}, status=400)

            logger.info(f"📁 File received: {file.name}, size: {file.size} bytes")

            # Check file encoding and content
            try:
                decoded_file = file.read().decode("utf-8").splitlines()
                logger.info(f"📄 File decoded successfully, {len(decoded_file)} lines")
            except UnicodeDecodeError as e:
                logger.error(f"❌ File encoding error: {str(e)}")
                return Response({"error": f"File encoding error: {str(e)}"}, status=400)

            # Parse CSV
            try:
                reader = csv.DictReader(decoded_file)
                logger.info(f"📊 CSV headers: {reader.fieldnames}")
            except Exception as e:
                logger.error(f"❌ CSV parsing error: {str(e)}")
                return Response({"error": f"CSV parsing error: {str(e)}"}, status=400)

            created_count = 0
            updated_count = 0
            errors = []
            row_count = 0

            for row in reader:
                row_count += 1
                logger.info(f"🔄 Processing row {row_count}: {row}")

                try:
                    username = row.get("username", "").strip()
                    email = row.get("email", "").strip()
                    first_name = row.get("first_name", "").strip()
                    last_name = row.get("last_name", "").strip()
                    org_name = row.get("organization", "").strip()
                    phone_number = row.get("phone_number", "").strip()
                    provider_username = row.get("provider", "").strip()
                    role = row.get("role", "doctor").strip() or "doctor"
                    password = row.get("password", "").strip()

                    logger.info(
                        f"📋 Row data - Username: {username}, Email: {email}, Role: {role}, Phone: {phone_number}"
                    )

                    if not username or not email:
                        error_msg = (
                            f"Missing username or email for row {row_count}: {row}"
                        )
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate role
                    valid_roles = [
                        "patient",
                        "doctor",
                        "receptionist",
                        "admin",
                        "registrar",
                        "none",
                        "system_admin",
                    ]
                    if role not in valid_roles:
                        error_msg = f"Invalid role '{role}' for user '{username}'. Valid roles: {valid_roles}"
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate phone number format
                    if phone_number:
                        # Clean phone number - remove any non-digit characters except + and spaces
                        cleaned_phone = "".join(
                            c
                            for c in phone_number
                            if c.isdigit() or c in ["+", " ", "-", "(", ")"]
                        )
                        if len(cleaned_phone) > 20:  # Phone number too long
                            error_msg = f"Phone number too long for user '{username}': {phone_number}"
                            logger.warning(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue
                        phone_number = cleaned_phone

                    # Get or create organization
                    org = None
                    if org_name:
                        try:
                            org, org_created = Organization.objects.get_or_create(
                                name=org_name
                            )
                            logger.info(
                                f"🏢 Organization: {org.name} ({'created' if org_created else 'existing'})"
                            )
                        except Exception as e:
                            error_msg = f"Organization creation error for '{org_name}': {str(e)}"
                            logger.error(f"❌ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Get provider (if specified)
                    provider = None
                    if provider_username:
                        try:
                            provider = CustomUser.objects.get(
                                username=provider_username
                            )
                            logger.info(f"👨‍⚕️ Provider found: {provider.username}")
                        except CustomUser.DoesNotExist:
                            error_msg = f"Provider '{provider_username}' not found for user '{username}'"
                            logger.warning(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Create or update user
                    try:
                        user, created = CustomUser.objects.get_or_create(
                            username=username,
                            defaults={
                                "email": email,
                                "first_name": first_name,
                                "last_name": last_name,
                                "role": role,
                                "organization": org,
                                "phone_number": phone_number,
                            },
                        )
                        logger.info(
                            f"👤 User: {username} ({'created' if created else 'updated'})"
                        )

                        if created:
                            if password:
                                user.set_password(password)
                            else:
                                user.set_password("changeme123")
                            user.save()
                            created_count += 1
                        else:
                            # Update fields
                            user.email = email
                            user.first_name = first_name
                            user.last_name = last_name
                            user.role = role
                            user.organization = org
                            user.phone_number = phone_number
                            if password:
                                user.set_password(password)
                            user.save()
                            updated_count += 1

                        # Set provider relationship if specified
                        if provider:
                            user.provider = provider
                            user.save()
                            logger.info(
                                f"🔗 Provider relationship set: {username} -> {provider.username}"
                            )

                    except Exception as e:
                        error_msg = (
                            f"User creation/update error for '{username}': {str(e)}"
                        )
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                except Exception as e:
                    error_msg = f"Unexpected error processing row {row_count}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    errors.append(error_msg)
                    continue

            logger.info(
                f"✅ Provider upload completed - Created: {created_count}, Updated: {updated_count}, Errors: {len(errors)}"
            )

            return Response(
                {
                    "message": f"{created_count} providers created, {updated_count} updated.",
                    "errors": errors,
                }
            )

        except Exception as e:
            logger.error(
                f"❌ Critical error in provider upload: {str(e)}", exc_info=True
            )
            return Response({"error": f"Upload failed: {str(e)}"}, status=500)


class DownloadPatientsCSVTemplate(APIView):
    permission_classes = [IsAdminOrSystemAdmin]

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="patients_template.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "username",
                "email",
                "first_name",
                "last_name",
                "organization",
                "phone_number",
                "date_of_birth",
                "address",
                "medical_history",
                "password",
            ]
        )
        return response


class UploadPatientsCSV(APIView):
    permission_classes = [IsAdminOrSystemAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        logger.info("🔵 Starting patient CSV upload")

        try:
            file = request.FILES.get("file")
            if not file:
                logger.error("❌ No file provided in upload request")
                return Response({"error": "No file provided."}, status=400)

            logger.info(f"📁 File received: {file.name}, size: {file.size} bytes")

            # Check file encoding and content
            try:
                decoded_file = file.read().decode("utf-8").splitlines()
                logger.info(f"📄 File decoded successfully, {len(decoded_file)} lines")
            except UnicodeDecodeError as e:
                logger.error(f"❌ File encoding error: {str(e)}")
                return Response({"error": f"File encoding error: {str(e)}"}, status=400)

            # Parse CSV
            try:
                reader = csv.DictReader(decoded_file)
                logger.info(f"📊 CSV headers: {reader.fieldnames}")
            except Exception as e:
                logger.error(f"❌ CSV parsing error: {str(e)}")
                return Response({"error": f"CSV parsing error: {str(e)}"}, status=400)

            created_count = 0
            updated_count = 0
            errors = []
            row_count = 0

            for row in reader:
                row_count += 1
                logger.info(f"🔄 Processing row {row_count}: {row}")

                try:
                    username = row.get("username", "").strip()
                    email = row.get("email", "").strip()
                    first_name = row.get("first_name", "").strip()
                    last_name = row.get("last_name", "").strip()
                    org_name = row.get("organization", "").strip()
                    phone_number = row.get("phone_number", "").strip()
                    date_of_birth = row.get("date_of_birth", "").strip()
                    address = row.get("address", "").strip()
                    medical_history = row.get("medical_history", "").strip()
                    password = row.get("password", "").strip()

                    logger.info(
                        f"📋 Row data - Username: {username}, Email: {email}, Phone: {phone_number}"
                    )

                    if not username or not email:
                        error_msg = (
                            f"Missing username or email for row {row_count}: {row}"
                        )
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate phone number format
                    if phone_number:
                        # Clean phone number - remove any non-digit characters except + and spaces
                        cleaned_phone = "".join(
                            c
                            for c in phone_number
                            if c.isdigit() or c in ["+", " ", "-", "(", ")"]
                        )
                        if len(cleaned_phone) > 20:  # Phone number too long
                            error_msg = f"Phone number too long for user '{username}': {phone_number}"
                            logger.warning(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue
                        phone_number = cleaned_phone

                    # Parse date of birth
                    dob = None
                    if date_of_birth:
                        try:
                            from datetime import datetime

                            dob = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
                            logger.info(f"📅 Parsed DOB: {dob}")
                        except ValueError as e:
                            error_msg = f"Invalid date format for user '{username}'. Use YYYY-MM-DD format. Error: {str(e)}"
                            logger.warning(f"⚠️ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Get or create organization
                    org = None
                    if org_name:
                        try:
                            org, org_created = Organization.objects.get_or_create(
                                name=org_name
                            )
                            logger.info(
                                f"🏢 Organization: {org.name} ({'created' if org_created else 'existing'})"
                            )
                        except Exception as e:
                            error_msg = f"Organization creation error for '{org_name}': {str(e)}"
                            logger.error(f"❌ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Create or update user (with patient role)
                    try:
                        user, created = CustomUser.objects.get_or_create(
                            username=username,
                            defaults={
                                "email": email,
                                "first_name": first_name,
                                "last_name": last_name,
                                "role": "patient",  # Always set role to patient
                                "organization": org,
                                "phone_number": phone_number,
                            },
                        )
                        logger.info(
                            f"👤 User: {username} ({'created' if created else 'updated'})"
                        )

                        if created:
                            if password:
                                user.set_password(password)
                            else:
                                user.set_password("changeme123")
                            user.save()
                            created_count += 1
                        else:
                            # Update user fields
                            user.email = email
                            user.first_name = first_name
                            user.last_name = last_name
                            user.role = "patient"  # Ensure role is patient
                            user.organization = org
                            user.phone_number = phone_number
                            if password:
                                user.set_password(password)
                            user.save()
                            updated_count += 1

                    except Exception as e:
                        error_msg = (
                            f"User creation/update error for '{username}': {str(e)}"
                        )
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Create or update patient profile
                    try:
                        patient, patient_created = Patient.objects.get_or_create(
                            user=user,
                            defaults={
                                "date_of_birth": dob,
                                "address": address,
                                "medical_history": medical_history,
                                "organization": org,
                            },
                        )
                        logger.info(
                            f"🏥 Patient profile: ({'created' if patient_created else 'updated'})"
                        )

                        if not patient_created:
                            # Update patient fields
                            patient.date_of_birth = dob or patient.date_of_birth
                            patient.address = address or patient.address
                            patient.medical_history = (
                                medical_history or patient.medical_history
                            )
                            patient.organization = org or patient.organization
                            patient.save()

                    except Exception as e:
                        error_msg = f"Patient profile creation/update error for '{username}': {str(e)}"
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                except Exception as e:
                    error_msg = f"Unexpected error processing row {row_count}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    errors.append(error_msg)
                    continue

            logger.info(
                f"✅ Upload completed - Created: {created_count}, Updated: {updated_count}, Errors: {len(errors)}"
            )

            return Response(
                {
                    "message": f"Upload completed. Created {created_count} patients, updated {updated_count} patients.",
                    "errors": errors,
                }
            )

        except Exception as e:
            logger.error(
                f"❌ Critical error in patient upload: {str(e)}", exc_info=True
            )
            return Response({"error": f"Upload failed: {str(e)}"}, status=500)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Return or update the current user's information"""
    user = request.user

    if request.method == "GET":
        serializer = UserSerializer(user)
        return Response(serializer.data)

    elif request.method == "PATCH":
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_team_members(request):
    """Return non-patient users for the current organization"""
    user = request.user
    if user.role not in [
        "admin",
        "system_admin",
        "doctor",
        "registrar",
        "receptionist",
    ]:
        return Response({"detail": "Access denied"}, status=403)

    if user.role == "system_admin":
        members = CustomUser.objects.exclude(role="patient")
    else:
        members = CustomUser.objects.exclude(role="patient").filter(
            organization=user.organization
        )

    search = request.GET.get("search")
    if search:
        members = members.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(email__icontains=search)
        )

    # Get page size from frontend parameter, default to 10
    page_size = request.GET.get("page_size", 10)
    try:
        page_size = int(page_size)
        # Limit page size to prevent excessive requests
        page_size = min(page_size, 100)
    except (ValueError, TypeError):
        page_size = 10

    paginator = PageNumberPagination()
    paginator.page_size = page_size
    result_page = paginator.paginate_queryset(members.order_by("last_name"), request)
    serializer = UserSerializer(result_page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(["POST"])
@permission_classes([AllowAny])  # Public endpoint
def send_contact_email(request):
    """
    Public endpoint for sending contact emails from the website
    """
    try:
        name = request.data.get("name", "")
        email = request.data.get("email", "")
        subject = request.data.get("subject", "Contact Form Submission")
        message = request.data.get("message", "")

        if not email or not message:
            return Response({"error": "Email and message are required"}, status=400)

        # Send email to admin/support team
        admin_email = "support@poehrscheduling.com"  # Replace with actual admin email

        full_message = f"""
        Contact Form Submission:
        
        Name: {name}
        Email: {email}
        Subject: {subject}
        
        Message:
        {message}
        """

        send_mail(
            subject=f"Contact Form: {subject}",
            message=full_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[admin_email],
            fail_silently=False,
        )

        return Response({"message": "Contact email sent successfully"}, status=200)

    except Exception as e:
        return Response(
            {"error": f"Failed to send contact email: {str(e)}"}, status=500
        )


@api_view(["POST"])
@permission_classes([AllowAny])  # Public endpoint
def send_contact_sms(request):
    """
    Public endpoint for sending contact SMS notifications with enhanced validation and logging
    """
    try:
        phone = request.data.get("phone", "")
        message = request.data.get("message", "")

        logger.info(
            f"📨 CONTACT SMS REQUEST: phone={phone}, message_length={len(message) if message else 0}"
        )

        # Validate required fields
        if not phone or not message:
            error_msg = "Phone and message are required"
            logger.warning(f"Contact SMS validation failed: {error_msg}")
            return Response({"error": error_msg}, status=400)

        # Validate phone number format
        if not phone.startswith("+") or len(phone) < 10:
            error_msg = (
                "Phone number must be in international format (e.g., +1234567890)"
            )
            logger.warning(
                f"Contact SMS phone validation failed: {error_msg} for phone={phone}"
            )
            return Response({"error": error_msg}, status=400)

        # Initialize Twilio client
        logger.info("🔧 Creating Twilio client for contact SMS...")
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        # Send SMS
        logger.info(
            f"📤 Sending contact SMS to {phone} from {settings.TWILIO_PHONE_NUMBER}"
        )
        sms_result = client.messages.create(
            body=message, from_=settings.TWILIO_PHONE_NUMBER, to=phone
        )

        logger.info(
            f"✅ CONTACT SMS SENT successfully: SID={sms_result.sid}, Status={sms_result.status}"
        )
        return Response(
            {"message": "Contact SMS sent successfully", "sid": sms_result.sid},
            status=200,
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ CONTACT SMS ERROR: {error_msg}")

        # Provide specific error messages
        if "not a valid phone number" in error_msg.lower():
            return Response(
                {
                    "error": "Invalid phone number format. Use international format (e.g., +1234567890)"
                },
                status=400,
            )
        elif "not a mobile number" in error_msg.lower():
            return Response(
                {
                    "error": "Phone number is not a mobile number capable of receiving SMS"
                },
                status=400,
            )
        else:
            return Response(
                {"error": f"Failed to send contact SMS: {error_msg}"}, status=500
            )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_change_password(request):
    """
    Allow admins to change another user's password by providing:
    - target_user_id: The ID of the user whose password to change
    - admin_password: The admin's current password for verification
    - new_password: The new password for the target user
    - confirm_password: Confirmation of the new password
    """
    admin_user = request.user

    # Only admins and system_admins can use this endpoint
    if admin_user.role not in ["admin", "system_admin"]:
        print(
            f"❌ Access denied for user: {admin_user.username} (role: {admin_user.role})"
        )
        return Response(
            {"detail": "Access denied. Admin privileges required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target_user_id = request.data.get("target_user_id")
    admin_password = request.data.get("admin_password")
    new_password = request.data.get("new_password")
    confirm_password = request.data.get("confirm_password")

    print(f"🔍 Admin password change attempt by: {admin_user.username}")
    print(f"🔍 Target user ID: {target_user_id}")
    print(f"🔍 Admin password provided: '{admin_password}'")
    print(f"🔍 New password: '{new_password}'")
    print(f"🔍 Confirm password: '{confirm_password}'")

    if not target_user_id:
        return Response(
            {"detail": "Target user ID is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify admin's password
    if not admin_user.check_password(admin_password):
        print(f"❌ Admin password check failed for user: {admin_user.username}")
        return Response(
            {"detail": "Admin password is incorrect."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify new password confirmation
    if new_password != confirm_password:
        print(f"❌ New passwords don't match: '{new_password}' vs '{confirm_password}'")
        return Response(
            {"detail": "New passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        # Get the target user
        target_user = CustomUser.objects.get(id=target_user_id)
        print(f"🔍 Target user found: {target_user.username}")

        # Additional security: system_admin can change anyone's password,
        # but regular admin can only change passwords within their organization
        if admin_user.role == "admin":
            if target_user.organization != admin_user.organization:
                print(
                    f"❌ Admin {admin_user.username} tried to change password for user in different organization"
                )
                return Response(
                    {
                        "detail": "You can only change passwords for users in your organization."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Change the target user's password
        target_user.set_password(new_password)
        target_user.save()

        print(
            f"✅ Password changed successfully for target user: {target_user.username} by admin: {admin_user.username}"
        )
        return Response(
            {
                "detail": f"Password changed successfully for {target_user.first_name} {target_user.last_name}."
            },
            status=status.HTTP_200_OK,
        )

    except CustomUser.DoesNotExist:
        print(f"❌ Target user with ID {target_user_id} not found")
        return Response(
            {"detail": "Target user not found."}, status=status.HTTP_404_NOT_FOUND
        )


@api_view(["POST"])
@permission_classes([IsAdminUser])  # Only system administrators can trigger this
def send_trial_reminders(request):
    """
    Manually trigger trial reminder emails
    Admin endpoint to send trial reminders for users whose trials are expiring soon
    """
    try:
        days_before = request.data.get("days_before", 3)
        dry_run = request.data.get("dry_run", False)

        # Calculate the target date (X days from now)
        target_date = timezone.now().date() + timedelta(days=days_before)

        # Find users with trials expiring on the target date
        expiring_users = CustomUser.objects.filter(
            trial_end_date=target_date,
            subscription_status="trial",
            role__in=[
                "admin",
                "system_admin",
            ],  # Only organization admins get trial reminders
        ).exclude(email="")

        if not expiring_users.exists():
            return Response(
                {
                    "message": f"No users found with trials expiring in {days_before} days",
                    "sent_count": 0,
                    "target_date": target_date.strftime("%Y-%m-%d"),
                },
                status=200,
            )

        sent_count = 0
        errors = []

        for user in expiring_users:
            try:
                if not dry_run:
                    send_trial_reminder_email(user, days_before)
                sent_count += 1

            except Exception as e:
                errors.append(
                    {
                        "user_email": user.email,
                        "organization": (
                            user.organization.name if user.organization else "Unknown"
                        ),
                        "error": str(e),
                    }
                )
                logger.error(f"Trial reminder email failed for {user.email}: {str(e)}")

        action = "Would send" if dry_run else "Sent"
        return Response(
            {
                "message": f"{action} {sent_count} trial reminder emails",
                "sent_count": sent_count,
                "target_date": target_date.strftime("%Y-%m-%d"),
                "days_before": days_before,
                "dry_run": dry_run,
                "errors": errors,
            },
            status=200,
        )

    except Exception as e:
        return Response(
            {"error": f"Failed to send trial reminders: {str(e)}"}, status=500
        )


def send_trial_reminder_email(user, days_before):
    """Helper function to send trial reminder email"""

    # Format trial end date
    trial_end_formatted = user.trial_end_date.strftime("%B %d, %Y")

    # Determine urgency level for subject
    if days_before <= 1:
        urgency = "⏰ URGENT: "
        urgency_text = "tomorrow" if days_before == 1 else "today"
    elif days_before <= 3:
        urgency = "⚠️ REMINDER: "
        urgency_text = f"in {days_before} days"
    else:
        urgency = "📅 NOTICE: "
        urgency_text = f"in {days_before} days"

    subject = f"{urgency}Your POWER Scheduling trial expires {urgency_text}"

    message = f"""
Hello {user.first_name},

Your POWER Scheduling free trial is expiring {urgency_text} on {trial_end_formatted}.

🏢 Organization: {user.organization.name}
📊 Current Plan: {user.subscription_tier.title()}
📅 Trial End Date: {trial_end_formatted}

🚀 Don't lose access to your scheduling system!

To continue using POWER Scheduling without interruption:

1. 💳 Update your payment method (if needed)
2. 📋 Review your subscription settings
3. 🔄 Your subscription will automatically continue after the trial

🔗 Manage your subscription:
• Log in at: http://127.0.0.1:3000/login
• Go to Account Settings > Subscription
• Update payment methods and billing preferences

💬 What happens next:
• If payment method is valid: Automatic conversion to paid subscription
• If payment fails: Account will be suspended until payment is resolved
• All your data and settings will be preserved

📞 Need assistance?
Our support team is here to help with:
• Payment and billing questions
• Plan upgrades or changes
• Technical support

Contact us if you have any questions or need help with your subscription.

Thank you for choosing POWER Scheduling!

Best regards,
The POWER Scheduling Team

---
This is an automated reminder. You're receiving this because your trial is expiring soon.
    """

    send_email(to_email=user.email, subject=subject, message=message.strip(), user=user)


class PatientMobileView(RetrieveUpdateDestroyAPIView):
    """
    View to handle patient operations for mobile app.
    Supports GET, PUT, PATCH, and DELETE operations using Patient primary key.
    URL: /api/users/patients/{patient_id}/
    """

    queryset = Patient.objects.select_related("user")
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"  # Use Patient primary key, not user_id

    def update(self, request, *args, **kwargs):
        # Print the incoming data to debug
        print("Mobile Patient Update Data:", request.data)
        print("Patient ID:", kwargs.get("pk"))
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        print("Mobile Patient Delete - Patient ID:", kwargs.get("pk"))
        return super().destroy(request, *args, **kwargs)


# ==========================================
# OFFLINE CHAT MESSAGE API ENDPOINTS
# ==========================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_unread_messages(request):
    """
    Get all unread chat messages for the current user
    """
    from .models import ChatMessage

    try:
        user = request.user

        # Get all unread messages where the current user is the recipient
        unread_messages = (
            ChatMessage.objects.filter(recipient=user, is_read=False)
            .select_related("sender", "room")
            .order_by("timestamp")
        )

        # Format messages for frontend
        messages_data = []
        for message in unread_messages:
            messages_data.append(
                {
                    "id": message.id,
                    "sender_id": message.sender.id,
                    "sender_name": f"{message.sender.first_name} {message.sender.last_name}".strip()
                    or message.sender.username,
                    "sender_username": message.sender.username,
                    "content": message.message,
                    "timestamp": message.timestamp.isoformat(),
                    "room_id": message.room.id if message.room else None,
                    "message_type": message.message_type,
                }
            )

        return Response(
            {"unread_messages": messages_data, "count": len(messages_data)}, status=200
        )

    except Exception as e:
        logger.error(f"❌ Error fetching unread messages for user {user.id}: {str(e)}")
        return Response({"error": "Failed to fetch unread messages"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_messages_read(request):
    """
    Mark specific messages as read
    Expected payload: {'message_ids': [1, 2, 3]}
    """
    from .models import ChatMessage

    try:
        user = request.user
        message_ids = request.data.get("message_ids", [])

        if not message_ids:
            return Response({"error": "message_ids required"}, status=400)

        # Mark messages as read (only if current user is the recipient)
        updated_count = ChatMessage.objects.filter(
            id__in=message_ids, recipient=user, is_read=False
        ).update(is_read=True)

        return Response(
            {
                "marked_read": updated_count,
                "message": f"{updated_count} messages marked as read",
            },
            status=200,
        )

    except Exception as e:
        logger.error(f"❌ Error marking messages as read for user {user.id}: {str(e)}")
        return Response({"error": "Failed to mark messages as read"}, status=500)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_chat_rooms_with_unread(request):
    """
    Get all chat rooms for the user with unread message counts
    """
    from .models import ChatRoom, ChatMessage
    from django.db.models import Count, Q

    try:
        user = request.user

        # Get all rooms where user is a participant
        user_rooms = (
            ChatRoom.objects.filter(participants=user)
            .prefetch_related("participants")
            .annotate(
                unread_count=Count(
                    "messages",
                    filter=Q(messages__recipient=user, messages__is_read=False),
                )
            )
            .order_by("-created_at")
        )

        rooms_data = []
        for room in user_rooms:
            # Get the other participant (for direct messages)
            other_participants = room.participants.exclude(id=user.id)
            other_user = (
                other_participants.first() if other_participants.exists() else None
            )

            # Get the last message in the room
            last_message = room.messages.order_by("-timestamp").first()

            room_data = {
                "id": room.id,
                "name": room.name,
                "room_type": room.room_type,
                "unread_count": room.unread_count,
                "last_activity": room.created_at.isoformat(),
                "other_user": (
                    {
                        "id": other_user.id,
                        "username": other_user.username,
                        "full_name": f"{other_user.first_name} {other_user.last_name}".strip()
                        or other_user.username,
                    }
                    if other_user
                    else None
                ),
                "last_message": (
                    {
                        "content": last_message.message,
                        "timestamp": last_message.timestamp.isoformat(),
                        "sender_name": f"{last_message.sender.first_name} {last_message.sender.last_name}".strip()
                        or last_message.sender.username,
                    }
                    if last_message
                    else None
                ),
            }
            rooms_data.append(room_data)

        return Response(
            {
                "chat_rooms": rooms_data,
                "total_unread": sum(room["unread_count"] for room in rooms_data),
            },
            status=200,
        )

    except Exception as e:
        logger.error(f"❌ Error fetching chat rooms for user {user.id}: {str(e)}")
        return Response({"error": "Failed to fetch chat rooms"}, status=500)


@api_view(["GET"])
@permission_classes([AllowAny])
def debug_stripe_config(request):
    """Debug endpoint to check Stripe configuration"""
    from django.conf import settings
    import stripe

    debug_info = {
        "stripe_secret_key_configured": bool(
            getattr(settings, "STRIPE_SECRET_KEY", None)
        ),
        "stripe_secret_key_preview": None,
        "stripe_api_test": None,
        "environment": getattr(settings, "DEBUG", "Unknown"),
    }

    # Check if secret key exists and preview it
    if hasattr(settings, "STRIPE_SECRET_KEY") and settings.STRIPE_SECRET_KEY:
        debug_info["stripe_secret_key_preview"] = (
            settings.STRIPE_SECRET_KEY[:12] + "..."
        )

        # Test basic Stripe API access
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            # Try a simple API call
            stripe.Account.retrieve()
            debug_info["stripe_api_test"] = "SUCCESS - API key is valid"
        except Exception as e:
            debug_info["stripe_api_test"] = f"FAILED - {str(e)}"
    else:
        debug_info["stripe_secret_key_preview"] = "NOT_SET"
        debug_info["stripe_api_test"] = "SKIPPED - No secret key"

    return Response(debug_info)


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def debug_delete_user(request, user_id):
    """Debug endpoint to test user deletion without going through the view"""
    try:
        logger.info(
            f"🔧 DEBUG DELETE: User {request.user.username} trying to delete user {user_id}"
        )
        print(
            f"🔧 DEBUG DELETE: User {request.user.username} trying to delete user {user_id}"
        )

        # Check authentication
        if not request.user.is_authenticated:
            return Response({"error": "Not authenticated"}, status=401)

        # Check if target user exists
        try:
            target_user = CustomUser.objects.get(pk=user_id)
            logger.info(f"🔧 Target user found: {target_user.username}")
            print(f"🔧 Target user found: {target_user.username}")
        except CustomUser.DoesNotExist:
            return Response({"error": f"User {user_id} not found"}, status=404)

        # Check permissions
        if request.user.role not in ["admin", "system_admin"]:
            return Response(
                {"error": f"Permission denied. Your role: {request.user.role}"},
                status=403,
            )

        if request.method == "GET":
            # Just return debug info
            return Response(
                {
                    "requesting_user": request.user.username,
                    "requesting_user_role": request.user.role,
                    "target_user": target_user.username,
                    "target_user_id": target_user.pk,
                    "can_delete": True,
                    "message": "Ready to delete (use DELETE method)",
                }
            )

        elif request.method == "DELETE":
            # Actually perform deletion
            username = target_user.username
            target_user.delete()
            logger.info(f"✅ DEBUG: User {username} deleted successfully")
            print(f"✅ DEBUG: User {username} deleted successfully")
            return Response({"message": f"User {username} deleted successfully"})

    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ DEBUG DELETE ERROR: {error_msg}")
        print(f"❌ DEBUG DELETE ERROR: {error_msg}")
        import traceback

        traceback_str = traceback.format_exc()
        logger.error(f"❌ DEBUG TRACEBACK: {traceback_str}")
        print(f"❌ DEBUG TRACEBACK: {traceback_str}")
        return Response({"error": error_msg, "traceback": traceback_str}, status=500)
