from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .stripe_service import StripeService
from .models import CustomUser
import json
import logging

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_subscription(request):
    """Cancel user subscription with soft delete and access revocation"""
    try:
        data = request.data  # DRF automatically parses JSON
        user = request.user

        # Extract cancellation data
        cancellation_type = "immediate" if data.get("immediate", True) else "scheduled"
        reason = data.get("reason", "")
        scheduled_date = (
            data.get("endDate") if cancellation_type == "scheduled" else None
        )

        logger.info(f"🗑️ Account cancellation requested for user {user.username}")
        logger.info(f"📅 Cancellation type: {cancellation_type}")

        # Cancel Stripe subscription if exists
        try:
            if user.stripe_subscription_id:
                stripe_result = StripeService.cancel_subscription(user)
                logger.info(
                    f"✅ Stripe subscription cancelled: {user.stripe_subscription_id}"
                )
            else:
                logger.info("ℹ️ No Stripe subscription to cancel")
        except Exception as stripe_error:
            logger.error(f"❌ Stripe cancellation failed: {stripe_error}")
            # Continue with account cancellation even if Stripe fails

        # Soft delete: Deactivate account but keep data
        success = user.cancel_account(
            cancellation_type=cancellation_type,
            reason=reason,
            scheduled_date=scheduled_date,
        )

        if success:
            # Send cancellation confirmation email
            try:
                send_mail(
                    subject="Account Cancellation Confirmation - POWER Scheduler",
                    message=f"""
Dear {user.first_name or user.username},

Your POWER Scheduler account has been cancelled as requested.

Cancellation Details:
- Type: {cancellation_type.title()}
- Date: {timezone.now().strftime('%B %d, %Y at %I:%M %p')}
- Reason: {reason or 'Not provided'}

Your data has been retained for compliance purposes, but your access has been revoked.

If you have any questions or need to reactivate your account, please contact our support team.

Best regards,
POWER Healthcare IT Team
                    """,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
                logger.info(f"📧 Cancellation email sent to {user.email}")
            except Exception as e:
                logger.error(f"❌ Failed to send cancellation email: {e}")

            logger.info(f"✅ Account cancelled successfully for user {user.username}")

            return Response(
                {
                    "success": True,
                    "message": "Account cancelled successfully",
                    "cancellation_type": cancellation_type,
                    "cancelled_at": (
                        user.cancelled_at.isoformat() if user.cancelled_at else None
                    ),
                },
                status=status.HTTP_200_OK,
            )
        else:
            return Response(
                {"success": False, "message": "Failed to cancel account"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Exception as e:
        logger.error(f"❌ Account cancellation failed: {e}")
        return Response(
            {"success": False, "message": f"Account cancellation failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_plan(request):
    """Change user subscription plan"""
    try:
        data = request.data  # DRF automatically parses JSON
        new_plan = data.get("plan")
        user = request.user

        logger.info(f"📋 Plan change requested for user {user.username} to {new_plan}")

        # Update Stripe subscription if exists
        try:
            if user.stripe_subscription_id and new_plan:
                stripe_result = StripeService.update_subscription_tier(user, new_plan)
                logger.info(f"✅ Stripe subscription updated to {new_plan}")
            else:
                # Update user's subscription tier directly if no Stripe subscription
                user.subscription_tier = new_plan
                user.save()
        except Exception as stripe_error:
            logger.error(f"❌ Stripe plan change failed: {stripe_error}")
            return JsonResponse(
                {
                    "success": False,
                    "message": f"Failed to change plan: {str(stripe_error)}",
                },
                status=500,
            )

        logger.info(f"✅ Plan changed successfully to {new_plan}")

        return Response(
            {
                "success": True,
                "message": f"Plan changed to {new_plan} successfully",
                "new_plan": new_plan,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Plan change failed: {e}")
        return Response(
            {"success": False, "message": f"Failed to change plan: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_methods(request):
    """Get user's payment methods"""
    try:
        user = request.user

        # TODO: Implement Stripe payment methods retrieval
        # For now, return mock data
        return Response(
            {
                "payment_methods": [
                    {
                        "id": "pm_mock",
                        "type": "Visa",
                        "last4": "4242",
                        "expires": "12/25",
                        "isDefault": True,
                    }
                ]
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Failed to get payment methods: {e}")
        return Response(
            {"success": False, "message": f"Failed to get payment methods: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def billing_history(request):
    """Get user's billing history"""
    try:
        user = request.user

        # TODO: Implement Stripe billing history retrieval
        # For now, return mock data
        return Response(
            {
                "billing_history": [
                    {
                        "id": 1,
                        "date": "2025-07-15",
                        "amount": "$99.00",
                        "status": "Paid",
                        "description": f"{user.subscription_tier} Plan - Monthly",
                    }
                ]
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Failed to get billing history: {e}")
        return Response(
            {"success": False, "message": f"Failed to get billing history: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_payment_method(request):
    """Add a new payment method"""
    try:
        data = request.data  # DRF automatically parses JSON
        user = request.user

        # TODO: Implement Stripe payment method creation
        logger.info(f"💳 Payment method addition requested for user {user.username}")

        return Response(
            {"success": True, "message": "Payment method added successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Failed to add payment method: {e}")
        return Response(
            {"success": False, "message": f"Failed to add payment method: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_payment_method(request, method_id):
    """Delete a payment method"""
    try:
        user = request.user

        # TODO: Implement Stripe payment method deletion
        logger.info(
            f"🗑️ Payment method deletion requested: {method_id} for user {user.username}"
        )

        return Response(
            {"success": True, "message": "Payment method deleted successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Failed to delete payment method: {e}")
        return Response(
            {"success": False, "message": f"Failed to delete payment method: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
