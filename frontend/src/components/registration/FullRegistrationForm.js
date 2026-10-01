import React, { useState } from "react";
import axios from "axios";
import Select from "react-select";
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Tabs,
  Tab,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from "@mui/material";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { toast } from "react-toastify";
import { getValidToken } from "../../utils/auth";
import { API_BASE_URL, apiEndpoints } from "../../config/api";

// Every field the Registration tab captures, grouped into the six sub-tabs
// the user asked for. Patient Identity/Emergency Contact/Financial/Legal
// Documents live on the Patient record itself (persist visit to visit);
// Reason for Visit/Logistics live on a new per-visit Registration record.
const SUB_TABS = [
  { value: "identity", label: "Patient Identity" },
  { value: "emergency", label: "Emergency Contact" },
  { value: "financial", label: "Financial Information" },
  { value: "reason", label: "Reason for Visit" },
  { value: "legal", label: "Legal Documents" },
  { value: "logistics", label: "Logistics" },
];

const LEGAL_DOCS = [
  { key: "consent_to_treat", label: "Consent to Treat" },
  { key: "privacy_acknowledgment", label: "Privacy Acknowledgment" },
  {
    key: "financial_responsibility_agreement",
    label: "Financial Responsibility Agreement",
  },
  { key: "assignment_of_benefits", label: "Assignment of Benefits" },
  { key: "release_of_information", label: "Release of Information" },
];

const EMPTY_PATIENT_FIELDS = {
  legal_sex: "",
  ssn_last4: "",
  preferred_language: "",
  date_of_birth: "",
  address: "",
  phone_number: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  emergency_contact_address: "",
  insurance_payer_name: "",
  insurance_member_id: "",
  insurance_group_number: "",
  policyholder_name: "",
  policyholder_dob: "",
  copay_deductible_status: "",
  authorization_requirements: "",
  secondary_insurance: "",
  consent_to_treat: false,
  privacy_acknowledgment: false,
  financial_responsibility_agreement: false,
  assignment_of_benefits: false,
  release_of_information: false,
};

const EMPTY_VISIT_FIELDS = {
  reason_for_visit: "",
  presenting_problem: "",
  scheduled_procedure: "",
  referring_physician: "",
  current_diagnoses: "",
  admission_type: "",
  arrival_time: "",
  assigned_location: "",
  attending_provider: "",
};

