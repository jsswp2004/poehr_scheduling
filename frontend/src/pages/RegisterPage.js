import { toast } from "react-toastify";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Paper, Box, Tabs, Tab } from "@mui/material";
import { jwtDecode } from "jwt-decode";
import { getValidToken } from "../utils/auth";
import { API_BASE_URL } from "../config/api";
import FullRegistrationForm from "../components/registration/FullRegistrationForm";
import PatientsRegisterTable from "../components/registration/PatientsRegisterTable";
import QuickRegisterForm from "../components/registration/QuickRegisterForm";
import PublicSignUp from "../components/registration/PublicSignUp";
import useDuplicateCheck from "../components/registration/useDuplicateCheck";
import {
  isUsernameTaken,
  makePassword,
  makeUsername,
  mapServerErrors,
  parseDob,
  validatePublic,
  validateStaff,
} from "../components/registration/registerHelpers";

// How the patient arrives. Saving with one of these also starts their visit, which
// decides the list they appear on: Ambulatory, Emergency, or Acute (a direct admit).
const ADMIT_TYPES = [
  { value: "scheduled", label: "Scheduled (Ambulatory)" },
  { value: "emergency", label: "Emergency" },
  { value: "direct", label: "Direct admit (Inpatient)" },
];

const EMPTY_STAFF = {
  first_name: "",
  last_name: "",
  dob: "",
  legal_sex: "",
  phone_number: "",
  email: "",
  assigned_doctor: "",
  admission_type: "scheduled",
  portal_login: false,
  username: "",
  password: "",
};

const EMPTY_PUBLIC = {
  organization_name: "",
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  password: "",
  has_provider: null, // 'yes' or 'no'
  assigned_doctor: "",
};

const CONNECTION_ERROR = "Registration failed. Please check your connection and try again.";

const errorsFrom = (error, rename) => {
  const data = error?.response?.data;
  if (data && typeof data === "object") {
    const mapped = mapServerErrors(data, rename);
    if (Object.keys(mapped).length) return mapped;
    return { _form: "Registration failed. Please try again." };
  }
  return { _form: CONNECTION_ERROR };
};

