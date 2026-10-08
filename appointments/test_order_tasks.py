"""Task Manager: schedules on orders, due-time layout, the nurse worklist and its actions."""

from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from . import order_tasks as ot
from . import orders_workflow as ow
from .models import Appointment, Order, Orderable, OrderTask, OrderTaskEvent, TaskSettings

User = get_user_model()


def mk(username, role, org):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org)


def at(hour, minute=0, days=0):
    tz = timezone.get_current_timezone()
    base = timezone.localtime(timezone.now(), tz).date() + timedelta(days=days)
    return timezone.make_aware(datetime(base.year, base.month, base.day, hour, minute), tz)


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        self.doctor = mk("doc", "doctor", self.org)
        self.nurse = mk("nurse", "nurse", self.org)
        self.registrar = mk("reg", "registrar", self.org)
        self.admin = mk("adm", "admin", self.org)
        self.patient = mk("pat", "patient", self.org)
        self.appt = Appointment.all_objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        self.amox = Orderable.objects.create(code="amox", name="Amoxicillin 500 mg capsule", category="medication")
        self.weight = Orderable.objects.create(code="wt", name="Daily Weight", category="nursing")
        self.cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")

    def med(self, schedule=None, user=None, orderable=None, sign=True, **extra):
        sched = {"frequency": "bid", "dose": "500 mg", "route": "PO", **(schedule or {})}
        o = ow.create_draft_order(user or self.doctor, self.appt, orderable or self.amox, schedule=sched)
        return ow.sign_order(o, user or self.doctor) if sign else o

    def api(self, user=None):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user or self.nurse).access_token}")
        return c

    def active(self, schedule, base=None, **kw):
        """An active order whose first dose is `base` (kept explicit so the tests don't depend on the clock)."""
        sched = dict(schedule)
        if base is not None:
            sched["first_due"] = base.isoformat()
        o = self.med(sched, **kw)
        return o


