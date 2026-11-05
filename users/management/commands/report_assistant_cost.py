import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from users.assistant_billing import ASSISTANT_ALLOWANCES, ASSISTANT_OVERAGE_RATE


class Command(BaseCommand):
    help = (
        "Shows what the AI assistants really cost per question, from the token counts they already log, so the "
        "overage rate and free amounts can be set from facts. Read-only. The assistants keep their logs for 30 "
        "days, so this covers at most the last 30 days. Pass the model's current prices in dollars per million "
        "tokens (from Anthropic's price list); this command never guesses them."
    )

    def add_arguments(self, parser):
        parser.add_argument("--input-price", type=float, required=True, help="Dollars per million INPUT tokens.")
        parser.add_argument("--output-price", type=float, required=True, help="Dollars per million OUTPUT tokens.")
        parser.add_argument("--days", type=int, default=30, help="Look back this many days (default 30).")
        parser.add_argument("--margin", type=float, default=2.0, help="Suggested rate = average cost x this (default 2).")
        parser.add_argument("--organization-id", type=int, help="Only one organization.")

    def handle(self, *args, **opts):
        from appointments.models import SchedulerAssistantMessage
        from communicator.models import CommunicatorAssistantMessage
        from staffing.models import AssistantMessage as StaffingMessage

        if opts["input_price"] < 0 or opts["output_price"] < 0:
            raise CommandError("Prices cannot be negative.")
        since = timezone.now() - datetime.timedelta(days=opts["days"])
        sources = (
            ("staffing", StaffingMessage),
            ("communicator", CommunicatorAssistantMessage),
            ("scheduler", SchedulerAssistantMessage),
        )

        total_q = total_cost = 0
        per_org = {}
        models = {}
        self.stdout.write(f"AI assistant cost, last {opts['days']} days (answered questions only)\n")
        self.stdout.write(f"{'assistant':<14}{'questions':>10}{'avg in':>10}{'avg out':>10}{'avg $/q':>11}{'max $/q':>11}")
        for name, model in sources:
            qs = model.objects.filter(created_at__gte=since, error="")
            if opts.get("organization_id"):
                qs = qs.filter(organization_id=opts["organization_id"])
            for m in qs.values_list("model", flat=True):
                models[m or "(not recorded)"] = models.get(m or "(not recorded)", 0) + 1
            rows = list(qs.values_list("organization_id", "input_tokens", "output_tokens"))
            if not rows:
                self.stdout.write(f"{name:<14}{0:>10}")
                continue
            costs = [(i * opts["input_price"] + o * opts["output_price"]) / 1_000_000 for _, i, o in rows]
            n = len(rows)
            for (org_id, _, _), c in zip(rows, costs):
                per_org.setdefault(org_id, [0, 0.0])
                per_org[org_id][0] += 1
                per_org[org_id][1] += c
            total_q += n
            total_cost += sum(costs)
            self.stdout.write(
                f"{name:<14}{n:>10}{sum(r[1] for r in rows) / n:>10.0f}{sum(r[2] for r in rows) / n:>10.0f}"
                f"{sum(costs) / n:>11.4f}{max(costs):>11.4f}"
            )

        if not total_q:
            self.stdout.write(self.style.WARNING("\nNo answered questions in this period, so there is nothing to price from yet."))
            return

        seen = ", ".join(f"{m} ({n})" for m, n in sorted(models.items(), key=lambda kv: -kv[1]))
        self.stdout.write(f"\nModels used in these questions: {seen}")
        if len(models) > 1:
            self.stdout.write(self.style.WARNING(
                "More than one model appears, so one price pair does not fit every question. Rerun after the "
                "switch settles, or read the figures as a blend."))

        avg = total_cost / total_q
        self.stdout.write(f"\nAll assistants: {total_q} questions, ${total_cost:.2f} total, ${avg:.4f} average per question.")
        self.stdout.write(
            f"Suggested overage rate at {opts['margin']:g}x cost: ${avg * opts['margin']:.2f} per question "
            f"(currently ${ASSISTANT_OVERAGE_RATE:.2f})."
        )
        self.stdout.write("\nFree amount at today's average cost (what POWER absorbs if every organization uses it all):")
        for tier, free in ASSISTANT_ALLOWANCES.items():
            self.stdout.write(f"  {tier:<11}{free:>6} questions = ${free * avg:.2f} per month")

        self.stdout.write("\nHeaviest organizations (questions, cost):")
        for org_id, (n, c) in sorted(per_org.items(), key=lambda kv: -kv[1][1])[:10]:
            self.stdout.write(f"  org {org_id}: {n} questions, ${c:.2f}")
        self.stdout.write(
            "\nNote: this is the cost of the model calls only. Averages come from real traffic in the period, so a "
            "few questions give a rough figure."
        )
