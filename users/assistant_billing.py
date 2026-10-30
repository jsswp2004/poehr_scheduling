"""
AI assistant usage and overage for billing.

Every plan includes a free monthly number of questions to the Scheduler, Staffing and Communicator assistants.
Questions past that are billed at a flat rate on the next invoice, the same way texts and emails are
(users/messaging_billing.py). Only answered questions count; a question that failed is never counted.

The assistants delete their own logs after 30 days, so questions are counted as they happen in AssistantUsage.
"""
from datetime import datetime

from django.db.models import F, Sum
from django.utils import timezone

from .models import AssistantUsage

# Dollars per question past the free amount. A proposal: set it from the real cost per question.
ASSISTANT_OVERAGE_RATE = 0.05

# Free questions each month, per plan key (see users/modules.py). None means unlimited.
ASSISTANT_ALLOWANCES = {"basic": 100, "premium": 500, "enterprise": 2000}

ASSISTANTS = ("staffing", "communicator", "scheduler")


def get_allowance_for_tier(tier):
    return ASSISTANT_ALLOWANCES.get(tier, ASSISTANT_ALLOWANCES["basic"])


def assistant_terms():
    """The rate and the free monthly amounts, as the pricing page shows them."""
    return {"rate": ASSISTANT_OVERAGE_RATE, "allowances": dict(ASSISTANT_ALLOWANCES)}


def record_question(organization, assistant, when=None):
    """Count one answered question. Never raises: counting must not break an answer."""
    if organization is None or assistant not in ASSISTANTS:
        return
    when = when or timezone.now()
    try:
        row, _ = AssistantUsage.objects.get_or_create(
            organization=organization, year=when.year, month=when.month, assistant=assistant
        )
        AssistantUsage.objects.filter(pk=row.pk).update(questions=F("questions") + 1)
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception("could not count assistant question")


def compute_assistant_usage(organization, year=None, month=None):
    now = timezone.now()
    year = year or now.year
    month = month or now.month
    tier = getattr(organization, "subscription_tier", "basic") or "basic"
    included = get_allowance_for_tier(tier)

    rows = AssistantUsage.objects.filter(organization=organization, year=year, month=month)
    by_assistant = {a: 0 for a in ASSISTANTS}
    for r in rows:
        by_assistant[r.assistant] = r.questions
    asked = sum(by_assistant.values())
    billable = 0 if included is None else max(0, asked - included)
    cost = round(billable * ASSISTANT_OVERAGE_RATE, 2)
    return {
        "organization_id": organization.id,
        "organization_name": organization.name,
        "subscription_tier": tier,
        "period": {"year": year, "month": month},
        "questions": asked,
        "by_assistant": by_assistant,
        "included": included,
        "billable": billable,
        "rate": ASSISTANT_OVERAGE_RATE,
        "cost": cost,
    }
