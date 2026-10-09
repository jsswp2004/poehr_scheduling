"""Renewals (a new draft that carries on a prescription, and the 'due for renewal' queue) and prescriber favorites."""

from datetime import timedelta

from django.utils import timezone

from .models import HomeMedication, PatientPharmacy, Prescription, PrescriptionFavorite
from .test_prescriptions import ACTION, LIST, QUEUES, RxBase

FAVS = "/api/prescription-favorites/"
FAV = "/api/prescription-favorites/{}/"


class RenewTests(RxBase):
    def test_renew_makes_a_copy_and_leaves_the_original(self):
        old = self.signed(refills=2, note_to_pharmacist="Call me")
        r = self.act(old["id"], "renew")
        self.assertEqual(r.status_code, 201, r.content)
        new = r.json()
        self.assertNotEqual(new["id"], old["id"])
        self.assertEqual((new["status"], new["renews"], new["prescriber"]), ("draft", old["id"], self.doctor.pk))
        for key in ("drug_name", "strength", "form", "dose", "route", "frequency", "quantity", "days_supply", "refills", "note_to_pharmacist"):
            self.assertEqual(new[key], old[key], key)
        self.assertEqual(Prescription.objects.get(pk=old["id"]).status, "signed")
        kinds = [e["type"] for e in self.as_(self.doctor).get(f"{LIST}{old['id']}/").json()["events"]]
        self.assertIn("renewal_started", kinds)
        # asking again returns the same draft
        again = self.act(old["id"], "renew").json()
        self.assertEqual(again["id"], new["id"])
        self.assertEqual(Prescription.objects.filter(renews_id=old["id"]).count(), 1)

    def test_a_nurse_renewal_keeps_the_original_prescriber(self):
        old = self.signed()
        new = self.act(old["id"], "renew", user=self.nurse).json()
        self.assertEqual(new["prescriber"], self.doctor.pk)

    def test_renewal_uses_the_patients_preferred_pharmacy(self):
        old = self.signed()
        other = self.pharm.__class__.objects.create(organization=self.org, name="Elm Pharmacy", fax="(718) 555-0111")
        PatientPharmacy.objects.create(patient=self.patient, pharmacy=other)
        new = self.act(old["id"], "renew").json()
        self.assertEqual(new["pharmacy"], other.pk)

    def test_only_signed_prescriptions_renew_and_only_by_staff(self):
        draft = self.make()
        self.assertEqual(self.act(draft["id"], "renew").status_code, 409)
        old = self.signed()
        self.assertEqual(self.act(old["id"], "cancel", reason="Mistake").status_code, 200)
        self.assertEqual(self.act(old["id"], "renew").status_code, 409)
        live = self.signed(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily", quantity="30", quantity_unit="tablets", days_supply=30)
        self.assertEqual(self.act(live["id"], "renew", user=self.registrar).status_code, 403)
        self.assertEqual(self.act(live["id"], "renew", user=self.outsider).status_code, 404)
        self.assertIn("renew", self.as_(self.doctor).get(f"{LIST}{live['id']}/").json()["actions"])
        self.assertNotIn("renew", self.as_(self.doctor).get(f"{LIST}{draft['id']}/").json()["actions"])

    def test_signing_a_renewal_is_not_a_duplicate_of_the_prescription_it_renews(self):
        old = self.signed()
        new = self.act(old["id"], "renew").json()
        r = self.act(new["id"], "sign")
        self.assertEqual(r.status_code, 200, r.content)  # no duplicate warning against its own source
        self.assertEqual(Prescription.objects.get(pk=old["id"]).status, "signed")  # and the old one is left alone

    def test_a_different_running_prescription_is_still_a_duplicate(self):
        self.signed()
        other = self.make()  # a second, unrelated draft for the same drug
        r = self.act(other["id"], "sign")
        self.assertEqual(r.status_code, 409)


class RenewalQueueTests(RxBase):
    def aged(self, rx, days_ago):
        Prescription.objects.filter(pk=rx["id"]).update(signed_at=timezone.now() - timedelta(days=days_ago))

    def ids(self, **params):
        return [r["id"] for r in self.as_(self.doctor).get(LIST, {"queue": "renewals", **params}).json()["results"]]

    def test_due_when_the_supply_runs_out_soon(self):
        soon = self.signed()                       # 10 days' supply
        self.aged(soon, 8)                         # runs out in 2 days
        fresh = self.signed(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily", quantity="30", quantity_unit="tablets", days_supply=30)
        self.aged(fresh, 1)                        # runs out in 29 days: not yet
        self.assertEqual(self.ids(), [soon["id"]])
        self.assertEqual(self.as_(self.doctor).get(QUEUES).json()["counts"]["renewals"], 1)
        row = self.as_(self.doctor).get(f"{LIST}{soon['id']}/").json()
        self.assertTrue(row["renewal_due"])
        self.assertEqual(row["runs_out_on"], (timezone.now() + timedelta(days=2)).date().isoformat())
        self.assertFalse(self.as_(self.doctor).get(f"{LIST}{fresh['id']}/").json()["renewal_due"])

    def test_refills_extend_the_supply(self):
        rx = self.signed(refills=3)                # 10 days x 4 fills = 40 days
        self.aged(rx, 8)
        self.assertEqual(self.ids(), [])
        self.aged(rx, 38)
        self.assertEqual(self.ids(), [rx["id"]])

    def test_long_gone_prescriptions_are_not_listed(self):
        rx = self.signed()
        self.aged(rx, 120)                         # ran out 110 days ago
        self.assertEqual(self.ids(), [])
        self.aged(rx, 30)                          # ran out 20 days ago: still worth a call
        self.assertEqual(self.ids(), [rx["id"]])

    def test_soonest_to_run_out_comes_first(self):
        a = self.signed()
        self.aged(a, 9)
        b = self.signed(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily", quantity="30", quantity_unit="tablets", days_supply=30)
        self.aged(b, 40)                           # ran out 10 days ago
        self.assertEqual(self.ids(), [b["id"], a["id"]])

    def test_a_renewal_or_a_newer_prescription_takes_it_off_the_queue(self):
        rx = self.signed()
        self.aged(rx, 8)
        self.assertEqual(self.ids(), [rx["id"]])
        self.act(rx["id"], "renew")
        self.assertEqual(self.ids(), [])
        self.assertEqual(self.as_(self.doctor).get(QUEUES).json()["counts"]["renewals"], 0)

    def test_stopping_the_home_medicine_takes_it_off_the_queue(self):
        rx = self.signed()
        self.aged(rx, 8)
        med = HomeMedication.objects.get(patient=self.patient, drug_name="Amoxicillin")
        r = self.as_(self.nurse).post(f"/api/home-medications/{med.pk}/action/", {"action": "stop", "reason": "Finished"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.ids(), [])

    def test_cancelled_and_draft_prescriptions_never_appear(self):
        rx = self.signed()
        self.aged(rx, 8)
        self.act(rx["id"], "cancel", reason="Wrong")
        self.make()
        self.assertEqual(self.ids(), [])

    def test_filters_and_scope_apply(self):
        rx = self.signed()
        self.aged(rx, 8)
        self.assertEqual(self.ids(q="amox"), [rx["id"]])
        self.assertEqual(self.ids(q="zzz"), [])
        self.assertEqual(self.ids(patient=self.patient.pk), [rx["id"]])
        self.assertEqual(self.as_(self.outsider).get(LIST, {"queue": "renewals"}).json()["count"], 0)

    def test_paging_the_queue(self):
        for name in ("Amoxicillin", "Lisinopril", "Metformin"):
            rx = self.signed(drug_name=name)
            self.aged(rx, 8)
        r = self.as_(self.doctor).get(LIST, {"queue": "renewals", "page_size": 2}).json()
        self.assertEqual((r["count"], len(r["results"])), (3, 2))


class FavoriteTests(RxBase):
    def fav_body(self, **extra):
        data = {
            "drug_name": "Amoxicillin", "strength": "500 mg", "form": "capsule", "dose": "1 capsule", "route": "PO",
            "frequency": "tid", "duration_days": 10, "quantity": "30", "quantity_unit": "capsules", "days_supply": 10, "refills": 1,
        }
        data.update(extra)
        return data

    def save(self, user=None, **extra):
        r = self.as_(user or self.doctor).post(FAVS, self.fav_body(**extra), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_save_list_and_use_fields(self):
        fav = self.save(label="Strep throat")
        self.assertEqual(fav["label"], "Strep throat")
        self.assertEqual(fav["sig"], "Take 1 capsule by mouth three times daily for 10 days.")
        self.assertEqual((fav["quantity"], fav["refills"], fav["days_supply"]), ("30", 1, 10))
        rows = self.as_(self.doctor).get(FAVS).json()["results"]
        self.assertEqual([f["id"] for f in rows], [fav["id"]])

    def test_label_defaults_to_the_drug_and_strength(self):
        self.assertEqual(self.save()["label"], "Amoxicillin 500 mg")

    def test_favorites_are_private_to_their_owner(self):
        fav = self.save()
        self.assertEqual(self.as_(self.doctor2).get(FAVS).json()["results"], [])
        self.assertEqual(self.as_(self.doctor2).delete(FAV.format(fav["id"])).status_code, 404)
        self.assertEqual(self.as_(self.doctor2).patch(FAV.format(fav["id"]), {"label": "x"}, format="json").status_code, 404)
        self.assertEqual(PrescriptionFavorite.objects.count(), 1)

    def test_the_same_favorite_is_not_saved_twice(self):
        self.save()
        r = self.as_(self.doctor).post(FAVS, self.fav_body(label="Again"), format="json")
        self.assertEqual(r.status_code, 409)
        self.save(strength="250 mg")  # a different strength is a different favorite

    def test_save_from_a_prescription(self):
        rx = self.signed(refills=2)
        r = self.as_(self.doctor).post(FAVS, {"from_prescription": rx["id"], "label": "Usual"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        fav = r.json()
        self.assertEqual((fav["drug_name"], fav["refills"], fav["label"]), ("Amoxicillin", 2, "Usual"))
        self.assertEqual(self.as_(self.doctor).post(FAVS, {"from_prescription": 99999}, format="json").status_code, 404)
        self.assertEqual(self.as_(self.outsider).post(FAVS, {"from_prescription": rx["id"]}, format="json").status_code, 404)

    def test_controlled_drugs_and_bad_values_are_refused(self):
        c = self.as_(self.doctor)
        self.assertEqual(c.post(FAVS, self.fav_body(drug_name="Oxycodone"), format="json").status_code, 400)
        self.assertEqual(c.post(FAVS, self.fav_body(form="Nope"), format="json").status_code, 400)
        self.assertEqual(c.post(FAVS, self.fav_body(route="Nope"), format="json").status_code, 400)
        self.assertEqual(c.post(FAVS, self.fav_body(refills=99), format="json").status_code, 400)
        self.assertEqual(c.post(FAVS, {"strength": "5 mg"}, format="json").status_code, 400)
        self.assertEqual(PrescriptionFavorite.objects.count(), 0)

    def test_rename_search_delete(self):
        fav = self.save()
        other = self.save(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily")
        r = self.as_(self.doctor).patch(FAV.format(fav["id"]), {"label": "Ear infection"}, format="json")
        self.assertEqual(r.json()["label"], "Ear infection")
        found = self.as_(self.doctor).get(FAVS, {"q": "ear"}).json()["results"]
        self.assertEqual([f["id"] for f in found], [fav["id"]])
        self.assertEqual(self.as_(self.doctor).delete(FAV.format(other["id"])).status_code, 204)
        self.assertEqual(len(self.as_(self.doctor).get(FAVS).json()["results"]), 1)

    def test_a_nurse_can_keep_favorites_but_a_registrar_cannot(self):
        self.save(user=self.nurse)
        self.assertEqual(self.as_(self.registrar).get(FAVS).status_code, 403)
        self.assertEqual(self.as_(self.registrar).post(FAVS, self.fav_body(), format="json").status_code, 403)
