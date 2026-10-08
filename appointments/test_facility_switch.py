"""System admin facility picker: `X-Facility-Id` makes a request act for that facility."""

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import ChartTabLayout, PatientHeaderConfig
from .test_patient_header import Base

DEFAULTS = "/api/chart-tabs/defaults/"
TABS = [{"key": "patient_list", "visible": True}, {"key": "orders", "visible": False}]


class FacilitySwitchTests(Base):
    def client_for(self, user, facility=None):
        c = APIClient()
        extra = {"HTTP_X_FACILITY_ID": str(facility.pk)} if facility is not None else {}
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}", **extra)
        return c

    def put_defaults(self, client, **extra):
        return client.put(DEFAULTS, {"care_setting": "ambulatory", "items": TABS, **extra}, format="json")

    def test_sysadmin_header_saves_for_that_facility_only(self):
        res = self.put_defaults(self.client_for(self.sysadmin, self.other_org))
        self.assertEqual(res.status_code, 200, res.content)
        rows = ChartTabLayout.objects.filter(user=None, care_setting="ambulatory")
        self.assertEqual([r.organization_id for r in rows], [self.other_org.pk])

    def test_switching_facility_changes_where_it_saves(self):
        self.put_defaults(self.client_for(self.sysadmin, self.org))
        self.put_defaults(self.client_for(self.sysadmin, self.other_org))
        orgs = set(ChartTabLayout.objects.filter(user=None).values_list("organization_id", flat=True))
        self.assertEqual(orgs, {self.org.pk, self.other_org.pk})

    def test_read_follows_the_facility(self):
        self.put_defaults(self.client_for(self.sysadmin, self.other_org))
        mine = self.client_for(self.sysadmin, self.other_org).get(DEFAULTS).json()
        other = self.client_for(self.sysadmin, self.org).get(DEFAULTS).json()
        self.assertEqual(mine["organization"], self.other_org.pk)
        self.assertTrue(mine["settings"]["ambulatory"]["customized"])
        self.assertFalse(other["settings"]["ambulatory"]["customized"])

    def test_header_config_follows_the_facility(self):
        c = self.client_for(self.sysadmin, self.other_org)
        items = [{"key": "name", "visible": True}, {"key": "mrn", "visible": True}]
        res = c.put("/api/patient-header-config/", {"items": items}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(PatientHeaderConfig.objects.filter(organization=self.other_org).exists())
        self.assertFalse(PatientHeaderConfig.objects.filter(organization=self.org).exists())

    def test_header_items_list_is_limited_to_the_facility(self):
        from .models import HeaderFieldDefinition

        HeaderFieldDefinition.objects.create(organization=self.org, key="a", label="Alpha")
        HeaderFieldDefinition.objects.create(organization=self.other_org, key="b", label="Beta")
        labels = [f["label"] for f in self.client_for(self.sysadmin, self.other_org).get("/api/patient-header-fields/").json()]
        self.assertEqual(labels, ["Beta"])

    def test_other_roles_cannot_use_the_header(self):
        res = self.put_defaults(self.client_for(self.admin, self.other_org))
        self.assertEqual(res.status_code, 200, res.content)
        orgs = list(ChartTabLayout.objects.filter(user=None).values_list("organization_id", flat=True))
        self.assertEqual(orgs, [self.org.pk])  # saved for the admin's own facility

    def test_doctor_header_is_ignored_for_reads_too(self):
        res = self.client_for(self.doctor, self.other_org).get("/api/chart-tabs/")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["organization"], self.org.pk)

    def test_unknown_facility_is_refused(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.sysadmin).access_token}", HTTP_X_FACILITY_ID="999999")
        self.assertEqual(c.get(DEFAULTS).status_code, 400)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.sysadmin).access_token}", HTTP_X_FACILITY_ID="abc")
        self.assertEqual(c.get(DEFAULTS).status_code, 400)

    def test_no_header_keeps_the_old_behaviour(self):
        c = self.client_for(self.sysadmin)
        self.assertEqual(c.get(DEFAULTS).status_code, 400)  # no facility chosen, same as before
        self.assertEqual(c.get(DEFAULTS, {"org": self.other_org.pk}).status_code, 200)

    def test_switch_is_never_written_to_the_user_record(self):
        from rest_framework.test import APIRequestFactory

        from poehr_scheduling_backend.tenancy import TenantAwareJWTAuthentication

        req = APIRequestFactory().get(
            "/api/chart-tabs/",
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.sysadmin).access_token}",
            HTTP_X_FACILITY_ID=str(self.org.pk),
        )
        user, _ = TenantAwareJWTAuthentication().authenticate(req)
        self.assertEqual(user.organization_id, self.org.pk)  # acting for the facility
        user.save()
        self.sysadmin.refresh_from_db()
        self.assertIsNone(self.sysadmin.organization_id)  # the real record is untouched
        self.assertEqual(user.organization_id, self.org.pk)  # and still acting afterward
