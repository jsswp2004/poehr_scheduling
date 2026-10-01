import { toast } from "react-toastify";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  Tabs,
  Tab,
} from "@mui/material";
import Select from "react-select";
import { jwtDecode } from "jwt-decode";
import { getValidToken } from "../utils/auth";
import { API_BASE_URL } from "../config/api";
import FullRegistrationForm from "../components/registration/FullRegistrationForm";
import PatientsRegisterTable from "../components/registration/PatientsRegisterTable";

function RegisterPage({ adminMode = false, onPatientRegistered, modalMode = false }) {
  const [hasProvider, setHasProvider] = useState(null); // 'yes' or 'no'
  const [doctors, setDoctors] = useState([]);
  const [userRole, setUserRole] = useState(null);

  // Which left-pane tab is active: the original single-step Quick Register
  // form, or the full multi-tab Registration (Identity/Emergency
  // Contact/Financial/Reason for Visit/Legal Documents/Logistics).
  const [leftTab, setLeftTab] = useState("quick");

  // Set when the right-pane table's Edit icon is clicked -- tells the
  // Registration tab's FullRegistrationForm which patient to load into its
  // "Existing Patient" flow. The nonce forces the form to react even if the
  // same patient object is clicked twice in a row.
  const [editRequest, setEditRequest] = useState(null);

  const handleEditPatient = (patient) => {
    setEditRequest({ patient, nonce: Date.now() });
    setLeftTab("registration");
  };

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: adminMode ? "patient" : "patient",
    assigned_doctor: "",
    phone_number: "",
    organization_name: "",
  });
  useEffect(() => {
    // Function to fetch doctors with valid token
    const fetchDoctors = async () => {
      try {
        const token = await getValidToken();
        if (!token) {
          console.log("No valid token available for fetching doctors");
          return;
        }

        const res = await axios.get(
          `${API_BASE_URL}/api/users/doctors/`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setDoctors(res.data);
      } catch (err) {
        console.error("Failed to load doctors:", err);
      }
    };

    // Function to fetch current user info if logged in
    const fetchCurrentUserOrg = async () => {
      try {
        const token = await getValidToken();
        if (!token) {
          console.log("No valid token available for fetching user org");
          return;
        }

        // Get current user's info
        const response = await axios.get(
          `${API_BASE_URL}/api/users/me/`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const userData = response.data;

        // Set the organization name to the current user's organization
        if (userData.organization_name) {
          setFormData((prevState) => ({
            ...prevState,
            organization_name: userData.organization_name,
          }));
        }
      } catch (error) {
        console.error("Failed to fetch current user information:", error);
      }
    };

    // Decode the current user's role from their token, used to gate the
    // Delete icon in the right-pane patients table (PatientsRegisterTable).
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
    fetchCurrentUserOrg();
    loadUserRole();
  }, []);
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (
      hasProvider === "no" &&
      (!formData.email || !formData.phone_number)
    ) {
      toast.error("Please fill out both email and phone number.");
      return;
    }

    // Username validation
    if (!formData.username || formData.username.length < 3) {
      toast.error("Username must be at least 3 characters long.");
      return;
    }

    // Email validation
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    // Password validation
    if (!formData.password || formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    const payload = {
      username: formData.username.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      phone_number: formData.phone_number,
      role: "patient",
    };

    // Only add provider if it's set
    if (formData.assigned_doctor) {
      payload.provider = formData.assigned_doctor;
    }

    try {
      // Get valid token if user is logged in
      const token = await getValidToken();
      const config = token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {};

      const response = await axios.post(
        `${API_BASE_URL}/api/auth/register/`,
        payload,
        config
      );

      console.log("Registration response:", response.data);
      toast.success("Registration successful!");

      // If in admin mode, fetch the created patient so a modal caller (e.g.
      // the calendar's quick-register flow) gets the full record -- the
      // right pane here is now the all-patients table, not a single-patient
      // display, so there's nothing else to populate.
      if (adminMode && token) {
        if (modalMode && onPatientRegistered) {
          try {
            const patientResponse = await axios.get(
              `${API_BASE_URL}/api/users/patients/`,
              {
                headers: { Authorization: `Bearer ${token}` },
                params: { search: formData.username },
              }
            );
            if (patientResponse.data.results && patientResponse.data.results.length > 0) {
              onPatientRegistered(patientResponse.data.results[0]);
            }
          } catch (fetchError) {
            console.error("Failed to fetch registered patient:", fetchError);
          }
        } else {
          // Clear the Quick Register form so the registrar can start the
          // next patient right away.
          setFormData({
            username: "",
            email: "",
            password: "",
            first_name: "",
            last_name: "",
            role: adminMode ? "patient" : "patient",
            assigned_doctor: "",
            phone_number: "",
            organization_name: "",
          });
          setHasProvider(null);
        }
      } else if (!adminMode) {
        // Only navigate to login for non-admin mode
        navigate("/login");
      }
    } catch (error) {
      console.error("Registration error:", error);

      // Log detailed error information
      if (error.response) {
        console.error("Error response data:", error.response.data);
        console.error("Error response status:", error.response.status);
        console.error("Error response headers:", error.response.headers);
      }

      // Handle specific validation errors
      if (error.response?.data) {
        const errorData = error.response.data;

        // Handle field-specific errors
        if (typeof errorData === 'object') {
          const errorMessages = [];

          // Check for specific field errors
          Object.keys(errorData).forEach(field => {
            const fieldErrors = errorData[field];
            if (Array.isArray(fieldErrors)) {
              fieldErrors.forEach(err => {
                if (field === 'username') {
                  errorMessages.push(`Username: ${err}`);
                } else if (field === 'email') {
                  errorMessages.push(`Email: ${err}`);
                } else if (field === 'password') {
                  errorMessages.push(`Password: ${err}`);
                } else if (field === 'phone_number') {
                  errorMessages.push(`Phone: ${err}`);
                } else {
                  errorMessages.push(`${field}: ${err}`);
                }
              });
            } else if (typeof fieldErrors === 'string') {
              errorMessages.push(`${field}: ${fieldErrors}`);
            }
          });

          if (errorMessages.length > 0) {
            errorMessages.forEach(msg => toast.error(msg));
            return;
          }
        }

        // Fallback to generic error message
        const errorMessage = errorData.detail ||
          errorData.message ||
          errorData.error ||
          "Registration failed. Please try again.";

        toast.error(errorMessage);
      } else {
        toast.error("Registration failed. Please check your connection and try again.");
      }
    }
  };

  const formatPhoneNumber = (value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(
      6,
      10
    )}`;
  };
  return (
    <Box sx={{ mt: 0, width: '100%', px: 2, py: 1 }}>
      <Paper
        elevation={2}
        sx={{
          borderRadius: 3,
          border: '1px solid #e0e0e0',
          minHeight: "60vh",
          maxHeight: "calc(100vh - 200px)",
          overflowY: "auto",
          overflowX: "hidden",
          p: 2,
          display: "flex",
          gap: 2,
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: '#fff',
        }}
      >
        {/* Left Pane - Registration Form */}
        <Box sx={{
          flex: '1 1 35%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}>
          <Tabs
            value={leftTab}
            onChange={(e, v) => setLeftTab(v)}
            sx={{
              mb: 2,
              flexShrink: 0,
              minHeight: 36,
              "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
            }}
          >
            <Tab label="Quick Register" value="quick" />
            <Tab label="Registration" value="registration" />
          </Tabs>

          {leftTab === "quick" && (
          <Box sx={{
            flex: 1,
            overflowY: 'auto',
            pr: 1,
            minHeight: 0
          }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                {/* Only show organization field if not in adminMode, not logged in, and role is none/patient */}
                {!adminMode &&
                  !localStorage.getItem("access_token") &&
                  (formData.role === "none" || formData.role === "patient") && (
                    <TextField
                      label="Organization Name"
                      name="organization_name"
                      value={formData.organization_name || ""}
                      onChange={handleChange}
                      required
                      fullWidth
                      size="small"
                    />
                  )}
                <TextField
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                  fullWidth
                  size="small"
                  placeholder="First Name"
                  sx={{ mt: 3 }}
                />
                <TextField
                  label="Last Name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required={hasProvider === "no"}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Phone Number"
                  name="phone_number"
                  value={formatPhoneNumber(formData.phone_number || "")}
                  onChange={(e) => {
                    // Strip all non-digits to store raw phone number
                    const raw = e.target.value.replace(/\D/g, "");
                    setFormData((prev) => ({
                      ...prev,
                      phone_number: raw,
                    }));
                  }}
                  required={hasProvider === "no"}
                  fullWidth
                  size="small"
                  placeholder="e.g. (555) 123-4567"
                />
                <TextField
                  label="Password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  fullWidth
                  size="small"
                />

                {/* Provider question - HIDDEN in adminMode */}
                {!adminMode && (
                  <Box>
                    <FormControl component="fieldset">
                      <FormLabel>
                        Do you know/have a Primary Care Provider?
                      </FormLabel>
                      <RadioGroup row value={hasProvider}>
                        <FormControlLabel
                          value="yes"
                          control={<Radio />}
                          label="Yes"
                          onChange={() => setHasProvider("yes")}
                          checked={hasProvider === "yes"}
                        />
                        <FormControlLabel
                          value="no"
                          control={<Radio />}
                          label="No"
                          onChange={() => setHasProvider("no")}
                          checked={hasProvider === "no"}
                        />
                      </RadioGroup>
                    </FormControl>
                  </Box>
                )}

                {hasProvider === "yes" && (
                  <Box>
                    <FormLabel>Select Doctor</FormLabel>
                    <Select
                      options={doctors.map((doc) => ({
                        value: doc.id,
                        label: `Dr. ${doc.first_name} ${doc.last_name}`,
                      }))}
                      placeholder="Search or select doctor..."
                      onChange={(selected) =>
                        setFormData({
                          ...formData,
                          assigned_doctor: selected?.value || "",
                        })
                      }
                      isClearable
                      styles={{
                        control: (base) => ({ ...base, minHeight: 40 }),
                        menu: (base) => ({ ...base, zIndex: 9999 }),
                      }}
                    />
                  </Box>
                )}

                {!localStorage.getItem("access_token") &&
                  hasProvider === "no" && (
                    <Box>
                      {formData.email === "" || formData.phone_number === "" ? (
                        <Alert severity="error">
                          Please provide us with your contact details.
                        </Alert>
                      ) : (
                        <Alert severity="info" sx={{ fontWeight: 700 }}>
                          A representative will reach out to you shortly after
                          registration. Thank you!
                        </Alert>
                      )}
                    </Box>
                  )}
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  sx={{ mt: 2, mb: 2 }}
                  fullWidth
                >
                  Register
                </Button>
              </Stack>
            </form>
          </Box>
          )}

          {leftTab === "registration" && (
            <Box sx={{ flex: 1, overflowY: "auto", pr: 1, minHeight: 0 }}>
              <FullRegistrationForm
                doctors={doctors}
                initialPatient={editRequest?.patient}
                initialPatientNonce={editRequest?.nonce}
              />
            </Box>
          )}
        </Box>
        {/* Right Pane - All Registered Patients (first 50) */}
        <Box sx={{ flex: '1 1 65%', minWidth: 0, pl: 2 }}>
          <PatientsRegisterTable userRole={userRole} onEdit={handleEditPatient} />
        </Box>
      </Paper>
    </Box>
  );
}

export default RegisterPage;
