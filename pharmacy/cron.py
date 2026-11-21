"""django_cron job for setups that run `python manage.py runcrons` (Render uses the daily scheduled-jobs endpoint instead)."""

from django_cron import CronJobBase, Schedule


class PurgePortalAccessLogCronJob(CronJobBase):
    """Monthly: remove POWER Pharmacy Portal access-log entries older than 5 years (RA 10173 retention)."""

    RUN_EVERY_MINS = 60 * 24 * 30
    schedule = Schedule(run_every_mins=RUN_EVERY_MINS)
    code = "pharmacy.purge_portal_access_log"

    def do(self):
        from .portal import purge_access_log

        return f"deleted {purge_access_log()} entries"
