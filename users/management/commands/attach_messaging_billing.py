from django.core.management.base import BaseCommand, CommandError

from users.messaging_stripe import attach_messaging_billing_items
from users.models import Organization


class Command(BaseCommand):
    help = (
        "Attach the email/SMS overage metered prices as extra subscription "
        "items on an organization's existing Stripe subscription. Run this "
        "once per organization (or --all) after setup_messaging_meters has "
        "been run and the resulting price IDs are set as env vars. Adding "
        "these items does not change today's bill -- they only start "
        "accruing charges once report_messaging_usage reports usage."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--organization-id", type=int, help="Attach for a single organization."
        )
        parser.add_argument(
            "--all", action="store_true", help="Attach for every organization with a Stripe subscription."
        )

    def handle(self, *args, **options):
        org_id = options.get("organization_id")
        do_all = options.get("all")

        if not org_id and not do_all:
            raise CommandError("Pass --organization-id <id> or --all.")

        if org_id:
            try:
                organizations = [Organization.objects.get(id=org_id)]
            except Organization.DoesNotExist:
                raise CommandError(f"Organization {org_id} not found.")
        else:
            organizations = Organization.objects.exclude(
                stripe_subscription_id__isnull=True
            ).exclude(stripe_subscription_id="")

        if not organizations:
            self.stdout.write(self.style.WARNING("No organizations with a Stripe subscription found."))
            return

        for organization in organizations:
            result = attach_messaging_billing_items(organization)
            if result.get("skipped"):
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipped {organization.name} (id={organization.id}): {result['reason']}"
                    )
                )
            elif result["added"]:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{organization.name} (id={organization.id}): added {', '.join(result['added'])} overage item(s)"
                    )
                )
            else:
                self.stdout.write(
                    f"{organization.name} (id={organization.id}): already had both overage items attached"
                )
