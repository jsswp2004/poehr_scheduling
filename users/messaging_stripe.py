"""
Stripe integration for metered email/SMS overage billing.

This module is the bridge between the pure-calculator logic in
users/messaging_billing.py and Stripe's Billing Meters API. Nothing in
here runs on its own -- every function is called explicitly, either from
a management command you run yourself, or (later, once you're ready) from
a scheduled task. Nothing here fires automatically on a request/response
cycle or a model save.

Setup order (each is its own explicit step -- see the management commands
in users/management/commands/):
  1. `setup_messaging_meters` -- one-time, creates two Stripe Meters and
     two metered Prices ("Email overage", "SMS overage") in your Stripe
     account (test mode first!). Prints the resulting IDs so you can set
     them as env vars.
  2. `attach_messaging_billing` -- run per organization (or --all) once
     the price IDs are configured, to add those two metered prices as
     extra subscription items on that organization's existing Stripe
     subscription. A subscription only needs this done once.
  3. `report_messaging_usage` -- run monthly (by hand at first, later on
     a schedule) to compute each organization's overage for a given month
     and report it to Stripe as meter events, so it shows up on their
     next invoice.
"""

import logging

import stripe
from django.conf import settings

from .messaging_billing import compute_messaging_usage
from .models import Organization

logger = logging.getLogger(__name__)

# Event names used for Stripe's Billing Meters. These are fixed identifiers
# baked into the Meter objects once created -- don't change them after
# setup_messaging_meters has been run, or Stripe will no longer recognize
# reported usage as belonging to the existing meter.
EMAIL_METER_EVENT_NAME = "email_overage_used"
SMS_METER_EVENT_NAME = "sms_overage_used"


def _get_price_id(setting_name):
    price_id = getattr(settings, setting_name, "")
    if not price_id:
        raise RuntimeError(
            f"{setting_name} is not configured. Run the setup_messaging_meters "
            "management command first, then set the printed price ID as an "
            "env var."
        )
    return price_id


def get_email_overage_price_id():
    return _get_price_id("STRIPE_EMAIL_OVERAGE_PRICE_ID")


def get_sms_overage_price_id():
    return _get_price_id("STRIPE_SMS_OVERAGE_PRICE_ID")


def create_messaging_meters_and_prices():
    """
    One-time setup: create the two Stripe Billing Meters and their
    corresponding metered Prices for email/SMS overage.

    Safe to call more than once -- it first checks whether a meter with
    the expected event_name already exists (by listing meters and
    matching on event_name) and reuses it instead of creating a
    duplicate. Returns a dict with the created/found IDs.
    """
    from .messaging_billing import MESSAGING_OVERAGE_RATES

    def _find_existing_meter(event_name):
        for meter in stripe.billing.Meter.list(limit=100).auto_paging_iter():
            if meter.event_name == event_name and meter.status == "active":
                return meter
        return None

    def _find_existing_price(meter_id):
        # Prices aren't searchable by meter directly, so list recent
        # metered prices and match on the nested recurring.meter field.
        for price in stripe.Price.list(limit=100, active=True).auto_paging_iter():
            recurring = price.get("recurring") or {}
            if recurring.get("meter") == meter_id:
                return price
        return None

    def _ensure_meter_and_price(display_name, event_name, rate_dollars):
        meter = _find_existing_meter(event_name)
        if meter is None:
            meter = stripe.billing.Meter.create(
                display_name=display_name,
                event_name=event_name,
                default_aggregation={"formula": "sum"},
                customer_mapping={
                    "event_payload_key": "stripe_customer_id",
                    "type": "by_id",
                },
                value_settings={"event_payload_key": "value"},
            )
            logger.info(f"Created Stripe Meter '{display_name}' ({meter.id})")
        else:
            logger.info(f"Reusing existing Stripe Meter '{display_name}' ({meter.id})")

        price = _find_existing_price(meter.id)
        if price is None:
            price = stripe.Price.create(
                currency="usd",
                unit_amount_decimal=str(int(round(rate_dollars * 100))),
                recurring={"usage_type": "metered", "meter": meter.id, "interval": "month"},
                billing_scheme="per_unit",
                product_data={"name": display_name},
            )
            logger.info(f"Created Stripe Price for '{display_name}' ({price.id})")
        else:
            logger.info(f"Reusing existing Stripe Price for '{display_name}' ({price.id})")

        return meter, price

    email_meter, email_price = _ensure_meter_and_price(
        "Email overage", EMAIL_METER_EVENT_NAME, MESSAGING_OVERAGE_RATES["email"]
    )
    sms_meter, sms_price = _ensure_meter_and_price(
        "SMS overage", SMS_METER_EVENT_NAME, MESSAGING_OVERAGE_RATES["sms"]
    )

    return {
        "email_meter_id": email_meter.id,
        "email_price_id": email_price.id,
        "sms_meter_id": sms_meter.id,
        "sms_price_id": sms_price.id,
    }