class ScheduleRulesTests(Base):
    def test_orderable_task_modes(self):
        self.assertEqual(self.amox.task_mode, "required")
        self.assertEqual(self.weight.task_mode, "optional")
        self.assertEqual(self.cbc.task_mode, "none")
        self.cbc.creates_tasks = True
        self.assertEqual(self.cbc.task_mode, "optional")
        self.amox.creates_tasks = False
        self.assertEqual(self.amox.task_mode, "none")

    def test_medication_cannot_be_signed_without_schedule(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.amox)
        with self.assertRaises(ow.OrderWorkflowError) as ctx:
            ow.sign_order(o, self.doctor)
        self.assertIn("frequency", str(ctx.exception))
        o.refresh_from_db()
        self.assertEqual(o.status, "draft")

    def test_each_missing_piece_is_named(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.amox, schedule={"frequency": "daily"})
        self.assertEqual(ot.schedule_missing(o), ["the dose", "the route"])
        o = ow.create_draft_order(self.doctor, self.appt, self.amox, schedule={"frequency": "prn", "dose": "1", "route": "PO"})
        self.assertEqual(ot.schedule_missing(o), ["the reason it may be given (PRN)"])

    def test_nursing_without_frequency_is_a_standing_instruction(self):
        o = ow.sign_order(ow.create_draft_order(self.doctor, self.appt, self.weight), self.doctor)
        self.assertEqual(o.status, "active")
        self.assertEqual(OrderTask.objects.count(), 0)

    def test_nursing_with_frequency_makes_tasks(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.weight, schedule={"frequency": "daily"})
        ow.sign_order(o, self.doctor)
        self.assertGreaterEqual(OrderTask.objects.filter(order=o).count(), 1)

    def test_lab_ignores_schedule(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.cbc, schedule={"frequency": "daily"})
        self.assertEqual(o.schedule, {})

    def test_bad_values_rejected(self):
        for bad in (
            {"frequency": "hourly-ish"},
            {"frequency": "daily", "duration_days": 0},
            {"frequency": "daily", "duration_days": 5, "stop_at": "2030-01-01T10:00:00Z"},
            {"frequency": "prn", "min_interval_hours": 100},
            {"frequency": "daily", "first_due": "garbage"},
            {"frequency": "daily", "dose": "x" * 121},
        ):
            with self.assertRaises(ot.TaskError, msg=bad):
                ot.clean_schedule(bad, self.amox)

    def test_stop_must_follow_first_dose(self):
        with self.assertRaises(ot.TaskError):
            ot.clean_schedule({"frequency": "daily", "first_due": "2030-01-02T10:00:00Z", "stop_at": "2030-01-01T10:00:00Z"}, self.amox)

    def test_draft_can_be_edited_then_signed(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.amox)
        o = ow.update_draft_order(o, self.doctor, schedule={"frequency": "tid", "dose": "1 tab", "route": "PO"})
        self.assertEqual(o.schedule["frequency"], "tid")
        self.assertEqual(ow.sign_order(o, self.doctor).status, "active")

    def test_api_sign_reports_missing(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.amox)
        r = self.api(self.doctor).post(f"/api/orders/{o.pk}/sign/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("the dose", r.json()["errors"])


class LayoutTests(Base):
    def order_with(self, schedule, base):
        o = self.med(schedule, sign=False)
        Order.objects.filter(pk=o.pk).update(signed_at=base)
        o.refresh_from_db()
        return o

    def times(self, schedule, base, upto):
        o = self.order_with(schedule, base)
        return [timezone.localtime(w).strftime("%a %H:%M") for w in ot.occurrences(o, upto)]

    def test_clock_frequencies_use_pass_times(self):
        base = at(7, 30, days=1)
        out = ot.occurrences(self.order_with({"frequency": "tid"}, base), at(23, 59, days=1))
        self.assertEqual([timezone.localtime(w).strftime("%H:%M") for w in out], ["09:00", "14:00", "21:00"])

    def test_starts_from_next_time_not_the_past(self):
        base = at(10, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "bid"}, base), at(23, 59, days=1))
        self.assertEqual([timezone.localtime(w).strftime("%H:%M") for w in out], ["21:00"])

    def test_first_dose_now(self):
        base = at(10, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "bid", "first_dose_now": True}, base), at(23, 59, days=1))
        self.assertEqual([timezone.localtime(w).strftime("%H:%M") for w in out], ["10:00", "21:00"])

    def test_intervals(self):
        base = at(8, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "q6h"}, base), base + timedelta(hours=24))
        self.assertEqual(len(out), 5)
        self.assertEqual(out[1] - out[0], timedelta(hours=6))

    def test_once_and_stat_make_one(self):
        base = at(8, 0, days=1)
        for f in ("once", "stat"):
            self.assertEqual(ot.occurrences(self.order_with({"frequency": f}, base), base + timedelta(days=5)), [base])

    def test_weekly(self):
        base = at(8, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "weekly"}, base), base + timedelta(days=15))
        self.assertEqual(len(out), 3)

    def test_duration_days_stops(self):
        base = at(6, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "daily", "duration_days": 3}, base), base + timedelta(days=30))
        self.assertEqual(len(out), 3)

    def test_stop_at_stops(self):
        base = at(6, 0, days=1)
        stop = base + timedelta(days=2, hours=12)
        out = ot.occurrences(self.order_with({"frequency": "bid", "stop_at": stop.isoformat()}, base), base + timedelta(days=30))
        self.assertTrue(all(w < stop for w in out))
        self.assertEqual(len(out), 5)

    def test_prn_has_no_scheduled_times(self):
        o = self.order_with({"frequency": "prn", "prn_reason": "pain"}, at(8, 0, days=1))
        self.assertEqual(ot.occurrences(o, at(8, 0, days=9)), [])

    def test_custom_pass_times(self):
        TaskSettings.objects.create(organization=self.org, pass_times={"bid": ["08:00", "20:00"]})
        base = at(6, 0, days=1)
        out = ot.occurrences(self.order_with({"frequency": "bid"}, base), at(23, 59, days=1))
        self.assertEqual([timezone.localtime(w).strftime("%H:%M") for w in out], ["08:00", "20:00"])


