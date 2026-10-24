// src/pages/DashboardPage.js (Material UI migration, fully feature-retained)
import Select from "react-select";
import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import CalendarView from "../components/CalendarView";
import AnnouncementDisplay from "../components/AnnouncementDisplay";
import { toast } from "react-toastify";
import { getAccessToken } from "../utils/tokenManager";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  IconButton,
  Tabs,
  Tab,
  MenuItem,
  Alert,
  Chip,
  Menu,
  Switch,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";

const BORDER = "#dfe4ec";

function Section({ title, action, children }) {
  return (
    <Box sx={{ bgcolor: "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", p: "14px 16px" }}>
      {(title || action) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
          <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>
            {title}
          </Typography>
          {action}
        </Box>
      )}
      {children}
    </Box>
  );
}

function Field({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: 13.5, wordBreak: "break-word" }}>{value || "Not set"}</Typography>
    </Box>
  );
}

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
    from: "",
    to: "",
    cc: "",
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
  const [organizationAdmin, setOrganizationAdmin] = useState(null);

  // User Information State
  const [currentUser, setCurrentUser] = useState(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  const [smsConsentEditing, setSmsConsentEditing] = useState(false);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [tempPhoneNumber, setTempPhoneNumber] = useState("");
  const [tempSmsConsent, setTempSmsConsent] = useState(false);

  // Password Change State
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [apptMenu, setApptMenu] = useState({ anchor: null, appt: null });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Use the centralized token helper -- tokenManager.js stores access_token
  // JSON-wrapped ({"token": "..."}) for extension compatibility, and a raw
  // localStorage.getItem("access_token") read (as this used to do) returns
  // that wrapped JSON string instead of the JWT itself, producing a malformed
  // "Bearer {\"token\":...}" Authorization header that the backend rejects
  // with 401 -- e.g. the doctor dropdown silently failed to populate because
  // its GET /api/users/doctors/ call fires on mount, before App.js's axios
  // interceptor (which patches this same malformed header, but only once it
  // has mounted) is registered.
  const token = getAccessToken();
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

        // Set email "from" field - patient email or name
        const fromField = user.email || name;
        
        // Try to get organization admin info first
        try {
          const adminRes = await axios.get(
            `${API_BASE_URL}/api/users/organization-admin-info/`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const adminData = adminRes.data;
          setOrganizationAdmin(adminData);
          
          // Set default email recipient to organization admin
          setEmailForm((prev) => ({ 
            ...prev, 
            from: fromField,
            to: adminData.admin_email || "" 
          }));
          
          // Set default SMS recipient to organization admin
          setSmsForm((prev) => ({ 
            ...prev, 
            phone: adminData.admin_phone || "" 
          }));
          
          // Update provider name to admin name
          setProviderName(adminData.admin_name || "Organization Admin");
          
          const template = `${new Date().toLocaleDateString()}\n\nDear ${adminData.admin_name || "Admin"},\n\n[Your message here]\n\nThank you,\n${name}`;
          setEmailForm((prev) => ({ ...prev, message: template }));
          
        } catch (adminError) {
          console.log("No organization admin found, falling back to provider:", adminError);
          
          // Fallback to provider-based logic if organization admin not found
          if (user.provider) {
            const provRes = await axios.get(
              `${API_BASE_URL}/api/users/${user.provider}/`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            const prov = provRes.data;
            const provName = `${prov.first_name || ""} ${
              prov.last_name || ""
            }`.trim();
            setProviderName(provName);
            setEmailForm((prev) => ({ 
              ...prev, 
              from: fromField,
              to: prov.email || "" 
            }));
            
            // Format provider phone number for SMS
            let providerPhone = prov.phone_number || "";
            if (providerPhone && !providerPhone.startsWith('+')) {
              // Clean the phone number
              const cleanPhone = providerPhone.replace(/[^\d]/g, '');
              if (cleanPhone.length === 10) {
                providerPhone = '+1' + cleanPhone;
              } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
                providerPhone = '+' + cleanPhone;
              }
            }
            
            setSmsForm((prev) => ({ ...prev, phone: providerPhone }));
            const template = `${new Date().toLocaleDateString()}\n\nDear ${provName},\n\n[Your message here]\n\nThank you,\n${name}`;
            setEmailForm((prev) => ({ ...prev, message: template }));
          } else {
            // No provider either, set basic defaults
            setEmailForm((prev) => ({ ...prev, from: fromField }));
          }
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
        confirmPassword: "",
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
      recurrence_end_date: appointment.recurrence_end_date
        ? toLocalDateString(appointment.recurrence_end_date)
        : "",
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

    // Create base payload without recurrence_end_date
    const { recurrence_end_date, ...baseFormData } = formData;

    const payload = {
      ...baseFormData,
      appointment_datetime: isoDateTime,
      provider: selectedDoctor?.value || null,
      patient: currentUser?.id || null,
    };

    // Only include recurrence_end_date if recurrence is not "none" and date is provided
    if (formData.recurrence !== "none" && formData.recurrence_end_date) {
      // Ensure the date is in YYYY-MM-DD format
      const dateValue = formData.recurrence_end_date;
      // If it's already in YYYY-MM-DD format, use it directly
      // If it's a Date object or other format, convert it
      if (dateValue instanceof Date) {
        payload.recurrence_end_date = dateValue.toISOString().split("T")[0];
      } else if (
        typeof dateValue === "string" &&
        dateValue.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        payload.recurrence_end_date = dateValue;
      } else {
        // Try to parse and format it
        const parsedDate = new Date(dateValue);
        payload.recurrence_end_date = parsedDate.toISOString().split("T")[0];
      }
      console.log(
        "Recurrence end date being sent:",
        payload.recurrence_end_date,
        "Original:",
        dateValue
      );
    }

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
        toast.success("Appointment request submitted!");
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
        from: emailForm.from, // Keep the patient's from info
        to: emailForm.to, // Keep the admin/provider's email
        cc: "",
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
    // Validate form fields
    if (!smsForm.phone.trim()) {
      toast.error("Provider phone number is required");
      return;
    }

    if (!smsForm.message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    // Format phone number to international format
    let formattedPhone = smsForm.phone.trim();
    
    // Remove any non-digit characters except +
    formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
    
    // Add + prefix if not present and phone number looks valid
    if (!formattedPhone.startsWith('+')) {
      // Assume US number if no country code and 10 digits
      if (formattedPhone.length === 10) {
        formattedPhone = '+1' + formattedPhone;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) {
        formattedPhone = '+' + formattedPhone;
      } else {
        toast.error("Please provide a valid phone number with country code (e.g., +1234567890)");
        return;
      }
    }

    // Format SMS message with patient name prefix
    const formattedMessage = `A message from ${patientName}: ${smsForm.message}`;

    console.log('Sending SMS with formatted phone:', formattedPhone);
    console.log('Formatted message:', formattedMessage);

    try {
      await axios.post(
        `${API_BASE_URL}/api/messages/send-sms/`,
        {
          phone: formattedPhone,
          message: formattedMessage,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log('SMS sent successfully');
      toast.success("Text message sent successfully!");

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
      
      // Provide more specific error messages
      if (err.response?.status === 401) {
        toast.error("Authentication failed. Please log in again.");
      } else if (err.response?.status === 400) {
        const errorData = err.response.data;
        if (errorData.phone) {
          toast.error(`Phone number error: ${errorData.phone.join(', ')}`);
        } else if (errorData.message) {
          toast.error(`Message error: ${errorData.message.join(', ')}`);
        } else {
          toast.error("Invalid request. Please check your input.");
        }
      } else if (err.response?.status === 500) {
        toast.error("Server error. Please try again later or contact support.");
      } else {
        toast.error(`Failed to send SMS: ${err.response?.data?.detail || err.message || 'Unknown error'}`);
      }
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
  // Group the doctor's open times by day so the picker reads as days and times
  const slotGroups = (() => {
    const groups = new Map();
    availableSlots.forEach((slot) => {
      const d = new Date(slot);
      const key = toLocalDateString(d);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
          slots: [],
        });
      }
      groups.get(key).slots.push(slot);
    });
    return [...groups.values()];
  })();

  const statusLabel = (s) =>
    s === "pending" ? "Pending" : s === "cancelled" ? "Cancelled" : s === "completed" ? "Completed" : "Scheduled";
  const statusColor = (s) =>
    s === "pending" ? "warning" : s === "cancelled" ? "default" : s === "completed" ? "success" : "info";
  const doctorName = (id) => {
    const d = doctors.find((x) => x.id === id);
    return d ? `Dr. ${d.first_name} ${d.last_name}` : "";
  };
  const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: "6px" } };
  const smsEditable = smsConsentEditing || phoneEditing;

  const myInfoTab = userInfoLoading ? (
    <Typography>Loading user information...</Typography>
  ) : currentUser ? (
    <Stack spacing={1.5}>
      <Section title="Your details">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: "10px 16px" }}>
          <Field label="First name" value={currentUser.first_name} />
          <Field label="Last name" value={currentUser.last_name} />
          <Field label="Email" value={currentUser.email} />
          <Field label="Role" value={currentUser.role} />
        </Box>
        <Box sx={{ mt: 1.5 }}>
          {phoneEditing ? (
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
              <TextField
                label="Phone number"
                size="small"
                value={tempPhoneNumber}
                onChange={(e) => setTempPhoneNumber(e.target.value)}
                helperText="Enter your phone number"
                sx={{ ...fieldSx, minWidth: 240 }}
              />
              <Button size="small" variant="contained" onClick={handlePhoneNumberSave} disabled={!tempPhoneNumber.trim()}>
                Save
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setTempPhoneNumber(currentUser.phone_number || "");
                  setPhoneEditing(false);
                }}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <Field label="Phone number" value={currentUser.phone_number} />
              </Box>
              <Button size="small" variant="outlined" onClick={() => setPhoneEditing(true)}>
                Edit phone
              </Button>
            </Box>
          )}
        </Box>
      </Section>

      {currentUser.role === "patient" && (
        <Section title="Text message reminders">
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            <Switch
              inputProps={{ "aria-label": "Text message reminders" }}
              checked={smsConsentEditing ? tempSmsConsent : currentUser.sms_consent || false}
              onChange={handleSmsConsentChange}
              disabled={!smsEditable}
            />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                Appointment reminders and health alerts by SMS
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12, lineHeight: 1.5, mt: 0.5 }}>
                By providing your phone number and checking this box, you consent to receive automated
                appointment reminders and health alerts via SMS from POWER Healthcare IT Systems. Message
                frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for
                support. Your information will not be shared with third parties for marketing. See our{" "}
                <a
                  href="https://powerhealthcareit.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#2563eb", textDecoration: "underline" }}
                >
                  Privacy Policy and Terms
                </a>
                .
              </Typography>
              {currentUser.sms_consent && currentUser.sms_consent_date && (
                <Chip
                  label={`Consented on ${new Date(currentUser.sms_consent_date).toLocaleDateString()}`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ mt: 1 }}
                />
              )}
              <Box sx={{ mt: 1 }}>
                {smsEditable ? (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSmsConsentSave}
                      disabled={tempSmsConsent && !tempPhoneNumber.trim()}
                    >
                      Save Preferences
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setTempSmsConsent(currentUser.sms_consent || false);
                        setTempPhoneNumber(currentUser.phone_number || "");
                        setSmsConsentEditing(false);
                        setPhoneEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <Button size="small" variant="outlined" onClick={() => setSmsConsentEditing(true)}>
                    Update Preferences
                  </Button>
                )}
              </Box>
              {tempSmsConsent && !tempPhoneNumber.trim() && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  A phone number is required to receive SMS notifications.
                </Alert>
              )}
            </Box>
          </Box>
        </Section>
      )}

      <Section
        title="Password"
        action={
          !passwordEditing && (
            <Button size="small" variant="outlined" onClick={() => setPasswordEditing(true)}>
              Change Password
            </Button>
          )
        }
      >
        {passwordEditing ? (
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Current Password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
              sx={fieldSx}
            />
            <TextField
              fullWidth
              size="small"
              type="password"
              label="New Password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              helperText="Password must be at least 8 characters long"
              required
              sx={fieldSx}
            />
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Confirm New Password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              error={!!passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword}
              helperText={
                passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword
                  ? "Passwords do not match"
                  : ""
              }
              required
              sx={fieldSx}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  setPasswordEditing(false);
                }}
              >
                Cancel
              </Button>
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
                Update password
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Update your account password for enhanced security
          </Typography>
        )}
      </Section>
    </Stack>
  ) : (
    <Alert severity="error">Failed to load user information</Alert>
  );

  const manageTab = (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5, alignItems: "start" }}>
      <Section title={editMode ? "Edit appointment" : "Request an appointment"}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={1.75} sx={{ pt: 0.5 }}>
            <TextField label="Title" name="title" value={formData.title} onChange={handleChange} fullWidth required size="small" sx={fieldSx} />
            <TextField label="Description" name="description" value={formData.description} onChange={handleChange} multiline rows={2} fullWidth size="small" sx={fieldSx} />
            <Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>Select Doctor</Typography>
              <Select
                options={doctors.map((doc) => ({ value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }))}
                value={selectedDoctor}
                onChange={(selected) => {
                  setSelectedDoctor(selected);
                  fetchAvailableSlots(selected?.value);
                }}
                placeholder="Search or select doctor..."
                isClearable
              />
            </Box>
            {selectedDoctor && (
              <Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75 }}>
                  Available times for {selectedDoctor.label}
                </Typography>
                {slotGroups.length > 0 ? (
                  slotGroups.map((g) => (
                    <Box key={g.key} sx={{ mb: 0.75 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5 }}>{g.label}</Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                        {g.slots.map((slot) => {
                          const formatted = toLocalDatetimeString(slot);
                          const picked = selectedSlot === formatted;
                          return (
                            <Chip
                              key={formatted}
                              label={new Date(slot).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              size="small"
                              clickable
                              color={picked ? "primary" : "default"}
                              variant={picked ? "filled" : "outlined"}
                              onClick={() => {
                                setSelectedSlot(formatted);
                                setFormData((prev) => ({ ...prev, appointment_datetime: formatted }));
                              }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No available slots
                  </Typography>
                )}
              </Box>
            )}
            <TextField
              label="Date & Time"
              name="appointment_datetime"
              type="datetime-local"
              value={formData.appointment_datetime}
              onChange={handleChange}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
              size="small"
              sx={fieldSx}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
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
              <Button type="submit" variant="contained">
                {editMode ? "Update Appointment" : "Request Appointment"}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Section>

      <Section title="Your appointments">
        {filteredAppointments.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 2 }}>
            No upcoming appointments yet. Request one from the form.
          </Typography>
        ) : (
          filteredAppointments.map((a, i) => (
            <Box
              key={a.id}
              sx={{ display: "flex", alignItems: "center", gap: 1.25, minHeight: 48, py: 0.75, borderTop: i === 0 ? 0 : "1px solid #eef1f6" }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{a.title || "Untitled"}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {a.appointment_datetime ? new Date(a.appointment_datetime).toLocaleString() : "Unknown"}
                  {doctorName(a.provider) ? ` · ${doctorName(a.provider)}` : ""}
                </Typography>
              </Box>
              <Chip size="small" label={statusLabel(a.status)} color={statusColor(a.status)} variant="outlined" />
              <IconButton
                size="small"
                aria-label={`Actions for ${a.title || "Untitled"}`}
                onClick={(e) => setApptMenu({ anchor: e.currentTarget, appt: a })}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
          ))
        )}
      </Section>
    </Box>
  );

  const messageTab = (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5, alignItems: "start" }}>
        <Section title="Email">
          {messageSent && (
            <Alert severity="success" sx={{ mb: 1.5 }}>
              Your email has been sent successfully. Your provider will respond to you as soon as possible.
            </Alert>
          )}
          <Stack spacing={1.75} sx={{ pt: 0.5 }}>
            <TextField label="From" value={emailForm.from} fullWidth size="small" disabled helperText="Your email address or name" sx={fieldSx} />
            <TextField label="To" value={emailForm.to} onChange={handleEmailChange("to")} fullWidth size="small" sx={fieldSx} />
            <TextField label="Cc" value={emailForm.cc} onChange={handleEmailChange("cc")} fullWidth size="small" sx={fieldSx} />
            <TextField label="Subject" value={emailForm.subject} onChange={handleEmailChange("subject")} fullWidth size="small" sx={fieldSx} />
            <TextField label="Message" multiline rows={6} value={emailForm.message} onChange={handleEmailChange("message")} fullWidth sx={fieldSx} />
            <Box>
              <Button variant="outlined" component="label" size="small">
                Attach Files
                <input type="file" multiple hidden onChange={handleAttachmentChange} />
              </Button>
              {emailForm.attachments.map((f, idx) => (
                <Typography key={idx} variant="caption" sx={{ ml: 1, display: "block" }}>
                  {f.name}
                </Typography>
              ))}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="contained" onClick={handleSendMessage}>
                Send Email
              </Button>
            </Box>
          </Stack>
        </Section>

        <Section title="Text message">
          {smsSent && (
            <Alert severity="success" sx={{ mb: 1.5 }}>
              Your text message has been sent successfully. Your provider will respond to you as soon as possible.
            </Alert>
          )}
          <Stack spacing={1.75} sx={{ pt: 0.5 }}>
            <TextField
              label="Admin/Provider Phone Number"
              value={smsForm.phone}
              onChange={handleSMSChange("phone")}
              fullWidth
              size="small"
              placeholder="+1234567890"
              helperText="Organization admin or provider phone number"
              sx={fieldSx}
            />
            <TextField
              label="Message"
              multiline
              rows={5}
              value={smsForm.message}
              onChange={handleSMSChange("message")}
              fullWidth
              helperText="Your message will be prefixed with your name automatically"
              sx={fieldSx}
            />
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="contained" onClick={handleSendSMS}>
                Send Text Message
              </Button>
            </Box>
          </Stack>
        </Section>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, maxWidth: "100%" }}>
      <Typography variant="h1" sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
        Patient Portal
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
        Your information, appointments and messages
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, val) => setTab(val)}
        aria-label="dashboard-tabs"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: `1px solid ${BORDER}`, mt: 1, mb: 1.5 }}
      >
        <Tab value="myinfo" label="My Information" />
        <Tab value="manage" label="Manage Appointments" />
        <Tab value="message" label="Message my Provider" />
        {currentUser?.role !== "patient" && <Tab value="calendar" label="Calendar" />}
      </Tabs>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 320px" },
          gap: 1.75,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {tab === "myinfo" && myInfoTab}
          {tab === "manage" && manageTab}
          {tab === "message" && messageTab}
          {tab === "calendar" && currentUser?.role !== "patient" && (
            <CalendarView
              onUpdate={() => setRefreshFlag((prev) => !prev)}
              showBackButton={currentUser?.role !== "patient"}
            />
          )}
        </Box>
        <Section title="Announcements">
          <AnnouncementDisplay />
        </Section>
      </Box>

      <Menu anchorEl={apptMenu.anchor} open={Boolean(apptMenu.anchor)} onClose={() => setApptMenu({ anchor: null, appt: null })}>
        <MenuItem
          onClick={() => {
            handleEditClick(apptMenu.appt);
            setApptMenu({ anchor: null, appt: null });
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            handleDelete(apptMenu.appt.id);
            setApptMenu({ anchor: null, appt: null });
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default DashboardPage;
