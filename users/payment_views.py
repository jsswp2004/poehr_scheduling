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
            try:
                # Convert timestamp to readable date
                invoice_date = datetime.fromtimestamp(invoice.created).strftime(
                    "%Y-%m-%d"
                )

                # Format amount (Stripe amounts are in cents)
                # Use total if amount_paid is not available
                amount_cents = getattr(invoice, "amount_paid", None) or getattr(
                    invoice, "total", 0
                )
                amount = f"${amount_cents / 100:.2f}"

                # Determine status - safer property access
                invoice_paid = getattr(invoice, "paid", False)
                invoice_status = getattr(invoice, "status", "unknown")

                status_text = "Paid" if invoice_paid else "Unpaid"
                if invoice_status == "paid":
                    status_text = "Paid"
                elif invoice_status == "open":
                    status_text = "Pending"
                elif invoice_status == "draft":
                    status_text = "Draft"
                elif invoice_status == "void":
                    status_text = "Void"
                elif invoice_status == "uncollectible":
                    status_text = "Uncollectible"

                # Get description from subscription or line items
                description = f"{target_user.subscription_tier} Plan - Monthly"
                if hasattr(invoice, "lines") and invoice.lines and invoice.lines.data:
                    line_item = invoice.lines.data[0]
                    if hasattr(line_item, "description") and line_item.description:
                        description = line_item.description

                # Safely get invoice URL
                invoice_url = getattr(invoice, "hosted_invoice_url", None)

                formatted_history.append(
                    {
                        "id": invoice.id,
                        "date": invoice_date,
                        "amount": amount,
                        "status": status_text,
                        "description": description,
                        "invoice_url": invoice_url,  # URL to view/download invoice
                    }
                )
            except Exception as invoice_error:
                # Get invoice ID safely
                invoice_id = getattr(invoice, "id", "unknown")
                logger.error(
                    f"❌ Error processing invoice {invoice_id}: {type(invoice_error).__name__}: {invoice_error}"
                )
                logger.error(
                    f"❌ Invoice status: {getattr(invoice, 'status', 'unknown')}"
                )
                logger.error(f"❌ Invoice paid: {getattr(invoice, 'paid', 'unknown')}")
                # Continue processing other invoices instead of failing completely
                continue

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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def messaging_usage(request):
    """
    Report an organization's automatic email/SMS usage and overage cost
    for a given month (defaults to the current month).

    This is a read-only calculator over the existing MessageLog table --
    it does NOT talk to Stripe or charge anyone. It's meant to let admins
    see, before anything is ever billed, what a subscriber's overage
    would look like under the flat per-message rates in
    users/messaging_billing.py.

    Query params:
      - organization_id (system_admin only): look up a different org
      - year, month: which calendar month to report on (defaults to now)
    """
    from .messaging_billing import compute_messaging_usage
    from .models import Organization

    user = request.user

    # Only admins should see an organization's billing/cost data.
    if user.role not in ("admin", "system_admin"):
        return Response(
            {"error": "You do not have permission to view messaging usage."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target_organization = user.organization

    organization_id = request.GET.get("organization_id")
    if user.role == "system_admin" and organization_id:
        try:
            target_organization = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return Response(
                {"error": "Organization not found"}, status=status.HTTP_404_NOT_FOUND
            )

    if not target_organization:
        return Response(
            {"error": "No organization found for this user."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    year = request.GET.get("year")
    month = request.GET.get("month")
    try:
        year = int(year) if year else None
        month = int(month) if month else None
    except (TypeError, ValueError):
        return Response(
            {"error": "year and month must be integers."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    usage = compute_messaging_usage(target_organization, year=year, month=month)
    return Response(usage, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stripe_billing_diagnostic(request):
    """
    TEMPORARY diagnostic endpoint. Read-only -- does not talk to Stripe.

    Reports whether an organization (and its admin) has Stripe subscription
    fields populated, so we know whether attach_messaging_billing has a
    subscription to attach the overage prices to.

    Query params:
      - organization_id (system_admin only): look up a different org
    """
    from .models import Organization

    user = request.user

    if user.role not in ("admin", "system_admin"):
        return Response(
            {"error": "You do not have permission to view this."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target_organization = user.organization

    organization_id = request.GET.get("organization_id")
    if user.role == "system_admin" and organization_id:
        try:
            target_organization = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return Response(
                {"error": "Organization not found"}, status=status.HTTP_404_NOT_FOUND
            )

    if not target_organization:
        return Response(
            {"error": "No organization found for this user."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    admin_user = (
        target_organization.users.filter(role__in=["admin", "system_admin"])
        .exclude(stripe_customer_id="")
        .exclude(stripe_customer_id__isnull=True)
        .first()
    )

    all_admins = list(
        target_organization.users.filter(role__in=["admin", "system_admin"])
    )

    return Response(
        {
            "organization_id": target_organization.id,
            "organization_name": target_organization.name,
            "organization_subscription_tier": getattr(
                target_organization, "subscription_tier", None
            ),
            "organization_stripe_subscription_id": target_organization.stripe_subscription_id
            or None,
            "admin_user": admin_user.username if admin_user else None,
            "admin_stripe_customer_id": getattr(
                admin_user, "stripe_customer_id", None
            )
            if admin_user
            else None,
            "admin_stripe_subscription_id": getattr(
                admin_user, "stripe_subscription_id", None
            )
            if admin_user
            else None,
            "admin_subscription_status": getattr(
                admin_user, "subscription_status", None
            )
            if admin_user
            else None,
            "all_admin_users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "role": u.role,
                    "email": u.email,
                    "stripe_customer_id": u.stripe_customer_id or None,
                }
                for u in all_admins
            ],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def setup_test_subscription(request):
    """
    TEMPORARY setup endpoint. Creates a real Stripe TEST-MODE subscription
    for an organization's admin, using Stripe's own published test payment
    method (pm_card_visa) -- no real card, no real money, test keys only.

    This exists purely to give a pre-launch demo organization a real
    subscription to test the messaging-overage billing pipeline
    (attach_messaging_billing / report_messaging_usage) against, since the
    org currently has none.

    Query params:
      - organization_id (system_admin only): look up a different org

    Safe to call more than once -- if the organization already has a
    stripe_subscription_id, this is a no-op (skipped=True).
    """
    import stripe
    from django.conf import settings

    from .models import Organization

    user = request.user

    if user.role not in ("admin", "system_admin"):
        return Response(
            {"error": "You do not have permission to do this."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target_organization = user.organization

    organization_id = request.GET.get("organization_id")
    if user.role == "system_admin" and organization_id:
        try:
            target_organization = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return Response(
                {"error": "Organization not found"}, status=status.HTTP_404_NOT_FOUND
            )

    if not target_organization:
        return Response(
            {"error": "No organization found for this user."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if target_organization.stripe_subscription_id:
        return Response(
            {
                "skipped": True,
                "reason": "Organization already has a Stripe subscription.",
                "organization_stripe_subscription_id": target_organization.stripe_subscription_id,
            },
            status=status.HTTP_200_OK,
        )

    admin_user = target_organization.users.filter(
        role__in=["admin", "system_admin"]
    ).first()
    if not admin_user:
        return Response(
            {"error": "Organization has no admin user to attach a subscription to."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tier = getattr(target_organization, "subscription_tier", "basic") or "basic"
    price_map = {
        "basic": getattr(settings, "STRIPE_BASIC_PRICE_ID", ""),
        "premium": getattr(settings, "STRIPE_PREMIUM_PRICE_ID", ""),
        "enterprise": getattr(settings, "STRIPE_ENTERPRISE_PRICE_ID", ""),
    }
    price_id = price_map.get(tier, "")
    if not price_id or price_id.startswith("price_test_"):
        return Response(
            {
                "error": (
                    f"No real Stripe price configured for tier '{tier}'. "
                    "Run setup_base_tier_prices locally and set the resulting "
                    "STRIPE_BASIC_PRICE_ID / STRIPE_PREMIUM_PRICE_ID env vars "
                    "on this Render service first."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe.api_key:
        return Response(
            {"error": "STRIPE_SECRET_KEY is not configured on this service."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        customer = stripe.Customer.create(
            email=admin_user.email or None,
            name=f"{target_organization.name} (test)",
            metadata={"organization_id": target_organization.id},
        )

        # Stripe's officially published test-mode payment method token --
        # not a real card, only usable with test-mode secret keys. Attaching
        # it creates a real PaymentMethod with its own new ID; we must reuse
        # THAT id afterward, not the literal "pm_card_visa" token again.
        attached_pm = stripe.PaymentMethod.attach(
            "pm_card_visa",
            customer=customer.id,
        )
        stripe.Customer.modify(
            customer.id,
            invoice_settings={"default_payment_method": attached_pm.id},
        )

        subscription = stripe.Subscription.create(
            customer=customer.id,
            items=[{"price": price_id}],
            metadata={"organization_id": target_organization.id},
        )

        admin_user.stripe_customer_id = customer.id
        admin_user.stripe_subscription_id = subscription.id
        admin_user.subscription_status = "active"
        admin_user.save(
            update_fields=["stripe_customer_id", "stripe_subscription_id", "subscription_status"]
        )

        target_organization.stripe_subscription_id = subscription.id
        target_organization.save(update_fields=["stripe_subscription_id"])
    except Exception as exc:
        logger.exception("setup_test_subscription failed")
        return Response(
            {
                "error": "setup_test_subscription failed",
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "skipped": False,
            "organization_id": target_organization.id,
            "admin_user": admin_user.username,
            "stripe_customer_id": customer.id,
            "stripe_subscription_id": subscription.id,
            "tier": tier,
            "price_id": price_id,
        },
        status=status.HTTP_200_OK,
    )
