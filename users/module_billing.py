"""Stripe side of module pricing: a base price item plus one item whose quantity is the number of paid extra modules."""
import logging

import stripe
from django.conf import settings

from .modules import extra_module_count, enabled_codes

logger = logging.getLogger(__name__)


def base_price_id():
    return getattr(settings, "STRIPE_BASE_PRICE_ID", "") or ""


def module_price_id():
    return getattr(settings, "STRIPE_MODULE_PRICE_ID", "") or ""


def module_pricing_configured():
    return bool(base_price_id() and module_price_id())


def subscription_items(codes):
    """Items for a new subscription: the base price, plus the extra-module price when there are extras."""
    items = [{"price": base_price_id(), "quantity": 1}]
    extra = extra_module_count(codes)
    if extra > 0:
        items.append({"price": module_price_id(), "quantity": extra})
    return items


def _price_of(item):
    price = item.get("price") if hasattr(item, "get") else None
    return (price or {}).get("id") if hasattr(price, "get") else price


def sync_module_billing(organization):
    """
    Make the Stripe subscription match the organization's modules, effective from the next bill (no
    proration). Returns (synced, note). Never raises: a billing problem must not undo a saved change,
    so the caller shows the note and the change stays recorded.
    """
    if not module_pricing_configured():
        return False, "Billing was not changed: module prices are not set up in Stripe yet."
    if not organization.stripe_subscription_id:
        return False, "Billing was not changed: this organization has no Stripe subscription."
    try:
        subscription = stripe.Subscription.retrieve(organization.stripe_subscription_id)
        items = subscription["items"]["data"]
        if not any(_price_of(i) == base_price_id() for i in items):
            return False, "Billing was not changed: this organization is still on the old plan pricing."
        extra = extra_module_count(enabled_codes(organization))
        module_item = next((i for i in items if _price_of(i) == module_price_id()), None)
        if module_item is not None and extra > 0:
            stripe.SubscriptionItem.modify(module_item["id"], quantity=extra, proration_behavior="none")
        elif module_item is not None:
            stripe.SubscriptionItem.delete(module_item["id"], proration_behavior="none")
        elif extra > 0:
            stripe.SubscriptionItem.create(
                subscription=organization.stripe_subscription_id,
                price=module_price_id(),
                quantity=extra,
                proration_behavior="none",
            )
        return True, "Billing updated from the next bill."
    except Exception as exc:  # stripe errors, network, odd payloads
        logger.error("Module billing sync failed for organization %s: %s", organization.id, exc)
        return False, "Billing could not be updated. The change is saved; please check Stripe."