class GenerationTests(Base):
    def test_sign_makes_tasks_within_look_ahead(self):
        o = self.med({"frequency": "q4h"})
        n = OrderTask.objects.filter(order=o).count()
        self.assertIn(n, (6, 7))
        self.assertTrue(OrderTaskEvent.objects.filter(task__order=o, event_type="created").exists())
        self.assertIsNotNone(Order.objects.get(pk=o.pk).tasks_generated_until)

    def test_ensure_is_idempotent_and_tops_up(self):
        o = self.med({"frequency": "q4h"})
        before = OrderTask.objects.filter(order=o).count()
        self.assertEqual(ot.ensure_tasks(self.org), 0)
        later = timezone.now() + timedelta(hours=20)
        ot.ensure_tasks(self.org, now=later)
        self.assertGreater(OrderTask.objects.filter(order=o).count(), before)
        again = OrderTask.objects.filter(order=o).count()
        ot.generate_tasks(Order.objects.get(pk=o.pk), now=later)
        self.assertEqual(OrderTask.objects.filter(order=o).count(), again)

    def test_pending_cosign_makes_none_until_cosigned(self):
        o = ow.create_draft_order(self.nurse, self.appt, self.amox, schedule={"frequency": "bid", "dose": "1", "route": "PO"})
        o = ow.sign_order(o, self.nurse)
        self.assertEqual(o.status, "pending_cosign")
        self.assertEqual(OrderTask.objects.count(), 0)
        ow.cosign_order(o, self.doctor)
        self.assertGreaterEqual(OrderTask.objects.filter(order=o).count(), 1)

    def test_discontinue_cancels_future_only(self):
        o = self.med({"frequency": "q4h"})
        now = timezone.now()
        due_now = OrderTask.objects.filter(order=o).order_by("id").first()
        OrderTask.objects.filter(pk=due_now.pk).update(due_at=now - timedelta(minutes=10))
        future = OrderTask.objects.filter(order=o, due_at__gt=now).count()
        self.assertGreater(future, 0)
        ow.discontinue_order(o, self.doctor, "Changed")
        self.assertEqual(OrderTask.objects.filter(order=o, status="cancelled").count(), future)
        self.assertEqual(OrderTaskEvent.objects.filter(task__order=o, event_type="cancelled").count(), future)
        self.assertEqual(OrderTask.objects.get(pk=due_now.pk).status, "pending")

    def test_complete_order_cancels_future(self):
        o = self.med({"frequency": "q4h"})
        ow.complete_order(o, self.doctor)
        self.assertFalse(OrderTask.objects.filter(order=o, status="pending", due_at__gt=timezone.now()).exists())

    def test_replace_carries_schedule_not_timing(self):
        o = self.med({"frequency": "bid", "duration_days": 5, "first_dose_now": True, "instructions": "with food"})
        old, new = ow.replace_order(o, self.doctor, "Dose change")
        self.assertEqual((new.schedule["frequency"], new.schedule["dose"], new.schedule["instructions"]), ("bid", "500 mg", "with food"))
        self.assertNotIn("first_dose_now", new.schedule)
        self.assertFalse(OrderTask.objects.filter(order=old, status="pending", due_at__gt=timezone.now()).exists())
        self.assertEqual(OrderTask.objects.filter(order=new).count(), 0)

    def test_mark_missed(self):
        o = self.med({"frequency": "q4h"})
        t = OrderTask.objects.filter(order=o).first()
        OrderTask.objects.filter(pk=t.pk).update(due_at=timezone.now() - timedelta(hours=13))
        self.assertEqual(ot.mark_missed(self.org), 1)
        t.refresh_from_db()
        self.assertEqual(t.status, "missed")
        self.assertEqual(ot.mark_missed(self.org), 0)

    def test_slot_is_unique(self):
        o = self.med({"frequency": "daily"})
        t = OrderTask.objects.filter(order=o).first()
        n = OrderTask.objects.count()
        OrderTask.objects.bulk_create([OrderTask(organization=self.org, order=o, patient=self.patient, title="x", due_at=t.due_at)], ignore_conflicts=True)
        self.assertEqual(OrderTask.objects.count(), n)