def get_organization_stripe_customer_id(organization):
    """
    Resolve the Stripe customer ID that an organization's subscription is
    billed under. Subscriptions are created against an admin user's
    Stripe customer (see StripeService.create_organization_trial_subscription),
    so this finds an admin/system_admin user in the org who has one.
    """
    admin_user = organization.users.filter(
        role__in=["admin", "system_admin"], stripe_customer_id__isnull=False
    ).exclude(stripe_customer_id="").first()
    return admin_user.stripe_customer_id if admin_user else None


def attach_messaging_billing_items(organization):
    """
    Add the email/SMS overage metered prices as extra subscription items
    on an organization's existing Stripe subscription, if they aren't
    already attached. Returns a dict describing what was done.

    This does NOT change what the organization is charged today --
    metered subscription items with no reported usage bill $0. It just
    makes the subscription able to receive usage-based charges once
    report_messaging_usage starts reporting them.
    """
    if not organization.stripe_subscription_id:
        return {
            "organization_id": organization.id,
            "skipped": True,
            "reason": "Organization has no Stripe subscription yet.",
        }

    subscription = stripe.Subscription.retrieve(organization.stripe_subscription_id)
    existing_price_ids = {
        item["price"]["id"] for item in subscription["items"]["data"]
    }

    email_price_id = get_email_overage_price_id()
    sms_price_id = get_sms_overage_price_id()

    added = []
    for price_id, label in (
        (email_price_id, "email"),
        (sms_price_id, "sms"),
    ):
        if price_id in existing_price_ids:
            continue
        stripe.SubscriptionItem.create(
            subscription=organization.stripe_subscription_id,
            price=price_id,
        )
        added.append(label)

    return {
        "organization_id": organization.id,
        "organization_name": organization.name,
        "skipped": False,
        "added": added,
    }


def report_monthly_messaging_usage(organization, year=None, month=None, dry_run=False):
    """
    Compute an organization's overage for one month (via
    messaging_billing.compute_messaging_usage) and report it to Stripe as
    meter events, so it lands on that org's next invoice.

    Reporting is idempotent: each meter event is given a deterministic
    `identifier` derived from the organization/channel/year/month, so
    re-running this for a month already reported does not double-bill --
    Stripe rejects a meter event whose identifier it has already seen.
    """
    usage = compute_messaging_usage(organization, year=year, month=month)
    period = usage["period"]

    customer_id = get_organization_stripe_customer_id(organization)
    if not customer_id:
        return {
            **usage,
            "reported": False,
            "reason": "No Stripe customer found for this organization.",
        }

    results = {}
    for channel, event_name in (
        ("email", EMAIL_METER_EVENT_NAME),
        ("sms", SMS_METER_EVENT_NAME),
    ):
        billable = usage[channel]["billable"]
        if billable <= 0:
            results[channel] = {"reported_units": 0, "skipped": True}
            continue

        identifier = (
            f"org{organization.id}-{channel}-{period['year']}-{period['month']:02d}"
        )

        if dry_run:
            results[channel] = {
                "reported_units": billable,
                "skipped": False,
                "dry_run": True,
                "identifier": identifier,
            }
            continue

        stripe.billing.MeterEvent.create(
            event_name=event_name,
            identifier=identifier,
            payload={
                "value": str(billable),
                "stripe_customer_id": customer_id,
            },
        )
        results[channel] = {
            "reported_units": billable,
            "skipped": False,
            "identifier": identifier,
        }

    return {**usage, "reported": not dry_run, "dry_run": dry_run, "results": results}
