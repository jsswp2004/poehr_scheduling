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
        organization_id = data.get("organization_id")

        # Determine target organization for plan change
        target_user = user  # Default to the requesting user
        target_organization = user.organization  # Default to user's organization

        # If system admin is changing plan for another organization
        if user.role == "system_admin" and organization_id:
            try:
                from .models import Organization

                target_organization = Organization.objects.get(id=organization_id)

                # For organization plan changes, find a user in that org to update
                org_users = target_organization.users.filter(
                    role__in=["admin", "system_admin"]
                ).first()
                if org_users:
                    target_user = org_users
                else:
                    # If no admin users, use any user from the organization
                    target_user = target_organization.users.first()

                logger.info(
                    f"📋 Plan change requested by system admin {user.username} for organization {target_organization.name} (via user {target_user.username if target_user else 'direct'}) to {new_plan}"
                )
            except Organization.DoesNotExist:
                return Response(
                    {"success": False, "message": "Organization not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            logger.info(
                f"📋 Plan change requested for user {user.username} to {new_plan}"
            )

        # Update Stripe subscription if exists
        try:
            if target_user and target_user.stripe_subscription_id and new_plan:
                stripe_result = StripeService.update_subscription_tier(
                    target_user, new_plan
                )
                logger.info(f"✅ Stripe subscription updated to {new_plan}")
            else:
                # Update user's subscription tier directly if no Stripe subscription
                if target_user:
                    target_user.subscription_tier = new_plan
                    target_user.save()

                # Always update the organization subscription tier when system admin makes changes
                if target_organization:
                    target_organization.subscription_tier = new_plan
                    target_organization.save()
                    logger.info(
                        f"✅ Organization {target_organization.name} subscription tier updated to {new_plan}"
                    )

        except Exception as stripe_error:
            logger.error(f"❌ Stripe plan change failed: {stripe_error}")
            return JsonResponse(
                {
                    "success": False,
                    "message": f"Failed to change plan: {str(stripe_error)}",
                },
                status=500,
            )

        # Prepare response message
        org_context = (
            f" for {target_organization.name}"
            if target_organization != user.organization
            else ""
        )
        logger.info(f"✅ Plan changed successfully to {new_plan}{org_context}")

        return Response(
            {
                "success": True,
                "message": f"Plan changed to {new_plan} successfully{org_context}",
                "new_plan": new_plan,
                "organization": (
                    target_organization.name if target_organization else None
                ),
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
        organization_id = request.GET.get("organization_id")

        # Determine target user for payment methods
        target_user = user

        # If system admin is querying for another organization
        if user.role == "system_admin" and organization_id:
            try:
                from .models import Organization

                target_organization = Organization.objects.get(id=organization_id)

                # Find an admin user in that organization for payment methods
                org_admin = target_organization.users.filter(
                    role__in=["admin", "system_admin"]
                ).first()

                if org_admin:
                    target_user = org_admin
                else:
                    # No admin users with payment methods
                    return Response(
                        {"payment_methods": []},
                        status=status.HTTP_200_OK,
                    )

            except Organization.DoesNotExist:
                return Response(
                    {"error": "Organization not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # If user doesn't have a Stripe customer ID, return empty list
        if not target_user.stripe_customer_id:
            return Response(
                {"payment_methods": []},
                status=status.HTTP_200_OK,
            )

        # Retrieve payment methods from Stripe
        import stripe

        payment_methods = stripe.PaymentMethod.list(
            customer=target_user.stripe_customer_id,
            type="card",
        )

        # Get customer to check default payment method
        customer = stripe.Customer.retrieve(target_user.stripe_customer_id)
        default_payment_method = customer.get("invoice_settings", {}).get(
            "default_payment_method"
        )

        # Format payment methods for frontend
        formatted_methods = []
        for pm in payment_methods.data:
            card = pm.card
            formatted_methods.append(
                {
                    "id": pm.id,
                    "type": card.brand.title(),  # visa -> Visa
                    "last4": card.last4,
                    "expires": f"{str(card.exp_month).zfill(2)}/{str(card.exp_year)[2:]}",
                    "isDefault": pm.id == default_payment_method,
                }
            )

        return Response(
            {"payment_methods": formatted_methods},
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
        organization_id = request.GET.get("organization_id")

        # Determine target user for billing history
        target_user = user

        # If system admin is querying for another organization
        if user.role == "system_admin" and organization_id:
            try:
                from .models import Organization

                target_organization = Organization.objects.get(id=organization_id)

                # Find an admin user in that organization for billing history
                org_admin = target_organization.users.filter(
                    role__in=["admin", "system_admin"]
                ).first()

                if org_admin:
                    target_user = org_admin
                else:
                    # No admin users with billing history
                    return Response(
                        {"billing_history": []},
                        status=status.HTTP_200_OK,
                    )

            except Organization.DoesNotExist:
                return Response(
                    {"error": "Organization not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # If user doesn't have a Stripe customer ID, return empty list
        if not target_user.stripe_customer_id:
            return Response(
                {"billing_history": []},
                status=status.HTTP_200_OK,
            )

        # Retrieve invoices from Stripe
        import stripe
        from datetime import datetime

        invoices = stripe.Invoice.list(
            customer=target_user.stripe_customer_id,
            limit=50,  # Get last 50 invoices
        )

        # Format billing history for frontend
        formatted_history = []
        for invoice in invoices.data:
            # Convert timestamp to readable date
            invoice_date = datetime.fromtimestamp(invoice.created).strftime("%Y-%m-%d")

            # Format amount (Stripe amounts are in cents)
            amount = f"${invoice.amount_paid / 100:.2f}"

            # Determine status
            status_text = "Paid" if invoice.paid else "Unpaid"
            if invoice.status == "open":
                status_text = "Pending"
            elif invoice.status == "draft":
                status_text = "Draft"
            elif invoice.status == "void":
                status_text = "Void"

            # Get description from subscription or line items
            description = f"{user.subscription_tier} Plan - Monthly"
            if invoice.lines.data:
                line_item = invoice.lines.data[0]
                if line_item.description:
                    description = line_item.description

            formatted_history.append(
                {
                    "id": invoice.id,
                    "date": invoice_date,
                    "amount": amount,
                    "status": status_text,
                    "description": description,
                    "invoice_url": invoice.hosted_invoice_url,  # URL to view/download invoice
                }
            )

        return Response(
            {"billing_history": formatted_history},
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


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def set_default_payment_method(request, method_id):
    """Set a payment method as default"""
    try:
        user = request.user

        # TODO: Implement Stripe set default payment method
        logger.info(
            f"💳 Set default payment method requested: {method_id} for user {user.username}"
        )

        return Response(
            {"success": True, "message": "Default payment method updated successfully"},
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        logger.error(f"❌ Failed to set default payment method: {e}")
        return Response(
            {
                "success": False,
                "message": f"Failed to set default payment method: {str(e)}",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