function FullRegistrationForm({ doctors = [] }) {
  const [mode, setMode] = useState("new"); // "new" | "existing"
  const [activeSubTab, setActiveSubTab] = useState("identity");

  // "Existing Patient" search
  const [patientOptions, setPatientOptions] = useState([]);
  const [searchingPatients, setSearchingPatients] = useState(false);

  // The active patient this Registration applies to (set either by
  // searching for an existing one, or by creating a new one below).
  const [activePatient, setActivePatient] = useState(null);
  const [mrn, setMrn] = useState(null);
  const [visitNumber, setVisitNumber] = useState(null);
  const [registrationId, setRegistrationId] = useState(null);

  // New-patient quick-create fields (same minimal set Quick Register uses)
  const [newPatient, setNewPatient] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    password: "",
  });
  const [creatingPatient, setCreatingPatient] = useState(false);

  const [patientFields, setPatientFields] = useState(EMPTY_PATIENT_FIELDS);
  const [visitFields, setVisitFields] = useState(EMPTY_VISIT_FIELDS);
  const [legalFiles, setLegalFiles] = useState({});
  const [saving, setSaving] = useState(false);

  const resetForActivePatient = (patient) => {
    setActivePatient(patient);
    setMrn(patient.mrn || null);
    setPatientFields({
      legal_sex: patient.legal_sex || "",
      ssn_last4: patient.ssn_last4 || "",
      preferred_language: patient.preferred_language || "",
      date_of_birth: patient.date_of_birth || "",
      address: patient.address || "",
      phone_number: patient.phone_number || "",
      emergency_contact_name: patient.emergency_contact_name || "",
      emergency_contact_relationship: patient.emergency_contact_relationship || "",
      emergency_contact_phone: patient.emergency_contact_phone || "",
      emergency_contact_address: patient.emergency_contact_address || "",
      insurance_payer_name: patient.insurance_payer_name || "",
      insurance_member_id: patient.insurance_member_id || "",
      insurance_group_number: patient.insurance_group_number || "",
      policyholder_name: patient.policyholder_name || "",
      policyholder_dob: patient.policyholder_dob || "",
      copay_deductible_status: patient.copay_deductible_status || "",
      authorization_requirements: patient.authorization_requirements || "",
      secondary_insurance: patient.secondary_insurance || "",
      consent_to_treat: !!patient.consent_to_treat,
      privacy_acknowledgment: !!patient.privacy_acknowledgment,
      financial_responsibility_agreement: !!patient.financial_responsibility_agreement,
      assignment_of_benefits: !!patient.assignment_of_benefits,
      release_of_information: !!patient.release_of_information,
    });
    setVisitFields(EMPTY_VISIT_FIELDS);
    setRegistrationId(null);
    setVisitNumber(null);
    setLegalFiles({});
  };

  const handlePatientSearch = async (inputValue) => {
    if (!inputValue || inputValue.length < 2) {
      setPatientOptions([]);
      return;
    }
    setSearchingPatients(true);
    try {
      const token = await getValidToken();
      const res = await axios.get(apiEndpoints.patients, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: inputValue, page_size: 10 },
      });
      const results = res.data.results || res.data || [];
      setPatientOptions(
        results.map((p) => ({
          value: p.id,
          label: `${p.first_name} ${p.last_name}${p.mrn ? ` (${p.mrn})` : ""}`,
          patient: p,
        }))
      );
    } catch (err) {
      console.error("Patient search failed:", err);
    } finally {
      setSearchingPatients(false);
    }
  };

  const handleCreatePatient = async () => {
    if (!newPatient.first_name || !newPatient.last_name || !newPatient.username || !newPatient.password) {
      toast.error("First name, last name, username, and password are required.");
      return;
    }
    setCreatingPatient(true);
    try {
      const token = await getValidToken();
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.post(
        `${API_BASE_URL}/api/auth/register/`,
        {
          username: newPatient.username.trim(),
          email: newPatient.email.trim().toLowerCase(),
          password: newPatient.password,
          first_name: newPatient.first_name.trim(),
          last_name: newPatient.last_name.trim(),
          role: "patient",
        },
        config
      );
      const patientRes = await axios.get(apiEndpoints.patients, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: newPatient.username },
      });
      const results = patientRes.data.results || patientRes.data || [];
      if (results.length > 0) {
        resetForActivePatient(results[0]);
        toast.success("Patient created -- continue with the Registration tabs below.");
      } else {
        toast.error("Patient was created, but could not be loaded for registration.");
      }
    } catch (err) {
      console.error("Failed to create patient:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to create patient.";
      toast.error(detail);
    } finally {
      setCreatingPatient(false);
    }
  };

  const handlePatientFieldChange = (name, value) => {
    setPatientFields((prev) => ({ ...prev, [name]: value }));
  };

  const handleVisitFieldChange = (name, value) => {
    setVisitFields((prev) => ({ ...prev, [name]: value }));
  };

  const handleLegalFileChange = (key, file) => {
    setLegalFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleSave = async () => {
    if (!activePatient) {
      toast.error("Select or create a patient first.");
      return;
    }
    setSaving(true);
    try {
      const token = await getValidToken();
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Patient-level fields (Identity/Emergency Contact/Financial/Legal
      // Documents) -- multipart so any attached legal-document scans ride
      // along in the same request.
      const patientForm = new FormData();
      Object.entries(patientFields).forEach(([key, value]) => {
        // Skip null/undefined/empty-string -- in particular, DRF's DateField
        // (date_of_birth, policyholder_dob) rejects "" as invalid, and PUT
        // only overwrites fields actually present, so omitting an untouched
        // blank field just leaves the patient's existing value alone.
        if (value === null || value === undefined || value === "") return;
        patientForm.append(key, typeof value === "boolean" ? String(value) : value);
      });
      Object.entries(legalFiles).forEach(([key, file]) => {
        if (file) patientForm.append(`${key}_file`, file);
      });

      const patientRes = await axios.put(
        `${API_BASE_URL}/api/users/patients/by-user/${activePatient.user_id}/edit/`,
        patientForm,
        { headers: { ...headers, "Content-Type": "multipart/form-data" } }
      );
      setMrn(patientRes.data.mrn || mrn);

      // 2. Visit-level fields (Reason for Visit/Logistics)
      const visitPayload = {
        ...visitFields,
        patient: activePatient.id,
        arrival_time: visitFields.arrival_time || null,
        attending_provider: visitFields.attending_provider || null,
      };
      let regRes;
      if (registrationId) {
        regRes = await axios.patch(
          apiEndpoints.registration(registrationId),
          visitPayload,
          { headers }
        );
      } else {
        regRes = await axios.post(apiEndpoints.registrations, visitPayload, { headers });
        setRegistrationId(regRes.data.id);
      }
      setVisitNumber(regRes.data.visit_number || visitNumber);

      toast.success("Registration saved.");
    } catch (err) {
      console.error("Failed to save registration:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to save registration.";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ToggleButtonGroup
        value={mode}
        exclusive
        size="small"
        onChange={(e, val) => val && setMode(val)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="new">New Patient</ToggleButton>
        <ToggleButton value="existing">Existing Patient</ToggleButton>
      </ToggleButtonGroup>

      {mode === "new" && !activePatient && (
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="First Name"
              size="small"
              fullWidth
              value={newPatient.first_name}
              onChange={(e) => setNewPatient((p) => ({ ...p, first_name: e.target.value }))}
            />
            <TextField
              label="Last Name"
              size="small"
              fullWidth
              value={newPatient.last_name}
              onChange={(e) => setNewPatient((p) => ({ ...p, last_name: e.target.value }))}
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Username"
              size="small"
              fullWidth
              value={newPatient.username}
              onChange={(e) => setNewPatient((p) => ({ ...p, username: e.target.value }))}
            />
            <TextField
              label="Email"
              size="small"
              fullWidth
              value={newPatient.email}
              onChange={(e) => setNewPatient((p) => ({ ...p, email: e.target.value }))}
            />
          </Stack>
          <TextField
            label="Password"
            type="password"
            size="small"
            value={newPatient.password}
            onChange={(e) => setNewPatient((p) => ({ ...p, password: e.target.value }))}
          />
          <Button
            variant="contained"
            onClick={handleCreatePatient}
            disabled={creatingPatient}
          >
            {creatingPatient ? "Creating..." : "Create Patient & Continue"}
          </Button>
        </Stack>
      )}

      {mode === "existing" && !activePatient && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Search by name
          </Typography>
          <Select
            options={patientOptions}
            onInputChange={(val) => {
              handlePatientSearch(val);
              return val;
            }}
            onChange={(selected) => selected && resetForActivePatient(selected.patient)}
            isLoading={searchingPatients}
            placeholder="Type a patient's name..."
            isClearable
            styles={{
              control: (base) => ({ ...base, minHeight: 40 }),
              menu: (base) => ({ ...base, zIndex: 9999 }),
            }}
          />
        </Box>
      )}

      {activePatient && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: "#f0f6ff",
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              {activePatient.first_name} {activePatient.last_name}
            </Typography>
            <Stack direction="row" spacing={1}>
              {mrn && <Chip size="small" label={`MRN: ${mrn}`} />}
              {visitNumber && <Chip size="small" color="primary" label={`Visit: ${visitNumber}`} />}
              <Button
                size="small"
                onClick={() => {
                  setActivePatient(null);
                  setPatientFields(EMPTY_PATIENT_FIELDS);
                  setVisitFields(EMPTY_VISIT_FIELDS);
                  setRegistrationId(null);
                  setMrn(null);
                  setVisitNumber(null);
                }}
              >
                Change Patient
              </Button>
            </Stack>
          </Box>

          <Tabs
            value={activeSubTab}
            onChange={(e, v) => setActiveSubTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}
          >
            {SUB_TABS.map((t) => (
              <Tab key={t.value} value={t.value} label={t.label} />
            ))}
          </Tabs>

          <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
            {activeSubTab === "identity" && (
              <Stack spacing={2}>
                <TextField
                  label="Legal Name"
                  size="small"
                  fullWidth
                  value={`${activePatient.first_name} ${activePatient.last_name}`}
                  disabled
                  helperText="Edit from the patient's account record (Quick Register / Patients tab)"
                />
                <TextField
                  label="Date of Birth"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={patientFields.date_of_birth || ""}
                  onChange={(e) => handlePatientFieldChange("date_of_birth", e.target.value)}
                />
                <TextField
                  label="Address"
                  size="small"
                  fullWidth
                  value={patientFields.address}
                  onChange={(e) => handlePatientFieldChange("address", e.target.value)}
                />
                <TextField
                  label="Phone Number"
                  size="small"
                  fullWidth
                  value={patientFields.phone_number}
                  onChange={(e) => handlePatientFieldChange("phone_number", e.target.value)}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel id="legal-sex-label">Legal Sex</InputLabel>
                  <MUISelect
                    labelId="legal-sex-label"
                    label="Legal Sex"
                    value={patientFields.legal_sex}
                    onChange={(e) => handlePatientFieldChange("legal_sex", e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    <MenuItem value="M">Male</MenuItem>
                    <MenuItem value="F">Female</MenuItem>
                    <MenuItem value="X">Unspecified/Other</MenuItem>
                  </MUISelect>
                </FormControl>
                <TextField
                  label="Social Security Number (last 4 digits)"
                  size="small"
                  fullWidth
                  inputProps={{ maxLength: 4 }}
                  value={patientFields.ssn_last4}
                  onChange={(e) =>
                    handlePatientFieldChange("ssn_last4", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                />
                <TextField
                  label="Preferred Language"
                  size="small"
                  fullWidth
                  value={patientFields.preferred_language}
                  onChange={(e) => handlePatientFieldChange("preferred_language", e.target.value)}
                />
                <TextField
                  label="Email"
                  size="small"
                  fullWidth
                  value={activePatient.email || ""}
                  disabled
                  helperText="Edit from the patient's account record"
                />
              </Stack>
            )}

            {activeSubTab === "emergency" && (
              <Stack spacing={2}>
                <TextField
                  label="Contact Name"
                  size="small"
                  fullWidth
                  value={patientFields.emergency_contact_name}
                  onChange={(e) => handlePatientFieldChange("emergency_contact_name", e.target.value)}
                />
                <TextField
                  label="Relationship"
                  size="small"
                  fullWidth
                  value={patientFields.emergency_contact_relationship}
                  onChange={(e) =>
                    handlePatientFieldChange("emergency_contact_relationship", e.target.value)
                  }
                />
                <TextField
                  label="Phone Number"
                  size="small"
                  fullWidth
                  value={patientFields.emergency_contact_phone}
                  onChange={(e) => handlePatientFieldChange("emergency_contact_phone", e.target.value)}
                />
                <TextField
                  label="Address"
                  size="small"
                  fullWidth
                  value={patientFields.emergency_contact_address}
                  onChange={(e) =>
                    handlePatientFieldChange("emergency_contact_address", e.target.value)
                  }
                />
              </Stack>
            )}

            {activeSubTab === "financial" && (
              <Stack spacing={2}>
                <TextField
                  label="Insurance Payer Name"
                  size="small"
                  fullWidth
                  value={patientFields.insurance_payer_name}
                  onChange={(e) => handlePatientFieldChange("insurance_payer_name", e.target.value)}
                />
                <TextField
                  label="Member ID"
                  size="small"
                  fullWidth
                  value={patientFields.insurance_member_id}
                  onChange={(e) => handlePatientFieldChange("insurance_member_id", e.target.value)}
                />
                <TextField
                  label="Group Number"
                  size="small"
                  fullWidth
                  value={patientFields.insurance_group_number}
                  onChange={(e) => handlePatientFieldChange("insurance_group_number", e.target.value)}
                />
                <TextField
                  label="Policyholder Name"
                  size="small"
                  fullWidth
                  value={patientFields.policyholder_name}
                  onChange={(e) => handlePatientFieldChange("policyholder_name", e.target.value)}
                />
                <TextField
                  label="Policyholder Date of Birth"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={patientFields.policyholder_dob || ""}
                  onChange={(e) => handlePatientFieldChange("policyholder_dob", e.target.value)}
                />
                <TextField
                  label="Copay / Deductible Status"
                  size="small"
                  fullWidth
                  value={patientFields.copay_deductible_status}
                  onChange={(e) =>
                    handlePatientFieldChange("copay_deductible_status", e.target.value)
                  }
                />
                <TextField
                  label="Authorization Requirements"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={patientFields.authorization_requirements}
                  onChange={(e) =>
                    handlePatientFieldChange("authorization_requirements", e.target.value)
                  }
                />
                <TextField
                  label="Secondary Insurance"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={patientFields.secondary_insurance}
                  onChange={(e) => handlePatientFieldChange("secondary_insurance", e.target.value)}
                />
              </Stack>
            )}

            {activeSubTab === "reason" && (
              <Stack spacing={2}>
                <TextField
                  label="Reason for Visit"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={visitFields.reason_for_visit}
                  onChange={(e) => handleVisitFieldChange("reason_for_visit", e.target.value)}
                />
                <TextField
                  label="Presenting Problem"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={visitFields.presenting_problem}
                  onChange={(e) => handleVisitFieldChange("presenting_problem", e.target.value)}
                />
                <TextField
                  label="Scheduled Procedure"
                  size="small"
                  fullWidth
                  value={visitFields.scheduled_procedure}
                  onChange={(e) => handleVisitFieldChange("scheduled_procedure", e.target.value)}
                />
                <TextField
                  label="Referring Physician"
                  size="small"
                  fullWidth
                  value={visitFields.referring_physician}
                  onChange={(e) => handleVisitFieldChange("referring_physician", e.target.value)}
                />
                <TextField
                  label="Medical History"
                  size="small"
                  fullWidth
                  multiline
                  rows={3}
                  value={activePatient.medical_history || ""}
                  disabled
                  helperText="Edit from the patient's record on the Patients tab"
                />
                <TextField
                  label="Current Diagnoses"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={visitFields.current_diagnoses}
                  onChange={(e) => handleVisitFieldChange("current_diagnoses", e.target.value)}
                />
              </Stack>
            )}

            {activeSubTab === "legal" && (
              <Stack spacing={2}>
                {LEGAL_DOCS.map((doc) => (
                  <Box
                    key={doc.key}
                    sx={{
                      p: 1.5,
                      border: "1px solid #e0e0e0",
                      borderRadius: 1.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!patientFields[doc.key]}
                          onChange={(e) => handlePatientFieldChange(doc.key, e.target.checked)}
                        />
                      }
                      label={doc.label}
                    />
                    <Stack direction="row" spacing={1} alignItems="center">
                      {legalFiles[doc.key] && (
                        <Chip
                          size="small"
                          icon={<CheckCircleIcon />}
                          label={legalFiles[doc.key].name}
                          onDelete={() => handleLegalFileChange(doc.key, null)}
                        />
                      )}
                      <Tooltip title="Scan or upload the signed document (opens your camera on mobile)">
                        <IconButton component="label" size="small">
                          <PhotoCameraIcon fontSize="small" />
                          <input
                            type="file"
                            hidden
                            accept="image/*,application/pdf"
                            capture="environment"
                            onChange={(e) =>
                              handleLegalFileChange(doc.key, e.target.files?.[0] || null)
                            }
                          />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ))}
                <Typography variant="caption" color="text.secondary">
                  Checking a box records who/when it was acknowledged. The camera icon lets you
                  attach a scanned or photographed copy of the signed paper form.
                </Typography>
              </Stack>
            )}

            {activeSubTab === "logistics" && (
              <Stack spacing={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="admission-type-label">Admission Type</InputLabel>
                  <MUISelect
                    labelId="admission-type-label"
                    label="Admission Type"
                    value={visitFields.admission_type}
                    onChange={(e) => handleVisitFieldChange("admission_type", e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                    <MenuItem value="emergency">Emergency</MenuItem>
                    <MenuItem value="direct">Direct</MenuItem>
                  </MUISelect>
                </FormControl>
                <TextField
                  label="Arrival Time"
                  type="datetime-local"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={visitFields.arrival_time}
                  onChange={(e) => handleVisitFieldChange("arrival_time", e.target.value)}
                />
                <TextField
                  label="Assigned Location (unit, room, bed)"
                  size="small"
                  fullWidth
                  placeholder="e.g. 3 West, Rm 312, Bed B"
                  value={visitFields.assigned_location}
                  onChange={(e) => handleVisitFieldChange("assigned_location", e.target.value)}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel id="attending-provider-label">Attending Provider</InputLabel>
                  <MUISelect
                    labelId="attending-provider-label"
                    label="Attending Provider"
                    value={visitFields.attending_provider}
                    onChange={(e) => handleVisitFieldChange("attending_provider", e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    {doctors.map((doc) => (
                      <MenuItem key={doc.id} value={doc.id}>
                        Dr. {doc.first_name} {doc.last_name}
                      </MenuItem>
                    ))}
                  </MUISelect>
                </FormControl>
                <Divider />
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Visit Number"
                    size="small"
                    fullWidth
                    value={visitNumber || "Generated on save"}
                    disabled
                  />
                  <TextField
                    label="Medical Record Number"
                    size="small"
                    fullWidth
                    value={mrn || "Generated on save"}
                    disabled
                  />
                </Stack>
              </Stack>
            )}
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={handleSave}
            disabled={saving}
            sx={{ mt: 2 }}
          >
            {saving ? "Saving..." : "Save Registration"}
          </Button>
        </>
      )}
    </Box>
  );
}

export default FullRegistrationForm;