function RegisterPage({ adminMode = false, onPatientRegistered, modalMode = false }) {
  const [doctors, setDoctors] = useState([]);
  const [userRole, setUserRole] = useState(null);

  // Which left-pane tab is active: the single-step Quick Register form, or the full multi-step
  // Registration (Identity/Emergency Contact/Financial/Reason for Visit/Legal Documents/Logistics).
  const [leftTab, setLeftTab] = useState("quick");

  // Set when a patient is opened from the table (or a possible match) -- tells the Registration tab's
  // FullRegistrationForm which patient to load. The nonce makes it react even if the same patient is
  // chosen twice in a row.
  const [editRequest, setEditRequest] = useState(null);

  const handleEditPatient = (patient) => {
    setEditRequest({ patient, nonce: Date.now() });
    setLeftTab("registration");
  };

  const navigate = useNavigate();
  const signedIn = !!localStorage.getItem("access_token");

  const [staff, setStaff] = useState(EMPTY_STAFF);
  const [pub, setPub] = useState(EMPTY_PUBLIC);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const dupes = useDuplicateCheck({
    first: staff.first_name,
    last: staff.last_name,
    dob: staff.dob,
    enabled: adminMode && leftTab === "quick",
  });

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const token = await getValidToken();
        if (!token) return;
        const res = await axios.get(`${API_BASE_URL}/api/users/doctors/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(res.data);
      } catch (err) {
        console.error("Failed to load doctors:", err);
      }
    };

    // Decode the current user's role from their token, used to gate the Delete icon in the patients table.
    const loadUserRole = async () => {
      try {
        const token = await getValidToken();
        if (!token) return;
        const decoded = jwtDecode(token);
        setUserRole(decoded.role || "");
      } catch (err) {
        console.error("Failed to decode user role:", err);
      }
    };

    fetchDoctors();
    loadUserRole();
  }, []);

  const changeStaff = (name, value) => {
    setStaff((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] || prev._form ? { ...prev, [name]: undefined, _form: undefined } : prev));
  };
  const changePublic = (name, value) => {
    setPub((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] || prev._form ? { ...prev, [name]: undefined, _form: undefined } : prev));
  };

  const usePatient = (patient) => {
    if (modalMode && onPatientRegistered) onPatientRegistered(patient);
    else handleEditPatient(patient);
  };

  // ---- Staff: Quick Register -------------------------------------------------------------
  const submitStaff = async (startVisit) => {
    if (submitting) return;
    const found = validateStaff(staff, { portalLogin: staff.portal_login });
    if (dupes.matches.length) {
      found._form = "Review the possible matches first. Choose Use this patient, or Not the same person.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const token = await getValidToken();
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const first = staff.first_name.trim();
      const last = staff.last_name.trim();
      const email = staff.email.trim().toLowerCase();

      const payload = {
        username: staff.portal_login ? staff.username.trim() : makeUsername(first, last),
        email,
        password: staff.portal_login ? staff.password : makePassword(),
        first_name: first,
        last_name: last,
        phone_number: staff.phone_number,
        role: "patient",
      };
      if (staff.assigned_doctor) payload.provider = staff.assigned_doctor;

      // Without a portal login the username is invented here; if it happens to be taken, try once more.
      let created;
      for (let attempt = 0; ; attempt += 1) {
        try {
          created = await axios.post(`${API_BASE_URL}/api/auth/register/`, payload, config);
          break;
        } catch (err) {
          if (!staff.portal_login && attempt === 0 && isUsernameTaken(err?.response?.data)) {
            payload.username = makeUsername(first, last);
            continue;
          }
          throw err;
        }
      }

      // The register endpoint has no date of birth or sex, so save them on the patient record now.
      const userId = created?.data?.id;
      try {
        const identity = new FormData();
        identity.append("date_of_birth", parseDob(staff.dob));
        identity.append("legal_sex", staff.legal_sex);
        await axios.patch(`${API_BASE_URL}/api/users/patients/by-user/${userId}/edit/`, identity, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "multipart/form-data" },
        });
      } catch (identityError) {
        console.error("Could not save date of birth and sex:", identityError);
        toast.warning("Patient registered, but the date of birth and sex were not saved. Add them in the Full Registration tab.");
      }

      toast.success("Registration successful!");

      // The patient's record is needed to hand it to a modal caller, and to start a visit.
      let createdPatient = null;
      if ((modalMode && onPatientRegistered) || startVisit) {
        try {
          const lookup = await axios.get(`${API_BASE_URL}/api/users/patients/`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { search: email, page_size: 5 },
          });
          const rows = lookup.data.results || [];
          createdPatient =
            rows.find((p) => userId && p.user_id === userId) ||
            rows.find((p) => p.username === payload.username) ||
            rows[0] ||
            null;
        } catch (fetchError) {
          console.error("Failed to fetch registered patient:", fetchError);
        }
      }

      // Start the visit with the chosen arrival so the patient lands on the right list.
      if (startVisit) {
        const label = ADMIT_TYPES.find((t) => t.value === staff.admission_type)?.label;
        if (!createdPatient) {
          toast.warning(`Patient registered, but the ${label} visit could not be started. Use the Full Registration tab.`);
        } else {
          try {
            await axios.post(
              `${API_BASE_URL}/api/users/registrations/`,
              { patient: createdPatient.id, admission_type: staff.admission_type },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`${label} visit started`);
          } catch (visitError) {
            const detail =
              visitError.response?.data?.detail || Object.values(visitError.response?.data || {}).flat().join(" ");
            toast.warning(`Patient registered, but the visit could not be started. ${detail || ""}`.trim());
          }
        }
      }

      if (modalMode && onPatientRegistered) {
        if (createdPatient) onPatientRegistered(createdPatient);
      } else {
        // Clear the form so the registrar can start the next patient, and refresh the list.
        setStaff({ ...EMPTY_STAFF, admission_type: staff.admission_type });
        setErrors({});
        dupes.reset();
        setRefreshKey((n) => n + 1);
      }
    } catch (error) {
      console.error("Registration error:", error);
      setErrors(errorsFrom(error));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Public sign-up ----------------------------------------------------------------------
  const submitPublic = async () => {
    if (submitting) return;
    const found = validatePublic(pub, { needsOrganization: !signedIn });
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const token = await getValidToken();
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const email = pub.email.trim().toLowerCase();
      const payload = {
        // Signing in uses the email address, so it is also the username.
        username: email,
        email,
        password: pub.password,
        first_name: pub.first_name.trim(),
        last_name: pub.last_name.trim(),
        phone_number: pub.phone_number,
        role: "patient",
      };
      if (pub.assigned_doctor) payload.provider = pub.assigned_doctor;

      await axios.post(`${API_BASE_URL}/api/auth/register/`, payload, config);
      toast.success("Registration successful!");
      navigate("/login");
    } catch (error) {
      console.error("Registration error:", error);
      const mapped = errorsFrom(error, { username: "email" });
      if (isUsernameTaken(error?.response?.data) && !error.response.data.email) {
        mapped.email = "An account with this email already exists. Try signing in instead.";
      }
      setErrors(mapped);
    } finally {
      setSubmitting(false);
    }
  };

  if (!adminMode) {
    return (
      <PublicSignUp
        values={pub}
        errors={errors}
        onChange={changePublic}
        onSubmit={submitPublic}
        submitting={submitting}
        doctors={doctors}
        needsOrganization={!signedIn}
        signedIn={signedIn}
      />
    );
  }

  return (
    <Box sx={{ mt: 0, width: "100%", px: modalMode ? 0 : 2, py: 1 }}>
      <Paper
        elevation={2}
        sx={{
          borderRadius: 3,
          border: "1px solid #e2e8f0",
          minHeight: "60vh",
          maxHeight: modalMode ? "none" : "calc(100vh - 200px)",
          overflowY: "auto",
          overflowX: "hidden",
          p: 2,
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          gap: 2,
          width: "100%",
          boxSizing: "border-box",
          backgroundColor: "#fff",
        }}
      >
        {/* Left pane: the registration forms */}
        <Box
          sx={{
            flex: modalMode ? "1 1 auto" : { xs: "0 0 auto", lg: "1 1 0" }, // half of the card; the patients table gets the other half
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Tabs
            value={leftTab}
            onChange={(e, v) => setLeftTab(v)}
            sx={{ mb: 2, flexShrink: 0, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}
          >
            <Tab label="Quick Register" value="quick" />
            <Tab label="Full Registration" value="registration" />
          </Tabs>

          {leftTab === "quick" && (
            <Box sx={{ flex: 1, overflowY: "auto", pr: 1, minHeight: 0 }}>
              <QuickRegisterForm
                values={staff}
                errors={errors}
                onChange={changeStaff}
                onSubmit={submitStaff}
                submitting={submitting}
                modalMode={modalMode}
                doctors={doctors}
                dupes={dupes.matches}
                onDismissDupes={dupes.dismiss}
                onUsePatient={usePatient}
              />
            </Box>
          )}

          {leftTab === "registration" && (
            <Box sx={{ flex: 1, overflowY: "auto", pr: 1, minHeight: 0 }}>
              <FullRegistrationForm
                doctors={doctors}
                initialPatient={editRequest?.patient}
                initialPatientNonce={editRequest?.nonce}
                userRole={userRole}
              />
            </Box>
          )}
        </Box>

        {/* Right pane: find a patient, see visit status, open or start a visit */}
        {!modalMode && (
          <Box sx={{ flex: "1 1 0", minWidth: 0, pl: { lg: 2 }, borderLeft: { lg: "1px solid #eef1f6" } }}>
            <PatientsRegisterTable userRole={userRole} onEdit={handleEditPatient} refreshKey={refreshKey} />
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default RegisterPage;