class ActionTests(Base):
    def setUp(self):
        super().setUp()
        self.o = self.med({"frequency": "q4h"})
        self.t = OrderTask.objects.filter(order=self.o).order_by("due_at").first()
        OrderTask.objects.filter(pk=self.t.pk).update(due_at=timezone.now() - timedelta(minutes=5))
        self.t.refresh_from_db()

    def test_complete_in_window(self):
        t = ot.apply_action(self.t, self.nurse, "complete", {"dose_given": "500 mg"})
        self.assertEqual((t.status, t.performed_by), ("done", self.nurse))
        self.assertEqual(t.detail["dose_given"], "500 mg")
        self.assertTrue(t.events.filter(event_type="done").exists())

    def test_late_complete_needs_note(self):
        OrderTask.objects.filter(pk=self.t.pk).update(due_at=timezone.now() - timedelta(hours=3))
        self.t.refresh_from_db()
        with self.assertRaises(ot.TaskError):
            ot.apply_action(self.t, self.nurse, "complete", {})
        self.assertEqual(ot.apply_action(self.t, self.nurse, "complete", {"note": "Patient was in radiology"}).status, "done")

    def test_future_time_rejected(self):
        with self.assertRaises(ot.TaskError):
            ot.apply_action(self.t, self.nurse, "complete", {"performed_at": (timezone.now() + timedelta(hours=2)).isoformat()})

    def test_hold_needs_reason(self):
        with self.assertRaises(ot.TaskError):
            ot.apply_action(self.t, self.nurse, "hold", {})
        t = ot.apply_action(self.t, self.nurse, "hold", {"reason": "NPO", "note": "MD aware"})
        self.assertEqual((t.status, t.reason), ("held", "NPO"))

    def test_refuse_defaults_reason(self):
        t = ot.apply_action(self.t, self.nurse, "refuse", {})
        self.assertEqual((t.status, t.reason), ("refused", "Patient refused"))

    def test_cannot_act_twice(self):
        ot.apply_action(self.t, self.nurse, "complete", {})
        with self.assertRaises(ot.TaskError) as ctx:
            ot.apply_action(self.t, self.nurse, "hold", {"reason": "x"})
        self.assertEqual(ctx.exception.status_code, 409)

    def test_note_on_any_status(self):
        ot.apply_action(self.t, self.nurse, "complete", {})
        ot.apply_action(self.t, self.nurse, "note", {"note": "Tolerated well"})
        self.assertTrue(self.t.events.filter(event_type="note").exists())
        with self.assertRaises(ot.TaskError):
            ot.apply_action(self.t, self.nurse, "note", {})

    def test_missed_can_be_documented_late(self):
        OrderTask.objects.filter(pk=self.t.pk).update(status="missed", due_at=timezone.now() - timedelta(hours=14))
        self.t.refresh_from_db()
        self.assertEqual(ot.apply_action(self.t, self.nurse, "refuse", {}).status, "refused")

    def test_registrar_cannot_document(self):
        with self.assertRaises(ot.TaskError) as ctx:
            ot.apply_action(self.t, self.registrar, "complete", {})
        self.assertEqual(ctx.exception.status_code, 403)

    def test_other_clinic_cannot_document(self):
        outsider = mk("out", "nurse", self.other)
        with self.assertRaises(ot.TaskError) as ctx:
            ot.apply_action(self.t, outsider, "complete", {})
        self.assertEqual(ctx.exception.status_code, 404)

    def test_allowed_actions(self):
        self.assertEqual(ot.allowed_actions(self.nurse, self.t), ["complete", "hold", "refuse", "note"])
        self.assertEqual(ot.allowed_actions(self.admin, self.t), [])
        self.t.status = "done"
        self.assertEqual(ot.allowed_actions(self.nurse, self.t), ["note"])


