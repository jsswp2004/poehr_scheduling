"""
Registration extras: the records that repeat or stand apart from the patient row.

* contacts   other people to reach (next of kin, guardian, health care proxy), several allowed
* guarantor  who is responsible for the bill (the patient, or someone else)
* employer   where the patient works

GET /api/registration-extras/<patient user id>/   read all three (staff)
PUT /api/registration-extras/<patient user id>/   save them together; a key left out is untouched
"""

import re

from django.db import transaction
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import Patient

from .models import PatientContact, PatientEmployer, PatientGuarantor
from .patient_header import STAFF_ROLES

MAX_CONTACTS = 20
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _text(raw, limit, label):
    value = "" if raw is None else str(raw).strip()
    if len(value) > limit:
        raise ValueError(f"{label} is longer than {limit} characters.")
    return value


def contact_row(c):
    return {
        "contact_type": c.contact_type,
        "name": c.name,
        "relationship": c.relationship,
        "phone": c.phone,
        "address": c.address,
        "receives_communication": c.receives_communication,
    }


def guarantor_row(g):
    if g is None:
        return None
    return {"is_self": g.is_self, "name": g.name, "relationship": g.relationship, "phone": g.phone, "address": g.address}


def employer_row(e):
    if e is None:
        return None
    return {
        "employer_name": e.employer_name,
        "employment_status": e.employment_status,
        "occupation": e.occupation,
        "phone": e.phone,
        "from_date": e.from_date.isoformat() if e.from_date else "",
    }


def clean_contacts(raw):
    """(rows, error)."""
    if not isinstance(raw, list):
        return None, "contacts must be a list."
    if len(raw) > MAX_CONTACTS:
        return None, f"At most {MAX_CONTACTS} contacts."
    rows = []
    try:
        for i, item in enumerate(raw, start=1):
            if not isinstance(item, dict):
                return None, f"Contact {i} is not valid."
            name = _text(item.get("name"), 255, "Name")
            if not name:
                return None, f"Contact {i} needs a name."
            rows.append(
                {
                    "contact_type": _text(item.get("contact_type"), 60, "Contact type"),
                    "name": name,
                    "relationship": _text(item.get("relationship"), 100, "Relationship"),
                    "phone": _text(item.get("phone"), 20, "Phone"),
                    "address": _text(item.get("address"), 255, "Address"),
                    "receives_communication": bool(item.get("receives_communication", False)),
                }
            )
    except ValueError as exc:
        return None, str(exc)
    return rows, None


def clean_guarantor(raw):
    """(row or None, error). None means no guarantor is recorded."""
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, "guarantor must be an object."
    try:
        is_self = bool(raw.get("is_self", True))
        row = {
            "is_self": is_self,
            "name": _text(raw.get("name"), 255, "Guarantor name"),
            "relationship": _text(raw.get("relationship"), 100, "Guarantor relationship"),
            "phone": _text(raw.get("phone"), 20, "Guarantor phone"),
            "address": _text(raw.get("address"), 255, "Guarantor address"),
        }
    except ValueError as exc:
        return None, str(exc)
    if is_self:
        # the patient is the guarantor: nothing else to record
        row.update({"name": "", "relationship": "Self", "phone": "", "address": ""})
    elif not row["name"]:
        return None, "Guarantor needs a name, or tick that the patient is the guarantor."
    return row, None


def clean_employer(raw):
    """(row or None, error). None means no employer is recorded."""
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, "employer must be an object."
    try:
        row = {
            "employer_name": _text(raw.get("employer_name"), 255, "Employer"),
            "employment_status": _text(raw.get("employment_status"), 60, "Employment status"),
            "occupation": _text(raw.get("occupation"), 120, "Occupation"),
            "phone": _text(raw.get("phone"), 20, "Employer phone"),
        }
    except ValueError as exc:
        return None, str(exc)
    from_date = str(raw.get("from_date") or "").strip()
    if from_date and not ISO_DATE.match(from_date):
        return None, "From date must look like 2026-03-31."
    row["from_date"] = from_date or None
    if not any(v for v in row.values()):
        return None, None
    return row, None


class RegistrationExtrasView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _patient(self, request, user_id):
        if request.user.role not in STAFF_ROLES:
            return None, Response({"detail": "Not allowed."}, status=403)
        patient = Patient.objects.filter(user_id=user_id).first()
        if patient is None:
            return None, Response({"detail": "Patient not found."}, status=404)
        if not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id:
            return None, Response({"detail": "Patient not found."}, status=404)
        return patient, None

    def _payload(self, patient):
        guarantor = PatientGuarantor.objects.filter(patient=patient).first()
        employer = PatientEmployer.objects.filter(patient=patient).first()
        return {
            "contacts": [contact_row(c) for c in PatientContact.objects.filter(patient=patient)],
            "guarantor": guarantor_row(guarantor),
            "employer": employer_row(employer),
        }

    def get(self, request, user_id):
        patient, error = self._patient(request, user_id)
        if error:
            return error
        return Response(self._payload(patient))

    def put(self, request, user_id):
        patient, error = self._patient(request, user_id)
        if error:
            return error
        data = request.data
        contacts = guarantor = employer = None
        if "contacts" in data:
            contacts, err = clean_contacts(data.get("contacts"))
            if err:
                return Response({"detail": err}, status=400)
        if "guarantor" in data:
            guarantor, err = clean_guarantor(data.get("guarantor"))
            if err:
                return Response({"detail": err}, status=400)
        if "employer" in data:
            employer, err = clean_employer(data.get("employer"))
            if err:
                return Response({"detail": err}, status=400)
        with transaction.atomic():
            if "contacts" in data:
                PatientContact.objects.filter(patient=patient).delete()
                PatientContact.objects.bulk_create(
                    [PatientContact(patient=patient, sequence=i, **row) for i, row in enumerate(contacts)]
                )
            if "guarantor" in data:
                if guarantor is None:
                    PatientGuarantor.objects.filter(patient=patient).delete()
                else:
                    PatientGuarantor.objects.update_or_create(patient=patient, defaults=guarantor)
            if "employer" in data:
                if employer is None:
                    PatientEmployer.objects.filter(patient=patient).delete()
                else:
                    PatientEmployer.objects.update_or_create(patient=patient, defaults=employer)
        return Response(self._payload(patient))
