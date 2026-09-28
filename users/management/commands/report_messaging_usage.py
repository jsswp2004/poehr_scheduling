from django.core.management.base import BaseCommand
from django.utils import timezone

from users.messaging_stripe import report_monthly_messaging_usage
from users.models import Organization


class Command(BaseCommand):
    help = (
        "Compute each organization's email/SMS overage for a given month "
        "(defaults to the current month) and report it to Stripe as meter "
        "events, so it lands on that org's next invoice. Reporting is "
        "idempotent per organization/channel/month -- safe to re-run. Use "
        "--dry-run to see what WOULD be reported without calling Stripe."
    )

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=None)
        parser.add_argument("--month", type=int, default=None)
        parser.add_argument(
            "--organization-id", type=int, help="Only report for a single organization."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Compute and print what would be reported, without calling Stripe.",
        )

    def handle(self, *args, **options):
        year = options.get("year")
        month = options.get("month")
        org_id = options.get("organization_id")
        dry_run = options.get("dry_run")

        if org_id:
            organizations = Organization.objects.filter(id=org_id)
        else:
            organizations = Organization.objects.exclude(
                stripe_subscription_id__isnull=True
            ).exclude(stripe_subscription_id="")

        if not organizations:
            self.stdout.write(self.style.WARNING("No organizations with a Stripe subscription found."))
            return

        label = f"{year or timezone.now().year}-{(month or timezone.now().month):02d}"
        self.stdout.write(f"Reporting messaging usage for {label}{' (DRY RUN)' if dry_run else ''}...\n")

        for organization in organizations:
            result = report_monthly_messaging_usage(
                organization, year=year, month=month, dry_run=dry_run
            )

            if not result.get("reported") and result.get("reason"):
                self.stdout.write(
                    self.style.WARNING(
                        f"{organization.name} (id={organization.id}): skipped -- {result['reason']}"
                    )
                )
                continue

            email_units = result["results"]["email"]["reported_units"]
            sms_units = result["results"]["sms"]["reported_units"]
            total_cost = result["total_cost"]

            if email_units == 0 and sms_units == 0:
                self.stdout.write(
                    f"{organization.name} (id={organization.id}): no overage this period"
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{organization.name} (id={organization.id}): "
                        f"email overage={email_units}, sms overage={sms_units}, "
                        f"total=${total_cost:.2f}"
                    )
                )