class PrnTests(Base):
    def setUp(self):
        super().setUp()
        self.o = self.med({"frequency": "prn", "prn_reason": "pain", "min_interval_hours": 4})

    def test_prn_makes_no_scheduled_tasks(self):
        self.assertEqual(OrderTask.objects.count(), 0)

    def test_give_requires_reason(self):
        with self.assertRaises(ot.TaskError):
            ot.give_prn(self.o, self.nurse, {})

    def test_give_records_done_task(self):
        t = ot.give_prn(self.o, self.nurse, {"reason": "Pain 7/10"})
        self.assertEqual((t.status, t.is_prn, t.performed_by), ("done", True, self.nurse))

    def test_min_interval_blocks_then_override(self):
        ot.give_prn(self.o, self.nurse, {"reason": "Pain"})
        with self.assertRaises(ot.TaskError) as ctx:
            ot.give_prn(self.o, self.nurse, {"reason": "Pain again"})
        self.assertEqual(ctx.exception.status_code, 409)
        t = ot.give_prn(self.o, self.nurse, {"reason": "Pain again", "override_reason": "MD ok'd by phone"})
        self.assertEqual(t.status, "done")

    def test_interval_passes_later(self):
        first = ot.give_prn(self.o, self.nurse, {"reason": "Pain", "performed_at": (timezone.now() - timedelta(hours=5)).isoformat()})
        self.assertEqual(ot.give_prn(self.o, self.nurse, {"reason": "Pain"}).status, "done")
        self.assertNotEqual(first.pk, OrderTask.objects.order_by("-id").first().pk)

    def test_scheduled_order_is_not_prn(self):
        sched = self.med({"frequency": "daily"})
        with self.assertRaises(ot.TaskError):
            ot.give_prn(sched, self.nurse, {"reason": "x"})

    def test_discontinued_prn_cannot_be_given(self):
        ow.discontinue_order(self.o, self.doctor, "Stopped")
        with self.assertRaises(ot.TaskError):
            ot.give_prn(Order.objects.get(pk=self.o.pk), self.nurse, {"reason": "x"})


