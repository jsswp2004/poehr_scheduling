// src/pages/DashboardPage.js (Material UI migration, fully feature-retained)
import Select from "react-select";
import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import CalendarView from "../components/CalendarView";
import AnnouncementDisplay from "../components/AnnouncementDisplay";
import { toast } from "react-toastify";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  IconButton,
  Tooltip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Divider,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  Alert,
  Checkbox,
  FormControlLabel,
  Chip,
  Grid,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  // Get local datetime string in YYYY-MM-DDTHH:MM format without timezone adjustment
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  const hours = String(local.getHours()).padStart(2, "0");
  const minutes = String(local.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toLocalDateString(dateObj) {
  const local = new Date(dateObj);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DashboardPage() {
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [formData, setFormData] = useState({
    title: "New Clinic Visit",
    description: "",
    appointment_datetime: "",
    duration_minutes: 30,
    recurrence: "none",
    recurrence_end_date: "",
    provider: null,
  });
  const [showForm, setShowForm] = useState(true);
  // Message my Provider form state
  const [emailForm, setEmailForm] = useState({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    message: "",
    attachments: [],
  });

  // SMS form state
  const [smsForm, setSmsForm] = useState({
    phone: "",
    message: "Please write your message to your physician.",
  });

  const [providerName, setProviderName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [smsSent, setSMSSent] = useState(false);

  // User Information State
  const [currentUser, setCurrentUser] = useState(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  const [smsConsentEditing, setSmsConsentEditing] = useState(false);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [tempPhoneNumber, setTempPhoneNumber] = useState("");
  const [tempSmsConsent, setTempSmsConsent] = useState(false);

  // Password Change State
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const token = localStorage.getItem("access_token");
  const [tab, setTab] = useState("myinfo");

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/users/doctors/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(res.data);
      } catch (error) {
        console.error("Failed to fetch doctors:", error);
      }
    };

    const fetchAppointments = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/appointments/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setAppointments(response.data);
        if (response.data && response.data.length > 0) {
          const doctorId = response.data[0].doctor;
          const matchedDoctor = doctors.find((doc) => doc.id === doctorId);
          setSelectedDoctor(
            matchedDoctor
              ? {
                value: matchedDoctor.id,
                label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}`,
              }
              : null
          );
        }
      } catch (error) {
        console.error("Error fetching appointments:", error);
      }
    };

    if (doctors.length === 0) {
      fetchDoctors();
    } else {
      fetchAppointments();
    }
  }, [token, doctors.length, refreshFlag]);

  useEffect(() => {
    if (!token) return;
    const fetchUserAndProvider = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/users/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = res.data;
        const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
        setPatientName(name);

        // Set current user for My Information tab
        setCurrentUser(user);
        setTempPhoneNumber(user.phone_number || "");
        setTempSmsConsent(user.sms_consent || false);
        setUserInfoLoading(false);
        if (user.provider) {
          const provRes = await axios.get(
            `${API_BASE_URL}/api/users/${user.provider}/`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const prov = provRes.data;
          const provName = `${prov.first_name || ""} ${prov.last_name || ""
            }`.trim();
          setProviderName(provName);
          setEmailForm((prev) => ({ ...prev, to: prov.email || "" }));
          setSmsForm((prev) => ({ ...prev, phone: prov.phone_number || "" }));
          const template = `${new Date().toLocaleDateString()}\n\nDear ${provName},\n\n[Your message here]\n\nThank you,\n${name}`;
          setEmailForm((prev) => ({ ...prev, message: template }));
        }
      } catch (err) {
        console.error("Failed to fetch user/provider info:", err);
      }
    };
    fetchUserAndProvider();
  }, [token]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // User Information handlers
  const handlePhoneNumberSave = async () => {
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/api/users/me/`,
        { phone_number: tempPhoneNumber },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCurrentUser(response.data);
      setPhoneEditing(false);
      toast.success("Phone number updated successfully!");
    } catch (error) {
      console.error("Failed to update phone number:", error);
      toast.error("Failed to update phone number");
    }
  };

  const handleSmsConsentSave = async () => {
    if (tempSmsConsent && !tempPhoneNumber.trim()) {
      toast.error("Phone number is required for SMS consent");
      return;
    }

    try {
      const updateData = { sms_consent: tempSmsConsent };
      if (tempPhoneNumber !== currentUser.phone_number) {
        updateData.phone_number = tempPhoneNumber;
      }

      const response = await axios.patch(
        `${API_BASE_URL}/api/users/me/`,
        updateData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCurrentUser(response.data);
      setSmsConsentEditing(false);
      setPhoneEditing(false);
      toast.success("SMS consent updated successfully!");
    } catch (error) {
      console.error("Failed to update SMS consent:", error);
      toast.error("Failed to update SMS consent");
    }
  };

  const handleSmsConsentChange = (event) => {
    const newConsent = event.target.checked;
    setTempSmsConsent(newConsent);

    if (newConsent && !tempPhoneNumber.trim()) {
      setPhoneEditing(true);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/users/change-password/`,
        {
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
          confirm_password: passwordForm.confirmPassword,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Password changed successfully!");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordEditing(false);
    } catch (error) {
      console.error("Failed to change password:", error);
      toast.error(error.response?.data?.message || "Failed to change password");
    }
  };

  const fetchAvailableSlots = async (doctorId) => {
    setAvailableSlots([]);
    if (!doctorId) return;

    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/doctors/${doctorId}/available-dates/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setAvailableSlots(res.data);
    } catch (error) {
      console.error("Failed to fetch available slots:", error);
    }
  };

  const handleEditClick = (appointment) => {
    const now = new Date();
    const appointmentDate = new Date(appointment.appointment_datetime);

    if (appointmentDate < now) {
      toast.error("Cannot edit past appointments.");
      return;
    }

    setFormData({
      title: appointment.title,
      description: appointment.description,
      appointment_datetime: toLocalDatetimeString(
        appointment.appointment_datetime
      ),
      duration_minutes: appointment.duration_minutes,
      recurrence: appointment.recurrence || "none",
      recurrence_end_date: appointment.recurrence_end_date ? toLocalDateString(appointment.recurrence_end_date) : "",
    });

    const matched = doctors.find((doc) => doc.id === appointment.provider);
    const selected = matched
      ? {
        value: matched.id,
        label: `Dr. ${matched.first_name} ${matched.last_name}`,
      }
      : null;

    setSelectedDoctor(selected);
    fetchAvailableSlots(selected?.value);

    setEditingId(appointment.id);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this appointment?"))
      return;

    try {
      await axios.delete(`${API_BASE_URL}/api/appointments/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Appointment deleted!");
      setAppointments(appointments.filter((a) => a.id !== id));
    } catch (error) {
      console.error(error);
      toast.error("Delete failed.");
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title || !formData.appointment_datetime) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (formData.recurrence !== "none" && !formData.recurrence_end_date) {
      toast.error("Please provide an end date for recurring appointments.");
      return;
    }

    // Convert datetime-local format to ISO format for backend
    const appointmentDate = new Date(formData.appointment_datetime);
    const isoDateTime = appointmentDate.toISOString();

    const payload = {
      ...formData,
      appointment_datetime: isoDateTime,
      provider: selectedDoctor?.value || null,
      patient: currentUser?.id || null,
    };

    console.log("Sending appointment payload:", payload);

    try {
      if (editMode && editingId) {
        await axios.put(
          `${API_BASE_URL}/api/appointments/${editingId}/`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("Appointment updated!");
      } else {
        await axios.post(`${API_BASE_URL}/api/appointments/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Appointment created!");
      }

      const refreshed = await axios.get(`${API_BASE_URL}/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(refreshed.data);

      setFormData({
        title: "",
        description: "",
        appointment_datetime: "",
        duration_minutes: 30,
        recurrence: "none",
        recurrence_end_date: "",
      });
      setSelectedDoctor(null);
      setEditMode(false);
      setEditingId(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save appointment.");
    }
  };
  const handleEmailChange = (field) => (e) => {
    setEmailForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSMSChange = (field) => (e) => {
    setSmsForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleAttachmentChange = (e) => {
    const files = Array.from(e.target.files || []);
    setEmailForm((prev) => ({ ...prev, attachments: files }));
  };
  const handleSendMessage = async () => {
    try {
      const form = new FormData();
      form.append("email", emailForm.to);
      if (emailForm.cc) form.append("cc", emailForm.cc);
      if (emailForm.bcc) form.append("bcc", emailForm.bcc);
      form.append("subject", emailForm.subject);
      form.append("message", emailForm.message);
      emailForm.attachments.forEach((f) => form.append("attachments", f));
      await axios.post(`${API_BASE_URL}/api/messages/send-email/`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      // Show success confirmation
      setMessageSent(true);

      // Reset the form fields
      setEmailForm({
        to: emailForm.to, // Keep the provider's email
        cc: "",
        bcc: "",
        subject: "",
        message: `${new Date().toLocaleDateString()}\n\nDear ${providerName},\n\n[Your message here]\n\nThank you,\n${patientName}`,
        attachments: [],
      });

      // Hide confirmation after 5 seconds
      setTimeout(() => {
        setMessageSent(false);
      }, 5000);
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Failed to send message");
    }
  };

  const handleSendSMS = async () => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/messages/send-sms/`,
        {
          phone: smsForm.phone,
          message: smsForm.message,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Show success confirmation
      setSMSSent(true);

      // Reset the message field but keep the phone number
      setSmsForm((prev) => ({
        ...prev,
        message: "Please write your message to your physician.",
      }));

      // Hide confirmation after 5 seconds
      setTimeout(() => {
        setSMSSent(false);
      }, 5000);
    } catch (err) {
      console.error("Failed to send SMS:", err);
      toast.error("Failed to send SMS");
    }
  };

  // Only show future appointments
  const filteredAppointments = (appointments || [])
    .filter((a) => {
      const apptDate = new Date(a.appointment_datetime);
      const now = new Date();
      return apptDate.setHours(0, 0, 0, 0) >= now.setHours(0, 0, 0, 0);
    })
    .sort(
      (a, b) =>
        new Date(a.appointment_datetime) - new Date(b.appointment_datetime)
    );
  return (
    <Box sx={{ mt: 0, p: 3, maxWidth: "100%", mx: "auto" }}>
      {" "}
      <Stack direction="row" spacing={3} sx={{ height: "100vh" }}>
        {/* Left Pane - Patient Portal (70%) */}
        <Box
          sx={{
            flex: "0 0 70%",
            boxShadow: 2,
            borderRadius: 2,
            bgcolor: "background.paper",
            p: 3,
            overflow: "auto",
          }}
        >
          <Typography variant="h5" sx={{ mb: 0 }}>
            Patient Portal
          </Typography>
          <Tabs
            value={tab}
            onChange={(_, val) => setTab(val)}
            aria-label="dashboard-tabs"
            sx={{ mb: 0 }}
          >
            <Tab value="myinfo" label="My Information" />
            <Tab value="manage" label="Manage Appointments" />
            <Tab value="message" label="Message my Provider" />
            <Tab value="calendar" label="Calendar" />
          </Tabs>
          <Divider sx={{ mb: 2 }} />
          {tab === "myinfo" && (
            <Box>
              {userInfoLoading ? (
                <Typography>Loading user information...</Typography>
              ) : currentUser ? (
                <Stack spacing={3}>
                  <Typography variant="h6">My Information</Typography>

                  {/* User Details Section */}
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      Profile Information
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="First Name"
                          value={currentUser.first_name || ""}
                          fullWidth
                          disabled
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Last Name"
                          value={currentUser.last_name || ""}
                          fullWidth
                          disabled
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Email"
                          value={currentUser.email || ""}
                          fullWidth
                          disabled
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Role"
                          value={currentUser.role || ""}
                          fullWidth
                          disabled
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box>
                          <TextField
                            label="Phone Number"
                            value={
                              phoneEditing
                                ? tempPhoneNumber
                                : currentUser.phone_number || ""
                            }
                            onChange={(e) => setTempPhoneNumber(e.target.value)}
                            fullWidth
                            disabled={!phoneEditing}
                            variant="outlined"
                            helperText={
                              phoneEditing ? "Enter your phone number" : ""
                            }
                          />
                          <Box sx={{ mt: 1 }}>
                            {phoneEditing ? (
                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handlePhoneNumberSave}
                                  disabled={!tempPhoneNumber.trim()}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => {
                                    setTempPhoneNumber(
                                      currentUser.phone_number || ""
                                    );
                                    setPhoneEditing(false);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </Stack>
                            ) : (
                              <Button
                                size="small"
                                startIcon={<EditIcon />}
                                onClick={() => setPhoneEditing(true)}
                              >
                                Edit Phone
                              </Button>
                            )}
                          </Box>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>

                  {/* SMS Consent Section for Patients */}
                  {currentUser.role === "patient" && (
                    <Paper sx={{ p: 3 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Communication Preferences
                      </Typography>

                      <Box>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={
                                smsConsentEditing
                                  ? tempSmsConsent
                                  : currentUser.sms_consent || false
                              }
                              onChange={handleSmsConsentChange}
                              disabled={!smsConsentEditing && !phoneEditing}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2">
                                By providing your phone number, you agree to
                                receive appointment reminders and health
                                notifications from POWER Healthcare IT Systems,
                                LLC. Message frequency varies. Message and data
                                rates may apply.
                              </Typography>
                            </Box>
                          }
                        />

                        {currentUser.sms_consent &&
                          currentUser.sms_consent_date && (
                            <Chip
                              label={`Consented on ${new Date(
                                currentUser.sms_consent_date
                              ).toLocaleDateString()}`}
                              size="small"
                              color="success"
                              sx={{ mt: 1, ml: 4 }}
                            />
                          )}

                        <Box sx={{ mt: 2 }}>
                          {smsConsentEditing || phoneEditing ? (
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={handleSmsConsentSave}
                                disabled={
                                  tempSmsConsent && !tempPhoneNumber.trim()
                                }
                              >
                                Save Preferences
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  setTempSmsConsent(
                                    currentUser.sms_consent || false
                                  );
                                  setTempPhoneNumber(
                                    currentUser.phone_number || ""
                                  );
                                  setSmsConsentEditing(false);
                                  setPhoneEditing(false);
                                }}
                              >
                                Cancel
                              </Button>
                            </Stack>
                          ) : (
                            <Button
                              size="small"
                              startIcon={<EditIcon />}
                              onClick={() => setSmsConsentEditing(true)}
                            >
                              Update Preferences
                            </Button>
                          )}
                        </Box>

                        {tempSmsConsent && !tempPhoneNumber.trim() && (
                          <Alert severity="warning" sx={{ mt: 2 }}>
                            A phone number is required to receive SMS
                            notifications.
                          </Alert>
                        )}
                      </Box>
                    </Paper>
                  )}

                  {/* Change Password Section */}
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      Change Password
                    </Typography>

                    <Box>
                      {passwordEditing ? (
                        <Stack spacing={2}>
                          <TextField
                            fullWidth
                            type="password"
                            label="Current Password"
                            value={passwordForm.currentPassword}
                            onChange={(e) =>
                              setPasswordForm({
                                ...passwordForm,
                                currentPassword: e.target.value,
                              })
                            }
                            required
                          />
                          <TextField
                            fullWidth
                            type="password"
                            label="New Password"
                            value={passwordForm.newPassword}
                            onChange={(e) =>
                              setPasswordForm({
                                ...passwordForm,
                                newPassword: e.target.value,
                              })
                            }
                            helperText="Password must be at least 8 characters long"
                            required
                          />
                          <TextField
                            fullWidth
                            type="password"
                            label="Confirm New Password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) =>
                              setPasswordForm({
                                ...passwordForm,
                                confirmPassword: e.target.value,
                              })
                            }
                            error={
                              passwordForm.confirmPassword &&
                              passwordForm.newPassword !== passwordForm.confirmPassword
                            }
                            helperText={
                              passwordForm.confirmPassword &&
                                passwordForm.newPassword !== passwordForm.confirmPassword
                                ? "Passwords do not match"
                                : ""
                            }
                            required
                          />
                          <Stack direction="row" spacing={1}>
                            <Button
                              variant="contained"
                              onClick={handlePasswordChange}
                              disabled={
                                !passwordForm.currentPassword ||
                                !passwordForm.newPassword ||
                                !passwordForm.confirmPassword ||
                                passwordForm.newPassword !== passwordForm.confirmPassword ||
                                passwordForm.newPassword.length < 8
                              }
                            >
                              Change Password
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => {
                                setPasswordForm({
                                  currentPassword: "",
                                  newPassword: "",
                                  confirmPassword: ""
                                });
                                setPasswordEditing(false);
                              }}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Box>
                          <Typography variant="body2" sx={{ mb: 2 }}>
                            Update your account password for enhanced security
                          </Typography>
                          <Button
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={() => setPasswordEditing(true)}
                          >
                            Change Password
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                </Stack>
              ) : (
                <Alert severity="error">Failed to load user information</Alert>
              )}
            </Box>
          )}
          {tab === "manage" && (
            <Box>
              <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
                <Box sx={{ flex: 1, minWidth: 350 }}>
                  <form onSubmit={handleSubmit}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      {editMode ? "Edit Appointment" : "Request an Appointment"}
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        fullWidth
                        required
                      />
                      <TextField
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        multiline
                        rows={2}
                        fullWidth
                      />
                      <TextField
                        label="Date & Time"
                        name="appointment_datetime"
                        type="datetime-local"
                        value={formData.appointment_datetime}
                        onChange={handleChange}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                        required
                      />
                      <TextField
                        label="Duration (minutes)"
                        name="duration_minutes"
                        type="number"
                        value={formData.duration_minutes}
                        onChange={handleChange}
                        fullWidth
                        required
                      />
                      <FormControl fullWidth>
                        <InputLabel id="recurrence-label">
                          Recurrence
                        </InputLabel>
                        <MUISelect
                          labelId="recurrence-label"
                          name="recurrence"
                          value={formData.recurrence}
                          onChange={handleChange}
                          label="Recurrence"
                        >
                          <MenuItem value="none">None</MenuItem>
                          <MenuItem value="daily">Daily</MenuItem>
                          <MenuItem value="weekly">Weekly</MenuItem>
                          <MenuItem value="monthly">Monthly</MenuItem>
                        </MUISelect>
                      </FormControl>
                      {formData.recurrence !== "none" && (
                        <TextField
                          fullWidth
                          label="Recurrence End Date"
                          name="recurrence_end_date"
                          type="date"
                          value={formData.recurrence_end_date}
                          onChange={handleChange}
                          InputLabelProps={{
                            shrink: true,
                          }}
                          required
                        />
                      )}
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Select Doctor
                        </Typography>
                        <Select
                          options={doctors.map((doc) => ({
                            value: doc.id,
                            label: `Dr. ${doc.first_name} ${doc.last_name}`,
                          }))}
                          value={selectedDoctor}
                          onChange={(selected) => {
                            setSelectedDoctor(selected);
                            fetchAvailableSlots(selected?.value);
                          }}
                          placeholder="Search or select doctor..."
                          isClearable
                        />
                      </Box>
                      <Stack direction="row" spacing={2}>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          fullWidth
                        >
                          {editMode
                            ? "Update Appointment"
                            : "Create Appointment"}
                        </Button>
                        <Button
                          variant="outlined"
                          color="secondary"
                          fullWidth
                          onClick={() => {
                            setFormData({
                              title: "",
                              description: "",
                              appointment_datetime: "",
                              duration_minutes: 30,
                              recurrence: "none",
                              recurrence_end_date: "",
                              provider: null,
                            });
                            setSelectedDoctor(null);
                            setEditingId(null);
                            setEditMode(false);
                            setSelectedSlot(null);
                          }}
                        >
                          Clear Form
                        </Button>
                      </Stack>
                    </Stack>
                  </form>
                  <Box sx={{ mt: 4 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Available Dates for{" "}
                      {selectedDoctor?.label || "Selected Doctor"}
                    </Typography>
                    <Paper
                      variant="outlined"
                      sx={{ maxHeight: 200, overflow: "auto", p: 1 }}
                    >
                      {availableSlots.length > 0 ? (
                        availableSlots.map((slot, idx) => {
                          const formattedSlot = toLocalDatetimeString(slot);
                          return (
                            <Button
                              key={idx}
                              variant={
                                selectedSlot === formattedSlot
                                  ? "contained"
                                  : "outlined"
                              }
                              sx={{ m: 0.5 }}
                              size="small"
                              onClick={() => {
                                setSelectedSlot(formattedSlot);
                                setFormData((prev) => ({
                                  ...prev,
                                  appointment_datetime: formattedSlot,
                                }));
                              }}
                            >
                              {new Date(slot).toLocaleString()}
                            </Button>
                          );
                        })
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No available slots
                        </Typography>
                      )}
                    </Paper>
                  </Box>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Your Appointments
                  </Typography>
                  <TableContainer component={Paper} sx={{ maxHeight: 350 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Visit</TableCell>
                          <TableCell>Date & Time</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredAppointments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>{a.title || "Untitled"}</TableCell>
                            <TableCell>
                              {a.appointment_datetime
                                ? new Date(
                                  a.appointment_datetime
                                ).toLocaleString()
                                : "Unknown"}
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Edit appointment">
                                <IconButton
                                  size="small"
                                  color="warning"
                                  onClick={() => handleEditClick(a)}
                                  sx={{ mr: 1 }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete appointment">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDelete(a.id)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Stack>
            </Box>
          )}
          {tab === "message" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
                maxHeight: "70vh",
                overflow: "hidden",
              }}
            >
              {/* Left Pane - Email */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "70vh",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ mb: 2, fontWeight: 600, color: "primary.main" }}
                >
                  📧 Email
                </Typography>
                {messageSent && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Your email has been sent successfully. Your provider will
                    respond to you as soon as possible.
                  </Alert>
                )}
                <Stack spacing={2} sx={{ flex: 1 }}>
                  <TextField
                    label="To"
                    value={emailForm.to}
                    onChange={handleEmailChange("to")}
                    fullWidth
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <TextField
                    label="Cc"
                    value={emailForm.cc}
                    onChange={handleEmailChange("cc")}
                    fullWidth
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <TextField
                    label="Bcc"
                    value={emailForm.bcc}
                    onChange={handleEmailChange("bcc")}
                    fullWidth
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  <TextField
                    label="Subject"
                    value={emailForm.subject}
                    onChange={handleEmailChange("subject")}
                    fullWidth
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />{" "}
                  <TextField
                    label="Message"
                    multiline
                    rows={4}
                    value={emailForm.message}
                    onChange={handleEmailChange("message")}
                    fullWidth
                    sx={{
                      flex: 1,
                      "& .MuiOutlinedInput-root": { borderRadius: 2 },
                    }}
                  />
                  <Box>
                    <Button
                      variant="outlined"
                      component="label"
                      sx={{
                        borderRadius: 2,
                        textTransform: "none",
                        fontWeight: 600,
                        mb: 1,
                      }}
                    >
                      📎 Attach Files
                      <input
                        type="file"
                        multiple
                        hidden
                        onChange={handleAttachmentChange}
                      />
                    </Button>
                    {emailForm.attachments.map((f, idx) => (
                      <Typography
                        key={idx}
                        variant="caption"
                        sx={{ ml: 1, display: "block" }}
                      >
                        {f.name}
                      </Typography>
                    ))}
                  </Box>
                  <Button
                    variant="contained"
                    onClick={handleSendMessage}
                    sx={{
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: 600,
                      py: 1.5,
                    }}
                  >
                    Send Email
                  </Button>
                </Stack>
              </Box>{" "}
              {/* Right Pane - SMS */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "70vh",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ mb: 2, fontWeight: 600, color: "primary.main" }}
                >
                  💬 Text Message
                </Typography>
                {smsSent && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Your text message has been sent successfully. Your provider
                    will respond to you as soon as possible.
                  </Alert>
                )}
                <Stack spacing={2.5} sx={{ flex: 1 }}>
                  <TextField
                    label="Provider Phone Number"
                    value={smsForm.phone}
                    onChange={handleSMSChange("phone")}
                    fullWidth
                    size="small"
                    placeholder="(555) 123-4567"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    helperText="Your provider's phone number for text messages"
                  />{" "}
                  <TextField
                    label="Message"
                    multiline
                    rows={5}
                    value={smsForm.message}
                    onChange={handleSMSChange("message")}
                    fullWidth
                    sx={{
                      flex: 1,
                      "& .MuiOutlinedInput-root": { borderRadius: 2 },
                    }}
                    helperText="Keep your message concise for SMS"
                  />
                  <Box sx={{ mt: 3 }}>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={handleSendSMS}
                      fullWidth
                      sx={{
                        borderRadius: 2,
                        textTransform: "none",
                        fontWeight: 600,
                        py: 1.5,
                      }}
                    >
                      Send Text Message
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Box>
          )}
          {tab === "calendar" && (
            <Box sx={{ mt: 2 }}>
              <CalendarView
                onUpdate={() => setRefreshFlag((prev) => !prev)}
                showBackButton={currentUser?.role !== 'patient'}
              />
            </Box>
          )}{" "}
        </Box>{" "}
        {/* Right Pane - Announcements (30%) */}
        <Box
          sx={{
            flex: "0 0 30%",
            boxShadow: 2,
            borderRadius: 2,
            bgcolor: "background.paper",
            p: 3,
            overflow: "auto",
          }}
        >
          <Typography
            variant="h6"
            sx={{ mb: 2, fontWeight: "bold", color: "primary.main" }}
          >
            Announcements
          </Typography>
          <AnnouncementDisplay />
        </Box>
      </Stack>
    </Box>
  );
}

export default DashboardPage;
