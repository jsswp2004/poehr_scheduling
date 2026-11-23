"""django_cron jobs for setups that run `python manage.py runcrons` (Render uses the daily scheduled-jobs endpoint)."""

from django_cron import CronJobBase, Schedule


class LabRequestRemindersCronJob(CronJobBase):
    """Daily: remind patients who have not gone to the lab (day 3 and 7); expire requests not collected in 30 days."""

    RUN_EVERY_MINS = 60 * 24
    schedule = Schedule(run_every_mins=RUN_EVERY_MINS)
    code = "lab_portal.reminders_and_expiry"

    def do(self):
        from .services import remind_and_expire

        return str(remind_and_expire())


class PurgeLabPortalAccessLogCronJob(CronJobBase):
    """Monthly: remove lab portal access-log entries older than 5 years."""

    RUN_EVERY_MINS = 60 * 24 * 30
    schedule = Schedule(run_every_mins=RUN_EVERY_MINS)
    code = "lab_portal.purge_access_log"

    def do(self):
        from .services import purge_access_log

        return f"deleted {purge_access_log()} entries"
