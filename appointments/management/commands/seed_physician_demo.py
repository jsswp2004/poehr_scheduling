"""
Seed the fixed cast for the physician demo, on top of `seed_demo_data` (run that first).

    python manage.py seed_demo_data
    python manage.py seed_physician_demo

Everything is fictional and safe to run on the public demo. It is idempotent: running it again
refreshes the times (so "overdue" and "renewal due" stay true) and does not duplicate anything.

The cast (usernames come from seed_demo_data):
  * Taylor Whitfield, 58    - diabetes follow-up: problems, penicillin allergy, home meds not reconciled,
                              a metformin renewal due, signed lab orders with results (one critical, unreviewed).
  * Priya Kapoor, 9 months  - born at 33 weeks: flowsheet growth data at 2, 4, 6 and 9 months, vaccines to 4 months.
  * Devon Baptiste, 34      - emergency visit, waiting, ESI 3, signed triage note, recheck overdue.
  * Jordan Nakamura, 71     - emergency visit, in bed ED 2, ESI 2, chest pain (so the board shows more than one row).

It also creates what the ED board needs: a hospital with an Emergency Department (4 beds) and a clinic unit.

Needs for the Vaccines tab: `import_cvx` and `load_immunization_schedule ... --approve-as <user>` run first.
Missing pieces are reported as warnings and skipped; they never stop the rest.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from appointments.management.commands.seed_demo_data import DEMO_ORG_NAME
from appointments.models import (
    Appointment,
    Bed,
    ClinicalNote,
    Facility,
    FlowsheetTemplate,
    HomeMedication,
    ImmunizationItem,
    LabReport,
    LabResultItem,
    NoteTemplate,
    Order,
    OrderSet,
    OrderSetItem,
    Orderable,
    PatientAllergy,
    PatientImmunization,
    Prescription,
    ProblemListEntry,
    Room,
    TriageSettings,
    Unit,
    VitalSignsFlowsheet,
)
from users.models import CustomUser, Organization, Patient, Registration

KG_PER_LB = 0.45359237


def years_before(day, n):
    try:
        return day.replace(year=day.year - n)
    except ValueError:  # 29 February
        return day.replace(year=day.year - n, day=28)


def at(day, hour=10, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class Command(BaseCommand):
    help = "Seed the fixed cast for the physician demo (run seed_demo_data first)."

    # ---------------------------------------------------------------- plumbing

    def warn(self, text):
        self.warnings.append(text)
        self.stdout.write(self.style.WARNING(f"  ! {text}"))

    def ok(self, text):
        self.stdout.write(self.style.SUCCESS(f"  {text}"))

    def person(self, username):
        user = CustomUser.objects.filter(username=username, organization=self.org).first()
        if user is None:
            raise CommandError(f"User {username} not found. Run `python manage.py seed_demo_data` first.")
        return user

    def profile(self, user, **fields):
        p, _ = Patient.objects.get_or_create(user=user, defaults={"organization": self.org})
        p.organization = self.org
        for key, value in fields.items():
            setattr(p, key, value)
        p.save()
        if user.provider_id != self.chen.pk:
            user.provider = self.chen
            user.save(update_fields=["provider"])
        return p

    def visit(self, patient, provider, when, title, status, arrived=True):
        appt, _ = Appointment.all_objects.get_or_create(
            organization=self.org, patient=patient, provider=provider, appointment_datetime=when,
            defaults={"title": title, "status": status, "duration_minutes": 30, "arrived": arrived},
        )
        return appt

    def chart(self, appt, patient, when, values, by):
        """One time column on the Vital Signs flowsheet of a visit."""
        if self.vitals_template is None:
            return
        col = f"col_demo{appt.pk}"
        sheet, _ = VitalSignsFlowsheet.objects.get_or_create(
            appointment=appt, template=self.vitals_template,
            defaults={"organization": self.org, "patient": patient, "created_by": by},
        )
        sheet.columns = [{"id": col, "timestamp": when.isoformat(), "recorded_by": by.pk,
                          "recorded_by_name": f"{by.first_name} {by.last_name}".strip()}]
        sheet.data = {row: {col: str(v)} for row, v in values.items()}
        sheet.save()

    # ---------------------------------------------------------------- main

    def handle(self, *args, **options):
        self.warnings = []
        self.org = Organization.objects.filter(name=DEMO_ORG_NAME).first()
        if self.org is None:
            raise CommandError("Demo organization not found. Run `python manage.py seed_demo_data` first.")
        self.today = timezone.localdate()
        self.now = timezone.now()
        self.chen = self.person("dr_amara_chen")
        self.reyes = self.person("dr_marcus_reyes")
        self.nurse = self.person("nurse_renee_okafor")
        self.admin = self.person("demo_admin")
        self.vitals_template = FlowsheetTemplate.objects.filter(code="vital_signs").first()
        if self.vitals_template is None:
            self.warn("No 'vital_signs' flowsheet template found; vitals and growth charts will be empty.")

        with transaction.atomic():
            self.stdout.write("Locations")
            self.locations()
            self.stdout.write("Orders catalog")
            self.catalog()
            self.stdout.write("Taylor Whitfield (adult follow-up)")
            self.taylor()
            self.stdout.write("Priya Kapoor (9-month-old)")
            self.priya()
            self.stdout.write("Devon Baptiste (ED, waiting) and Jordan Nakamura (ED, in a bed)")
            self.devon()
            self.jordan()

        self.stdout.write("")
        if self.warnings:
            self.stdout.write(self.style.WARNING(f"Done with {len(self.warnings)} warning(s)."))
        else:
            self.stdout.write(self.style.SUCCESS("Physician demo data ready."))
        self.stdout.write("Log in as dr_amara_chen / DemoPass123!  (nurse: nurse_renee_okafor)")

    # ---------------------------------------------------------------- locations

    def locations(self):
        """The ED board only lists an Emergency unit, so the clinic needs one (with beds) to show anything."""
        facility, _ = Facility.objects.get_or_create(
            organization=self.org, name="Riverside Medical Center (Demo)", defaults={"kind": "hospital", "code": "RMC"})
        Unit.objects.get_or_create(facility=facility, name="Family Medicine Clinic", defaults={"care_type": "outpatient"})
        self.ed_unit, _ = Unit.objects.get_or_create(
            facility=facility, name="Emergency Department", defaults={"care_type": "emergency", "code": "ED"})
        self.ed_beds = []
        for n in range(1, 5):
            room, _ = Room.objects.get_or_create(unit=self.ed_unit, name=f"ED {n}")
            bed, _ = Bed.objects.get_or_create(room=room, name="A")
            self.ed_beds.append(bed)
        self.ok("Riverside Medical Center (Demo): Emergency Department with 4 beds, Family Medicine Clinic")

    # ---------------------------------------------------------------- catalog

    def catalog(self):
        defs = [
            ("basic_metabolic_panel", "Basic metabolic panel", "51990-0"),
            ("hemoglobin_a1c", "Hemoglobin A1c", "4548-4"),
            ("urine_albumin_creatinine_ratio", "Urine albumin/creatinine ratio", "9318-7"),
            ("lipid_panel", "Lipid panel", "57698-3"),
        ]
        self.orderables = {}
        for code, name, loinc in defs:
            o, _ = Orderable.objects.get_or_create(
                code=code,
                defaults={"name": name, "category": "laboratory", "code_system": "loinc", "external_code": loinc},
            )
            self.orderables[code] = o
        oset, _ = OrderSet.objects.get_or_create(
            code="diabetes_followup_labs",
            defaults={"name": "Diabetes follow-up labs", "description": "Usual labs for a diabetes visit"},
        )
        for i, o in enumerate(self.orderables.values()):
            OrderSetItem.objects.get_or_create(order_set=oset, orderable=o, defaults={"sort_order": i})
        self.ok(f"{len(self.orderables)} lab orderables and the 'Diabetes follow-up labs' order set")

    # ---------------------------------------------------------------- Taylor

    def taylor(self):
        user = self.person("patient_taylor_whitfield")
        self.profile(user, date_of_birth=years_before(self.today, 58) - timedelta(days=40), legal_sex="M",
                     preferred_language="English")
        today = self.today
        past_day = today - timedelta(days=30)

        past = self.visit(user, self.chen, at(past_day, 10), "Diabetes follow-up", "completed")
        now_appt = self.visit(user, self.chen, at(today, 9, 30), "Diabetes follow-up (kidney check, labs)", "scheduled")
        Registration.objects.get_or_create(
            appointment=now_appt,
            defaults={"patient": user.patient_profile, "organization": self.org, "reason_for_visit": "Diabetes follow-up",
                      "presenting_problem": "Review of labs; blood pressure above goal at last visit.",
                      "admission_type": "scheduled", "attending_provider": self.chen, "registered_by": self.admin,
                      "registration_complete": True},
        )

        # problems, allergy
        for code, text, status, year in [
            ("E11.22", "Type 2 diabetes mellitus with diabetic chronic kidney disease", "chronic", 2016),
            ("I10", "Essential (primary) hypertension", "chronic", 2014),
            ("N18.30", "Chronic kidney disease, stage 3 unspecified", "active", 2022),
        ]:
            ProblemListEntry.objects.get_or_create(
                organization=self.org, patient=user, code=code,
                defaults={"description": text, "status": status, "onset_date": date(year, 3, 1), "entered_by": self.chen},
            )
        PatientAllergy.objects.get_or_create(
            patient=user, substance="Penicillin",
            defaults={"organization": self.org, "reaction": "Rash", "severity": "moderate", "category": "medication",
                      "reaction_type": "allergy", "reactions": [{"code": "", "display": "Rash"}], "entered_by": self.chen},
        )

        # home medicines (never reconciled) and prescriptions (metformin renewal due)
        meds = [
            ("Metformin", "1000 mg", "bid", "Type 2 diabetes", 80, 0),
            ("Lisinopril", "20 mg", "daily", "Hypertension and kidney protection", 30, 3),
            ("Atorvastatin", "40 mg", "qhs", "Cholesterol", 30, 3),
        ]
        sig = {"bid": "twice a day", "daily": "once a day", "qhs": "at bedtime"}
        for name, strength, freq, why, signed_days_ago, refills in meds:
            HomeMedication.objects.get_or_create(
                patient=user, drug_name=name,
                defaults={"organization": self.org, "strength": strength, "form": "tablet", "dose": "1 tablet", "route": "PO",
                          "frequency": freq, "source": "pharmacy", "indication_text": why, "status": "active",
                          "created_by": self.chen},
            )
            signed_at = self.now - timedelta(days=signed_days_ago)
            rx, made = Prescription.objects.get_or_create(
                patient=user, drug_name=name, status="sent",
                defaults={"organization": self.org, "prescriber": self.chen, "created_by": self.chen, "appointment": past,
                          "strength": strength, "form": "tablet", "dose": "1 tablet", "route": "PO", "frequency": freq,
                          "sig": f"Take 1 tablet by mouth {sig[freq]}", "quantity": Decimal("180" if freq == "bid" else "90"),
                          "quantity_unit": "tablets", "days_supply": 90, "refills": refills, "indication_text": why,
                          "signed_by": self.chen, "signed_at": signed_at, "delivery_method": "print", "sent_at": signed_at},
            )
            # keep the dates fresh on every run so the metformin renewal stays due
            Prescription.objects.filter(pk=rx.pk).update(signed_at=signed_at, sent_at=signed_at)
        self.ok("3 problems, penicillin allergy, 3 home medicines (not reconciled), 3 prescriptions (metformin renewal due)")

        # vitals: last visit and today's intake
        self.chart(past, user, at(past_day, 10, 5), {
            "temperature_f": 98.2, "heart_rate": 78, "resp_rate": 16, "spo2": 97, "bp_systolic": 148, "bp_diastolic": 88,
            "height_in": 70, "weight_lb": 214}, self.nurse)
        self.chart(now_appt, user, at(today, 9, 10), {
            "temperature_f": 98.4, "heart_rate": 82, "resp_rate": 16, "spo2": 97, "bp_systolic": 152, "bp_diastolic": 90,
            "height_in": 70, "weight_lb": 212}, self.nurse)

        # last visit's signed note
        ClinicalNote.objects.get_or_create(
            appointment=past, note_type="doctor_assessment", documentation_type="progress_note",
            defaults={"organization": self.org, "patient": user, "author": self.chen, "author_role_at_signing": "doctor",
                      "status": "signed", "signed_at": at(past_day, 10, 40),
                      "subjective": "Follows up diabetes and blood pressure. Missing some evening metformin doses. No chest pain, no vision change.",
                      "objective": "BP 148/88, HR 78, weight 214 lb. Feet: intact sensation, no ulcers.",
                      "assessment": "Type 2 diabetes with CKD stage 3, hypertension above goal.",
                      "plan": "Check A1c, basic metabolic panel and urine albumin/creatinine ratio. Review in 4 weeks."},
        )

        # signed lab orders and their results
        dx = [{"code": "E11.22", "description": "Type 2 diabetes mellitus with diabetic chronic kidney disease"}]
        resulted = self.now - timedelta(hours=14)
        collected = self.now - timedelta(hours=20)
        specs = [
            # key, status, items [(name, loinc, value, units, ref text, low, high, flag)], reviewed
            ("basic_metabolic_panel", "completed", [
                ("Potassium", "2823-3", "6.6", "mmol/L", "3.5-5.1", "3.5", "5.1", "HH"),
                ("Creatinine", "2160-0", "1.9", "mg/dL", "0.7-1.3", "0.7", "1.3", "H"),
                ("Glucose", "2345-7", "212", "mg/dL", "70-99", "70", "99", "H"),
                ("Sodium", "2951-2", "139", "mmol/L", "135-145", "135", "145", ""),
            ], False),
            ("hemoglobin_a1c", "completed", [
                ("Hemoglobin A1c", "4548-4", "8.9", "%", "4.0-5.6", "4.0", "5.6", "H"),
            ], True),
            ("urine_albumin_creatinine_ratio", "active", [], False),
        ]
        for key, status, items, reviewed in specs:
            o = self.orderables[key]
            order, _ = Order.objects.get_or_create(
                appointment=past, patient=user, orderable=o,
                defaults={"organization": self.org, "ordering_provider": self.chen, "orderable_name": o.name,
                          "orderable_category": o.category, "code_system": o.code_system, "external_code": o.external_code,
                          "priority": "routine", "indication": "Diabetes follow-up", "diagnosis_codes": dx,
                          "status": status, "signed_by": self.chen, "signed_at": at(past_day, 10, 30),
                          "completed_by": self.chen if status == "completed" else None,
                          "completed_at": resulted if status == "completed" else None,
                          "interface_status": "acknowledged" if status == "completed" else "sent"},
            )
            if not items:
                continue
            report, made = LabReport.objects.get_or_create(
                organization=self.org, patient=user, order=order,
                defaults={"title": o.name, "source": "interface", "status": "final", "performing_lab": "Demo Reference Lab",
                          "accession_number": f"DEMO-{order.pk:06d}", "collected_at": collected, "resulted_at": resulted,
                          "entered_by": self.chen, "review_status": "reviewed" if reviewed else "unreviewed",
                          "reviewed_by": self.chen if reviewed else None,
                          "reviewed_at": (self.now - timedelta(hours=2)) if reviewed else None},
            )
            if made:
                for i, (name, loinc, value, units, ref, low, high, flag) in enumerate(items):
                    LabResultItem.objects.create(
                        report=report, sort_order=i, test_name=name, loinc_code=loinc, value=value,
                        value_numeric=Decimal(value), units=units, reference_range=ref,
                        ref_low=Decimal(low), ref_high=Decimal(high), abnormal_flag=flag)
            else:
                LabReport.objects.filter(pk=report.pk).update(collected_at=collected, resulted_at=resulted)
        self.ok("3 signed lab orders: BMP (critical potassium, unreviewed), A1c (reviewed), urine ACR (pending)")

    # ---------------------------------------------------------------- Priya

    def priya(self):
        user = self.person("patient_priya_kapoor")
        dob = self.today - timedelta(days=274)  # about 9 months
        self.profile(user, date_of_birth=dob, legal_sex="F", gestational_age_weeks=33, gestational_age_days=0,
                     birth_weight_g=1900, preferred_language="English")

        # (days of age, title, status, weight lb, length in, head cm)
        # Values are plausible for a girl born at 33 weeks, plotted by corrected age. The 6-month weight is
        # deliberately low so the chart shows a flagged point; check it on the chart during the dry run.
        points = [
            (61, "2-month well visit", "completed", 7.3, 19.7, 37.0),
            (122, "4-month well visit", "completed", 10.1, 22.0, 40.0),
            (183, "6-month well visit", "completed", 10.8, 24.2, 42.0),
            (274, "9-month well visit", "scheduled", 15.4, 26.8, 44.0),
        ]
        appts = {}
        for days, title, status, lb, inches, head in points:
            day = dob + timedelta(days=days)
            appt = self.visit(user, self.chen, at(day, 9, 0), title, status)
            appts[days] = appt
            self.chart(appt, user, at(day, 9, 10),
                       {"weight_lb": lb, "height_in": inches, "head_circumference_cm": head}, self.nurse)
        Registration.objects.get_or_create(
            appointment=appts[274],
            defaults={"patient": user.patient_profile, "organization": self.org, "reason_for_visit": "9-month well visit",
                      "admission_type": "scheduled", "attending_provider": self.chen, "registered_by": self.admin,
                      "registration_complete": True},
        )
        self.ok("4 well visits with weight, length and head circumference; born at 33 weeks, 1900 g")

        # vaccines to the 4-month visit
        doses = [
            ("hepb", 1, 1, "historical"), ("hepb", 2, 61, "given_here"),
            ("rotavirus", 1, 61, "given_here"), ("rotavirus", 2, 122, "given_here"),
            ("dtap", 1, 61, "given_here"), ("dtap", 2, 122, "given_here"),
            ("hib", 1, 61, "given_here"), ("hib", 2, 122, "given_here"),
            ("pcv_child", 1, 61, "given_here"), ("pcv_child", 2, 122, "given_here"),
            ("ipv", 1, 61, "given_here"), ("ipv", 2, 122, "given_here"),
        ]
        made_count = 0
        missing = set()
        for code, number, days, source in doses:
            item = ImmunizationItem.objects.filter(code=code).filter(
                Q(organization=self.org) | Q(organization__isnull=True)).first()
            if item is None:
                missing.add(code)
                continue
            product = item.products.order_by("cvx_code").first()
            _, made = PatientImmunization.all_objects.get_or_create(
                organization=self.org, patient=user, item=item, dose_number=number, status="done",
                defaults={"product": product, "source": source, "given_on": dob + timedelta(days=days),
                          "given_by": self.chen if source == "given_here" else None, "entered_by": self.chen,
                          "route": "IM" if code in ("dtap", "hib", "pcv_child", "hepb") else "", "vis_given": True},
            )
            made_count += int(made)
        if missing:
            self.warn(f"Vaccine items not found ({', '.join(sorted(missing))}): load the immunization schedules first, then re-run.")
        else:
            self.ok(f"Vaccines recorded up to the 4-month visit ({made_count} new dose(s))")

    # ---------------------------------------------------------------- Devon (ED)

    def devon(self):
        user = self.person("patient_devon_baptiste")
        profile = self.profile(user, date_of_birth=years_before(self.today, 34) - timedelta(days=90), legal_sex="M",
                               preferred_language="English")
        arrival = self.now - timedelta(minutes=70)
        signed = self.now - timedelta(minutes=60)

        ts, _ = TriageSettings.objects.get_or_create(organization=self.org)
        ts.reassess_minutes = {"2": 15, "3": 30, "4": 60, "5": 120}
        ts.alert_user_ids = [self.chen.pk, self.reyes.pk]
        ts.save()

        reg = Registration.objects.filter(
            patient=profile, organization=self.org, admission_type="emergency", discharge_datetime__isnull=True).first()
        if reg is None:
            reg = Registration.objects.create(
                patient=profile, organization=self.org, admission_type="emergency", arrival_time=arrival,
                reason_for_visit="Abdominal pain", presenting_problem="Sharp pain in the right lower abdomen since last night.",
                esi=3, ed_status="wtbs", assigned_nurse=self.nurse,  # no doctor yet: an assigned doctor would show TIP
                registered_by=self.admin, registration_complete=True)
        else:
            Registration.objects.filter(pk=reg.pk).update(
                arrival_time=arrival, esi=3, ed_status="wtbs", attending_provider=None)
            reg.refresh_from_db()
        appt = reg.appointment or reg.ensure_chart_appointment()
        Appointment.all_objects.filter(pk=appt.pk).update(appointment_datetime=arrival)

        vitals = {"hr": 104, "rr": 20, "spo2": 98, "temp_f": 100.4, "sbp": 128, "dbp": 78, "pain": 7}
        self.chart(appt, user, arrival + timedelta(minutes=5), {
            "temperature_f": 100.4, "heart_rate": 104, "resp_rate": 20, "spo2": 98, "bp_systolic": 128, "bp_diastolic": 78,
            "pain_score": 7}, self.nurse)

        template = NoteTemplate.objects.filter(code="triage_note").first()
        if template is None:
            self.warn("Triage note template not found (migration 0064); Devon has no triage note.")
            return
        data = {
            "chief_complaint": "abdominal_pain", "reason_for_visit": "Sharp pain low on the right side since last night",
            "hpi_onset": "Last night", "hpi_quality": "Sharp", "hpi_associated": "Nausea, no vomiting",
            "hpi_summary": "34-year-old with 14 hours of right lower abdominal pain, nausea, low-grade fever.",
            "pain_scale": "numeric", "pain_score": 7, "allergies_confirmed": True, "medications_confirmed": True,
            "screen_unsafe_home": "no", "esi_a_life_saving": "no", "esi_resources": 2, "esi_level": 3,
            "destination": "waiting", "handoff_to": "Waiting room nurse",
            "triage_snapshot": {"vitals": vitals},
        }
        note, made = ClinicalNote.objects.get_or_create(
            appointment=appt, documentation_type="triage_note", status="signed",
            defaults={"organization": self.org, "patient": user, "author": self.nurse, "author_role_at_signing": "nurse",
                      "note_type": "nursing_assessment", "template": template, "template_version": template.version,
                      "structured_data": data, "signed_at": signed},
        )
        ClinicalNote.objects.filter(pk=note.pk).update(signed_at=signed)  # fresh on every run: the recheck is overdue
        self.ok("Waiting ED patient, ESI 3, triage note signed 60 minutes ago, recheck gap 30 minutes: Reassess shows Overdue")

    def jordan(self):
        """A second ED patient, already in bed ED 2, so the board shows more than one kind of row."""
        user = self.person("patient_jordan_nakamura")
        profile = self.profile(user, date_of_birth=years_before(self.today, 71) - timedelta(days=120), legal_sex="M",
                               preferred_language="English")
        arrival = self.now - timedelta(minutes=95)
        bed = self.ed_beds[1]
        reg = Registration.objects.filter(
            patient=profile, organization=self.org, admission_type="emergency", discharge_datetime__isnull=True).first()
        if reg is None:
            Registration.objects.create(
                patient=profile, organization=self.org, admission_type="emergency", arrival_time=arrival, bed=bed,
                reason_for_visit="Chest pain", presenting_problem="Pressure-like chest pain for two hours, radiating to the left arm.",
                esi=2, ed_status="tip", assigned_nurse=self.nurse, attending_provider=self.reyes,
                registered_by=self.admin, registration_complete=True)
        else:
            Registration.objects.filter(pk=reg.pk).update(arrival_time=arrival, esi=2)
        self.ok("ED patient in bed ED 2, ESI 2, chest pain")
