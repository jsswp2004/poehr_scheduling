from django.utils import timezone

from .models import Appointment
from .test_locations import Base


class CheckInUndoTests(Base):
    def appt(self, **extra):
        return Appointment.all_objects.create(
            organization=self.org,
            patient=self.patient_user,
            provider=self.doctor,
            title="Visit",
            appointment_datetime=timezone.now(),
            **extra,
        )

    def patch(self, appt, arrived, user=None):
        return self.as_(user or self.admin).patch(
            f"/api/check-in/update-status/{appt.pk}/", {"arrived": arrived}, format="json"
        )

    def test_arriving_moves_the_visit_to_in_progress(self):
        a = self.appt()
        self.assertEqual(self.patch(a, True).status_code, 200)
        a.refresh_from_db()
        self.assertTrue(a.arrived)
        self.assertEqual(a.status, "in_progress")

    def test_undo_puts_the_visit_back_to_scheduled(self):
        a = self.appt()
        self.patch(a, True)
        self.assertEqual(self.patch(a, False).status_code, 200)
        a.refresh_from_db()
        self.assertFalse(a.arrived)
        self.assertEqual(a.status, "scheduled")

    def test_undo_leaves_other_statuses_alone(self):
        a = self.appt(arrived=True, status="completed")
        self.patch(a, False)
        a.refresh_from_db()
        self.assertFalse(a.arrived)
        self.assertEqual(a.status, "completed")

    def test_search_finds_todays_visit_with_provider(self):
        self.appt()
        r = self.as_(self.admin).get("/api/check-in/search/", {"query": "Bcs"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["provider_name"], "Dr. Jeffrey Lee")