class ApiTests(Base):
    def setUp(self):
        super().setUp()
        self.o = self.med({"frequency": "q4h"})
        for i, t in enumerate(OrderTask.objects.filter(order=self.o).order_by("id")):
            OrderTask.objects.filter(pk=t.pk).update(due_at=timezone.now() + timedelta(hours=10 + i))
        self.due = OrderTask.objects.filter(order=self.o).order_by("id").first()
        OrderTask.objects.filter(pk=self.due.pk).update(due_at=timezone.now() - timedelta(minutes=90))
        self.upcoming = OrderTask.objects.filter(order=self.o).order_by("-id").first()

    def test_queues_and_counts(self):
        c = self.api()
        counts = c.get("/api/order-tasks/queues/").json()["counts"]
        self.assertEqual(counts["overdue"], 1)
        self.assertEqual(counts["needs_action"], 1)
        self.assertGreaterEqual(counts["upcoming"], 1)
        self.assertEqual(counts["all"], OrderTask.objects.count())

    def test_list_default_is_needs_action(self):
        rows = self.api().get("/api/order-tasks/").json()
        self.assertEqual(rows["count"], 1)
        row = rows["results"][0]
        self.assertEqual((row["id"], row["overdue"], row["actions"]), (self.due.pk, True, ["complete", "hold", "refuse", "note"]))
        self.assertEqual(row["patient_name"], self.patient.username)

    def test_list_filters(self):
        c = self.api()
        self.assertEqual(c.get("/api/order-tasks/?queue=all&task_type=nursing").json()["count"], 0)
        self.assertEqual(c.get(f"/api/order-tasks/?queue=all&patient={self.patient.pk}").json()["count"], OrderTask.objects.count())
        self.assertEqual(c.get("/api/order-tasks/?queue=all&q=amoxi").json()["count"], OrderTask.objects.count())
        self.assertEqual(c.get("/api/order-tasks/?queue=all&q=zzz").json()["count"], 0)
        self.assertEqual(c.get("/api/order-tasks/?queue=all&page_size=2").json()["page_size"], 2)

    def test_action_endpoint(self):
        r = self.api().post(f"/api/order-tasks/{self.due.pk}/action/", {"action": "complete", "note": "Late - patient off unit"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "done")
        self.assertTrue(r.json()["events"])
        again = self.api().post(f"/api/order-tasks/{self.due.pk}/action/", {"action": "complete"}, format="json")
        self.assertEqual(again.status_code, 409)

    def test_late_action_message(self):
        r = self.api().post(f"/api/order-tasks/{self.due.pk}/action/", {"action": "complete"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("note", r.json()["detail"])

    def test_detail(self):
        r = self.api().get(f"/api/order-tasks/{self.due.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["events"][0]["type"], "created")

    def test_registrar_and_patient_cannot_use(self):
        for u in (self.registrar, self.patient):
            self.assertEqual(self.api(u).get("/api/order-tasks/").status_code, 403)

    def test_admin_can_view_not_act(self):
        c = self.api(self.admin)
        self.assertEqual(c.get("/api/order-tasks/").status_code, 200)
        self.assertEqual(c.get("/api/order-tasks/").json()["results"][0]["actions"], [])
        self.assertEqual(c.post(f"/api/order-tasks/{self.due.pk}/action/", {"action": "hold", "reason": "x"}, format="json").status_code, 403)

    def test_other_clinic_sees_nothing(self):
        outsider = mk("out", "nurse", self.other)
        c = self.api(outsider)
        self.assertEqual(c.get("/api/order-tasks/?queue=all").json()["count"], 0)
        self.assertEqual(c.get(f"/api/order-tasks/{self.due.pk}/").status_code, 404)
        self.assertEqual(c.post(f"/api/order-tasks/{self.due.pk}/action/", {"action": "refuse"}, format="json").status_code, 404)

    def test_missed_queue(self):
        OrderTask.objects.filter(pk=self.due.pk).update(due_at=timezone.now() - timedelta(hours=20))
        r = self.api().get("/api/order-tasks/?queue=missed").json()
        self.assertEqual([x["id"] for x in r["results"]], [self.due.pk])

    def test_completed_queue(self):
        ot.apply_action(self.due, self.nurse, "refuse", {})
        r = self.api().get("/api/order-tasks/?queue=completed").json()
        row = next(x for x in r["results"] if x["id"] == self.due.pk)
        self.assertEqual(row["status"], "refused")

    def test_last_24h_grid_lists_documented_and_still_waiting_tasks(self):
        # documented in the window: in, with the initials of whoever did it
        ot.apply_action(self.due, self.nurse, "complete", {"note": "Patient was in X-ray"})
        # due 3 h ago and still pending: in, so it can be ticked off from the grid
        waiting = OrderTask.objects.exclude(pk=self.due.pk).first()
        OrderTask.objects.filter(pk=waiting.pk).update(due_at=timezone.now() - timedelta(hours=3), status="pending")
        r = self.api().get("/api/order-tasks/?queue=completed").json()
        by_id = {x["id"]: x for x in r["results"]}
        self.assertEqual(by_id[self.due.pk]["status"], "done")
        expected = ((self.nurse.first_name or "")[:1] + (self.nurse.last_name or "")[:1]).upper() or self.nurse.username[:2].upper()
        self.assertEqual(by_id[self.due.pk]["performed_by_initials"], expected)
        self.assertEqual(by_id[waiting.pk]["status"], "pending")
        self.assertEqual(by_id[waiting.pk]["performed_by_initials"], "")

    def test_last_24h_grid_leaves_out_old_and_future_pending_tasks(self):
        waiting = OrderTask.objects.exclude(pk=self.due.pk).first()
        OrderTask.objects.filter(pk=waiting.pk).update(due_at=timezone.now() - timedelta(hours=30), status="pending")
        ids = [x["id"] for x in self.api().get("/api/order-tasks/?queue=completed").json()["results"]]
        self.assertNotIn(waiting.pk, ids)
        OrderTask.objects.filter(pk=waiting.pk).update(due_at=timezone.now() + timedelta(hours=5))
        ids = [x["id"] for x in self.api().get("/api/order-tasks/?queue=completed").json()["results"]]
        self.assertNotIn(waiting.pk, ids)

    def test_prn_endpoints(self):
        prn = self.med({"frequency": "prn", "prn_reason": "pain", "min_interval_hours": 4})
        c = self.api()
        listing = c.get(f"/api/order-tasks/prn-orders/?patient={self.patient.pk}").json()
        self.assertEqual([x["order"] for x in listing], [prn.pk])
        self.assertIsNone(listing[0]["last_given_at"])
        r = c.post("/api/order-tasks/prn/", {"order": prn.pk, "reason": "Pain 6/10"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        again = c.post("/api/order-tasks/prn/", {"order": prn.pk, "reason": "Pain 6/10"}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertIsNotNone(c.get(f"/api/order-tasks/prn-orders/?patient={self.patient.pk}").json()[0]["last_given_at"])
        self.assertEqual(c.get("/api/order-tasks/prn-orders/").status_code, 400)

    def test_meta(self):
        m = self.api().get("/api/order-task-meta/").json()
        self.assertIn("bid", [f["value"] for f in m["frequencies"]])
        self.assertTrue(m["can_perform"])
        self.assertFalse(m["can_manage"])
        self.assertTrue(self.api(self.admin).get("/api/order-task-meta/").json()["can_manage"])

    def test_settings_roundtrip(self):
        c = self.api(self.admin)
        r = c.get("/api/order-task-settings/").json()
        self.assertEqual((r["grace_minutes"], r["can_edit"]), (60, True))
        r = c.put("/api/order-task-settings/", {"grace_minutes": 30, "missed_after_hours": 8, "pass_times": {"bid": ["08:00", "20:00"]}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["pass_times"]["bid"], ["08:00", "20:00"])
        self.assertEqual(r.json()["pass_times"]["tid"], ["09:00", "14:00", "21:00"])
        self.assertEqual(ot.settings_for(self.org)["grace_minutes"], 30)

    def test_settings_validation_and_permissions(self):
        c = self.api(self.admin)
        for bad in ({"grace_minutes": -1}, {"missed_after_hours": 0}, {"look_ahead_hours": 5}, {"grace_minutes": "x"}, {"pass_times": {"q4h": ["08:00"]}}, {"pass_times": {"bid": ["25:00"]}}, {"pass_times": {"bid": []}}):
            self.assertEqual(c.put("/api/order-task-settings/", bad, format="json").status_code, 400, bad)
        self.assertEqual(self.api(self.nurse).put("/api/order-task-settings/", {"grace_minutes": 5}, format="json").status_code, 403)
        self.assertFalse(self.api(self.nurse).get("/api/order-task-settings/").json()["can_edit"])

    def test_grace_setting_changes_overdue(self):
        TaskSettings.objects.create(organization=self.org, grace_minutes=120)
        counts = self.api().get("/api/order-tasks/queues/").json()["counts"]
        self.assertEqual(counts["overdue"], 0)
        self.assertEqual(counts["needs_action"], 1)

    def test_chart_tab_listed(self):
        from .chart_tabs import KEYS
        self.assertIn("task_list", KEYS)

    def test_order_serializer_exposes_schedule(self):
        r = self.api(self.doctor).get(f"/api/orders/{self.o.pk}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["schedule"]["frequency"], "q4h")


class OrderPayloadTests(Base):
    def test_order_exposes_task_mode(self):
        o = ow.create_draft_order(self.doctor, self.appt, self.amox)
        r = self.api(self.doctor).get(f"/api/orders/{o.pk}/")
        self.assertEqual(r.json()["task_mode"], "required")
        lab = ow.create_draft_order(self.doctor, self.appt, self.cbc)
        self.assertEqual(self.api(self.doctor).get(f"/api/orders/{lab.pk}/").json()["task_mode"], "none")


class DefaultFrequencyTests(Base):
    def test_default_frequency_prefills_the_draft(self):
        self.amox.default_frequency = "tid"
        self.amox.save()
        o = ow.create_draft_order(self.doctor, self.appt, self.amox)
        self.assertEqual(o.schedule, {"frequency": "tid"})
        self.assertEqual(ot.schedule_missing(o), ["the dose", "the route"])

    def test_explicit_schedule_wins(self):
        self.amox.default_frequency = "tid"
        self.amox.save()
        o = ow.create_draft_order(self.doctor, self.appt, self.amox, schedule={"frequency": "qid", "dose": "1", "route": "PO"})
        self.assertEqual(o.schedule["frequency"], "qid")

    def test_admin_sets_task_fields_on_an_orderable(self):
        mine = Orderable.objects.create(organization=self.org, code="wt2", name="Weight 2", category="nursing")
        c = self.api(self.admin)
        r = c.patch(f"/api/admin/orderables/{mine.pk}/", {"creates_tasks": True, "default_frequency": "daily"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["creates_tasks"], r.json()["default_frequency"], r.json()["task_mode"]), (True, "daily", "optional"))
        bad = c.patch(f"/api/admin/orderables/{mine.pk}/", {"default_frequency": "whenever"}, format="json")
        self.assertEqual(bad.status_code, 400)
        r = c.patch(f"/api/admin/orderables/{mine.pk}/", {"creates_tasks": None, "default_frequency": ""}, format="json")
        self.assertEqual(r.status_code, 200, r.content)


class CatalogCsvTests(Base):
    def upload(self, text):
        from django.core.files.uploadedfile import SimpleUploadedFile
        c = self.api(self.admin)
        return c.post("/api/admin/orderables/upload-csv/", {"file": SimpleUploadedFile("c.csv", text.encode(), content_type="text/csv")}, format="multipart")

    def test_task_columns_are_applied(self):
        r = self.upload("code,name,category,creates_tasks,default_frequency\nvit,Vitals,nursing,yes,q4h\namx,Amox,medication,,tid\nlab1,Lab,laboratory,no,\n")
        self.assertEqual(r.status_code, 200, r.content)
        vit = Orderable.objects.get(code="vit")
        self.assertEqual((vit.creates_tasks, vit.default_frequency, vit.task_mode), (True, "q4h", "optional"))
        amx = Orderable.objects.get(code="amx")
        self.assertEqual((amx.creates_tasks, amx.default_frequency, amx.task_mode), (None, "tid", "required"))
        self.assertEqual(Orderable.objects.get(code="lab1").task_mode, "none")

    def test_older_file_without_the_columns_changes_nothing(self):
        self.upload("code,name,category,creates_tasks,default_frequency\nvit,Vitals,nursing,yes,q4h\n")
        r = self.upload("code,name,category\nvit,Vitals renamed,nursing\n")
        self.assertEqual(r.status_code, 200, r.content)
        vit = Orderable.objects.get(code="vit")
        self.assertEqual((vit.name, vit.creates_tasks, vit.default_frequency), ("Vitals renamed", True, "q4h"))

    def test_bad_values_reported(self):
        r = self.upload("code,name,category,creates_tasks,default_frequency\na,A,nursing,maybe,hourly-ish\n")
        self.assertEqual(r.status_code, 400)
        cols = {e["column"] for e in r.json()["errors"]}
        self.assertEqual(cols, {"creates_tasks", "default_frequency"})
        self.assertEqual(Orderable.objects.filter(code="a").count(), 0)

    def test_export_round_trips_task_columns(self):
        self.upload("code,name,category,creates_tasks,default_frequency\nvit,Vitals,nursing,yes,q4h\n")
        text = self.api(self.admin).get("/api/admin/orderables/download-csv/").content.decode()
        self.assertIn("creates_tasks,default_frequency", text)
        Orderable.objects.filter(code="vit").update(creates_tasks=None, default_frequency="")
        self.assertEqual(self.upload(text).status_code, 200)
        vit = Orderable.objects.get(code="vit")
        self.assertEqual((vit.creates_tasks, vit.default_frequency), (True, "q4h"))

    def test_sample_includes_task_columns(self):
        text = self.api(self.admin).get("/api/admin/orderables/sample-csv/").content.decode()
        self.assertIn("creates_tasks,default_frequency", text.splitlines()[0])
        self.assertEqual(self.upload(text).status_code, 200)
