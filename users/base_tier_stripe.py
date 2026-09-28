"""
One-time (idempotent) setup for the app's real, fixed-price subscription
tiers (Basic/Professional and Premium/Clinic) in Stripe.

Before this, settings.py fell back to placeholder strings
("price_test_basic", "price_test_premium", ...) whenever the real
STRIPE_BASIC_PRICE_ID / STRIPE_PREMIUM_PRICE_ID env vars weren't set --
meaning no one could actually complete a Stripe checkout for these plans.
This module creates real Stripe Products + recurring Prices matching
users/stripe_config.py's SUBSCRIPTION_TIERS, so those env vars can point
at something real.

Enterprise ("Group Plan") is intentionally skipped -- it's a
contact-sales/custom-quote tier with no fixed price
(SUBSCRIPTION_TIERS['enterprise']['price'] is None), and
stripe_service.py already handles a missing price_id for that tier
gracefully.
"""
import logging

import stripe

logger = logging.getLogger(__name__)

# Mirrors users/stripe_config.py SUBSCRIPTION_TIERS, minus enterprise.
BASE_TIERS = {
    "basic": {"display_name": "Professional Plan", "price_dollars": 49.99},
    "premium": {"display_name": "Clinic Plan", "price_dollars": 299.99},
}


def _find_existing_product(tier_key):
    for product in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        if (product.metadata or {}).get("poehr_tier") == tier_key:
            return product
    return None


def _find_existing_price(product_id):
    for price in stripe.Price.list(
        limit=100, active=True, product=product_id
    ).auto_paging_iter():
        recurring = price.get("recurring") or {}
        if recurring.get("interval") == "month":
            return price
    return None


def _ensure_tier_product_and_price(tier_key, display_name, price_dollars):
    product = _find_existing_product(tier_key)
    if product is None:
        product = stripe.Product.create(
            name=f"POEHR Scheduling - {display_name}",
            metadata={"poehr_tier": tier_key},
        )

    price = _find_existing_price(product.id)
    if price is None:
        price = stripe.Price.create(
            currency="usd",
            unit_amount=int(round(price_dollars * 100)),
            recurring={"interval": "month"},
            product=product.id,
            metadata={"poehr_tier": tier_key},
        )
    return product, price


def create_base_tier_prices():
    """
    Ensure the Basic and Premium tiers each have a real Stripe Product +
    monthly recurring Price. Safe to re-run -- finds existing
    product/price by metadata before creating new ones.

    Returns a dict of {tier: {"product_id": ..., "price_id": ...}}.
    """
    results = {}
    for tier_key, tier_info in BASE_TIERS.items():
        product, price = _ensure_tier_product_and_price(
            tier_key, tier_info["display_name"], tier_info["price_dollars"]
        )
        results[tier_key] = {"product_id": product.id, "price_id": price.id}
    return results
