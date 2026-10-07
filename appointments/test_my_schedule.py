from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from .models import Appointment

User = get_user_model()
URL = "/api/my-schedule/"


def make_user(username, role, org, **extra):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra
    )


def at(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other_org = Organization.objects.create(name="Other Clinic")
        self.amara = make_user("amara", "doctor", self.org, first_name="Amara", last_name="Chen")
        self.lee = make_user("lee", "doctor", self.org, first_name="Jeffrey", last_name="Lee")
        self.nurse = make_user("nurse", "nurse", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.sysadmin = make_user("sys", "system_admin", None)
        self.patient_user = make_user("pat", "patient", self.org)
        self.outsider_doc = make_user("out", "doctor", self.other_org)
        self.today = timezone.localdate()
        self.client = APIClient()

    def patient(self, first, last, org=None):
        user = make_user(f"{first}{last}".lower(), "patient", org or self.org, first_name=first, last_name=last)
        profile = Patient.objects.get(user=user)
        profile.organization = org or self.org
        profile.mrn = f"MRN{user.pk}"
        profile.save()
        return user, profile

    def book(self, patient_user, provider, hour, minute=0, day=None, org=None, **extra):
        return Appointment.all_objects.create(
            organization=org or self.org,
            patient=patient_user,
            provider=provider,
            title=extra.pop("title", "Follow-up"),
            appointment_datetime=at(day or self.today, hour, minute),
            **extra,
        )

    def rows(self, user, **params):
        self.client.force_authenticate(user)
        response = self.client.get(URL, params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def names(self, user, **params):
        return [r["patient"]["full_name"] for r in self.rows(user, **params)["results"]]


class DoctorTests(Base):
    def setUp(self):
        super().setUp()
        self.sofia, self.sofia_p = self.patient("Sofia", "Marchetti")
        self.ben, _ = self.patient("Ben", "Ortiz")
        self.cara, _ = self.patient("Cara", "Nguyen")

    def test_a_doctor_sees_only_their_own_patients_for_the_day_in_time_order(self):
        self.book(self.ben, self.amara, 14)
        self.book(self.sofia, self.amara, 9, 30)
        self.book(self.cara, self.lee, 10)  # another doctor's patient
        body = self.rows(self.amara)
        self.assertEqual([r["patient"]["full_name"] for r in body["results"]], ["Sofia Marchetti", "Ben Ortiz"])
        self.assertEqual(body["count"], 2)

    def test_a_doctor_cannot_widen_it_with_the_provider_filter(self):
        self.book(self.cara, self.lee, 10)
        self.assertEqual(self.names(self.amara, provider=self.lee.pk), [])

    def test_only_the_asked_for_day(self):
        self.book(self.ben, self.amara, 9, day=self.today - timedelta(days=1))
        self.book(self.sofia, self.amara, 9, day=self.today + timedelta(days=1))
        self.book(self.cara, self.amara, 11)
        self.assertEqual(self.names(self.amara), ["Cara Nguyen"])
        tomorrow = (self.today + timedelta(days=1)).isoformat()
        self.assertEqual(self.names(self.amara, date=tomorrow), ["Sofia Marchetti"])

    def test_start_and_end_define_the_day(self):
        self.book(self.ben, self.amara, 8)
        self.book(self.sofia, self.amara, 23, 30)
        start = at(self.today, 8)
        window = {"start": start.isoformat(), "end": (start + timedelta(hours=2)).isoformat()}
        self.assertEqual(self.names(self.amara, **window), ["Ben Ortiz"])  # end is exclusive of later bookings

    def test_cancelled_and_rescheduled_are_left_out_but_no_show_and_completed_stay(self):
        self.book(self.ben, self.amara, 9, status="cancelled")
        self.book(self.cara, self.amara, 10, status="rescheduled")
        self.book(self.sofia, self.amara, 11, status="no_show", no_show=True)
        done, _ = self.patient("Dan", "Done")
        self.book(done, self.amara, 12, status="completed")
        self.assertEqual(self.names(self.amara), ["Sofia Marchetti", "Dan Done"])

    def test_row_carries_the_appointment_and_a_patient_the_chart_can_open(self):
        appt = self.book(self.sofia, self.amara, 9, 30, title="Annual physical", arrived=True, duration_minutes=45)
        row = self.rows(self.amara)["results"][0]
        self.assertEqual(row["appointment"]["id"], appt.pk)
        self.assertEqual(row["appointment"]["title"], "Annual physical")
        self.assertEqual(row["appointment"]["status"], "scheduled")
        self.assertTrue(row["appointment"]["arrived"])
        self.assertEqual(row["appointment"]["provider_name"], "Amara Chen")
        self.assertEqual(row["patient"]["user_id"], self.sofia.pk)
        self.assertEqual(row["patient"]["full_name"], "Sofia Marchetti")
        self.assertEqual(row["patient"]["mrn"], self.sofia_p.mrn)
        start = datetime.fromisoformat(row["appointment"]["start"])
        end = datetime.fromisoformat(row["appointment"]["end"])
        self.assertEqual(end - start, timedelta(minutes=45))

    def test_a_patient_seen_twice_in_a_day_is_listed_twice(self):
        self.book(self.sofia, self.amara, 9)
        self.book(self.sofia, self.amara, 15, title="Lab review")
        self.assertEqual(self.names(self.amara), ["Sofia Marchetti", "Sofia Marchetti"])

    def test_chart_records_the_system_makes_for_a_visit_are_not_on_the_schedule(self):
        visit = Registration.objects.create(patient=self.sofia_p, organization=self.org, admission_type="scheduled")
        record = visit.ensure_chart_appointment()
        Appointment.all_objects.filter(pk=record.pk).update(provider=self.amara, appointment_datetime=at(self.today, 10))
        self.book(self.ben, self.amara, 11)
        self.assertEqual(self.names(self.amara), ["Ben Ortiz"])

    def test_a_booked_appointment_linked_to_a_visit_still_shows(self):
        visit = Registration.objects.create(patient=self.sofia_p, organization=self.org, admission_type="scheduled")
        real = self.book(self.sofia, self.amara, 10, title="Annual physical")
        Registration.objects.filter(pk=visit.pk).update(appointment=real)
        self.assertEqual(self.names(self.amara), ["Sofia Marchetti"])

    def test_search_by_name_mrn_or_reason(self):
        self.book(self.sofia, self.amara, 9, title="Annual physical")
        self.book(self.ben, self.amara, 10, title="Knee pain")
        self.assertEqual(self.names(self.amara, search="sofia"), ["Sofia Marchetti"])
        self.assertEqual(self.names(self.amara, search=self.sofia_p.mrn), ["Sofia Marchetti"])
        self.assertEqual(self.names(self.amara, search="knee"), ["Ben Ortiz"])

    def test_user_without_a_patient_profile_is_skipped_not_fatal(self):
        Patient.objects.filter(user=self.ben).delete()
        self.book(self.ben, self.amara, 9)
        self.book(self.sofia, self.amara, 10)
        self.assertEqual(self.names(self.amara), ["Sofia Marchetti"])


class WiderRoleTests(Base):
    def setUp(self):
        super().setUp()
        self.sofia, _ = self.patient("Sofia", "Marchetti")
        self.ben, _ = self.patient("Ben", "Ortiz")
        self.far, _ = self.patient("Far", "Away", org=self.other_org)
        self.book(self.sofia, self.amara, 9)
        self.book(self.ben, self.lee, 10)
        self.book(self.far, self.outsider_doc, 11, org=self.other_org)

    def test_admin_sees_every_provider_in_their_own_clinic_only(self):
        self.assertEqual(self.names(self.admin), ["Sofia Marchetti", "Ben Ortiz"])

    def test_system_admin_sees_every_clinic(self):
        self.assertEqual(self.names(self.sysadmin), ["Sofia Marchetti", "Ben Ortiz", "Far Away"])

    def test_nurse_sees_the_clinic_like_the_patient_list(self):
        self.assertEqual(self.names(self.nurse), ["Sofia Marchetti", "Ben Ortiz"])

    def test_they_can_narrow_to_one_provider(self):
        for user in (self.admin, self.sysadmin, self.nurse):
            self.assertEqual(self.names(user, provider=self.lee.pk), ["Ben Ortiz"])

    def test_bad_provider_is_refused(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(URL, {"provider": "abc"}).status_code, 400)


class AccessTests(Base):
    def test_patients_and_anonymous_are_refused(self):
        self.client.force_authenticate(self.patient_user)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_bad_or_huge_windows_are_refused(self):
        self.client.force_authenticate(self.admin)
        start = at(self.today, 0)
        too_long = {"start": start.isoformat(), "end": (start + timedelta(days=30)).isoformat()}
        self.assertEqual(self.client.get(URL, too_long).status_code, 400)
        backwards = {"start": (start + timedelta(days=1)).isoformat(), "end": start.isoformat()}
        self.assertEqual(self.client.get(URL, backwards).status_code, 400)

    def test_garbage_date_means_today(self):
        sofia, _ = self.patient("Sofia", "Marchetti")
        self.book(sofia, self.amara, 9)
        self.assertEqual(self.names(self.amara, date="not-a-date"), ["Sofia Marchetti"])
