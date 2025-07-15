import React, { useState } from "react";
import {
    Box,
    Stack,
    Typography,
    Paper,
    Tabs,
    Tab,
    Grid,
    Divider,
    TextField,
    Button,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CalendarView from "../components/CalendarView";
import AnnouncementDisplay from "../components/AnnouncementDisplay";
import { useAuth } from "../hooks/useAuth";
import { useAppointments } from "../hooks/useAppointments";
import { useCommunication } from "../hooks/useCommunication";
import { useDoctors } from "../hooks/useDoctors";
import { useProfile } from "../hooks/useProfile";
import {
    AppointmentForm,
    AppointmentsList,
    CommunicationPanel,
    UserInfoPanel,
} from "../components/dashboard";
import LoadingSpinner from "../components/common/LoadingSpinner";

function DashboardPage() {
    const [tab, setTab] = useState("myinfo");
    const [refreshFlag, setRefreshFlag] = useState(false);

    // Custom hooks
    const { currentUser } = useAuth();
    const { updateProfileField } = useProfile();
    const {
        appointments,
        availableSlots,
        selectedSlot,
        loading: appointmentLoading,
        editMode,
        editingId,
        formData,
        setSelectedSlot,
        updateFormData,
        loadAppointments,
        loadAvailableSlots,
        createAppointment,
        updateAppointment,
        deleteAppointment,
        startEditing,
        cancelEditing,
    } = useAppointments();

    const {
        emailForm,
        smsForm,
        emailSending,
        smsSending,
        messageSent,
        smsSent,
        updateEmailForm,
        updateSmsForm,
        sendEmail,
        sendSMS,
        handleAttachment,
        removeAttachment,
    } = useCommunication();

    const { doctors, selectedDoctor, selectDoctor, getDoctorName } = useDoctors();

    // User info editing states
    const [phoneEditing, setPhoneEditing] = useState(false);
    const [smsConsentEditing, setSmsConsentEditing] = useState(false);
    const [tempPhoneNumber, setTempPhoneNumber] = useState("");
    const [tempSmsConsent, setTempSmsConsent] = useState(false);

    // Handlers
    const handleDoctorChange = (doctor) => {
        selectDoctor(doctor);
        updateFormData("provider", doctor?.value || doctor?.id);
        if (doctor && doctor.value) {
            loadAvailableSlots(doctor.value, new Date().toISOString().split("T")[0]);
        }
    };

    const handleSlotSelect = (slot) => {
        setSelectedSlot(slot);
        if (slot) {
            // Convert the slot (date string) to the format expected by datetime-local input
            const date = new Date(slot);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

            console.log('📅 Selected slot:', slot, 'Formatted:', formattedDateTime);
            updateFormData("appointment_datetime", formattedDateTime);
        }
    };

    const handleSubmitAppointment = async (e) => {
        if (e) {
            e.preventDefault();
        }
        try {
            if (editMode && editingId) {
                await updateAppointment(editingId, formData);
            } else {
                await createAppointment();
            }
            setRefreshFlag(!refreshFlag); // Trigger calendar refresh
        } catch (error) {
            console.error("Error submitting appointment:", error);
        }
    };

    const handleEditAppointment = (appointment) => {
        startEditing(appointment);
        setTab("appointments"); // Switch to appointments tab
    };

    // User info handlers
    const handlePhoneEdit = () => {
        setTempPhoneNumber(currentUser?.phone_number || "");
        setPhoneEditing(true);
    };

    const handlePhoneSave = async () => {
        try {
            await updateProfileField('phone_number', tempPhoneNumber);
            setPhoneEditing(false);
            // The UI will update automatically due to the profile state update
        } catch (error) {
            console.error('Error updating phone number:', error);
            // You might want to show an error notification here
        }
    };

    const handlePhoneCancel = () => {
        setTempPhoneNumber("");
        setPhoneEditing(false);
    };

    const handleSmsConsentEdit = () => {
        setTempSmsConsent(currentUser?.sms_consent || false);
        setSmsConsentEditing(true);
    };

    const handleSmsConsentSave = async () => {
        try {
            await updateProfileField('sms_consent', tempSmsConsent);
            setSmsConsentEditing(false);
            // The UI will update automatically due to the profile state update
        } catch (error) {
            console.error('Error updating SMS consent:', error);
            // You might want to show an error notification here
        }
    };

    const handleSmsConsentCancel = () => {
        setTempSmsConsent(false);
        setSmsConsentEditing(false);
    };

    if (!currentUser) {
        return <LoadingSpinner message="Loading dashboard..." />;
    }

    // Debug: Check if doctors are loaded
    console.log('🩺 Doctors data:', doctors, 'Length:', doctors?.length);

    return (
        <Box sx={{ mt: 0, p: 3, maxWidth: "100%", mx: "auto" }}>
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
                        <Tab value="myinfo" label="MY INFORMATION" />
                        <Tab value="appointments" label="MANAGE APPOINTMENTS" />
                        <Tab value="communication" label="MESSAGE MY PROVIDER" />
                        <Tab value="calendar" label="CALENDAR" />
                    </Tabs>
                    <Divider sx={{ mb: 2 }} />

                    {/* Tab Content */}
                    {tab === "myinfo" && (
                        <UserInfoPanel
                            currentUser={currentUser}
                            phoneEditing={phoneEditing}
                            smsConsentEditing={smsConsentEditing}
                            tempPhoneNumber={tempPhoneNumber}
                            tempSmsConsent={tempSmsConsent}
                            onPhoneEdit={handlePhoneEdit}
                            onPhoneCancel={handlePhoneCancel}
                            onPhoneSave={handlePhoneSave}
                            onSmsConsentEdit={handleSmsConsentEdit}
                            onSmsConsentCancel={handleSmsConsentCancel}
                            onSmsConsentSave={handleSmsConsentSave}
                            onTempPhoneChange={setTempPhoneNumber}
                            onTempSmsConsentChange={setTempSmsConsent}
                        />
                    )}

                    {tab === "appointments" && (
                        <Box>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
                                <Box sx={{ flex: 1, minWidth: 350 }}>
                                    <form onSubmit={handleSubmitAppointment}>
                                        <Typography variant="h6" sx={{ mb: 2 }}>
                                            {editMode ? "Edit Appointment" : "Request an Appointment"}
                                        </Typography>
                                        <Stack spacing={2}>
                                            <TextField
                                                label="Title"
                                                name="title"
                                                value={formData.title}
                                                onChange={(e) => updateFormData("title", e.target.value)}
                                                fullWidth
                                                required
                                            />
                                            <TextField
                                                label="Description"
                                                name="description"
                                                value={formData.description}
                                                onChange={(e) => updateFormData("description", e.target.value)}
                                                multiline
                                                rows={2}
                                                fullWidth
                                            />
                                            <TextField
                                                label="Date & Time"
                                                name="appointment_datetime"
                                                type="datetime-local"
                                                value={formData.appointment_datetime}
                                                onChange={(e) => updateFormData("appointment_datetime", e.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                                fullWidth
                                                required
                                            />
                                            <TextField
                                                label="Duration (minutes)"
                                                name="duration_minutes"
                                                type="number"
                                                value={formData.duration_minutes}
                                                onChange={(e) => updateFormData("duration_minutes", e.target.value)}
                                                fullWidth
                                                required
                                            />
                                            <FormControl fullWidth>
                                                <InputLabel id="doctor-select-label">Select Doctor</InputLabel>
                                                <Select
                                                    labelId="doctor-select-label"
                                                    value={selectedDoctor?.value || ""}
                                                    label="Select Doctor"
                                                    onChange={(e) => {
                                                        const doctorId = e.target.value;
                                                        const doctor = doctors.find(doc => doc.id === doctorId);
                                                        if (doctor) {
                                                            const doctorOption = {
                                                                value: doctor.id,
                                                                label: `Dr. ${doctor.first_name} ${doctor.last_name}`
                                                            };
                                                            handleDoctorChange(doctorOption);
                                                        } else {
                                                            selectDoctor(null);
                                                        }
                                                    }}
                                                >
                                                    <MenuItem value="">
                                                        <em>Search or select doctor...</em>
                                                    </MenuItem>
                                                    {doctors && doctors.length > 0 ? (
                                                        doctors.map((doctor) => (
                                                            <MenuItem key={doctor.id} value={doctor.id}>
                                                                Dr. {doctor.first_name} {doctor.last_name}
                                                            </MenuItem>
                                                        ))
                                                    ) : (
                                                        <MenuItem disabled>
                                                            <em>No doctors available</em>
                                                        </MenuItem>
                                                    )}
                                                </Select>
                                            </FormControl>
                                            <Stack direction="row" spacing={2}>
                                                <Button
                                                    type="submit"
                                                    variant="contained"
                                                    color="primary"
                                                    fullWidth
                                                >
                                                    {editMode ? "Update Appointment" : "CREATE APPOINTMENT"}
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="secondary"
                                                    fullWidth
                                                    onClick={() => {
                                                        updateFormData("title", "");
                                                        updateFormData("description", "");
                                                        updateFormData("appointment_datetime", "");
                                                        updateFormData("duration_minutes", 30);
                                                        selectDoctor(null);
                                                        cancelEditing();
                                                    }}
                                                >
                                                    CLEAR FORM
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    </form>
                                    <Box sx={{ mt: 4 }}>
                                        <Typography variant="subtitle1" sx={{ mb: 1 }}>
                                            Available Dates for {selectedDoctor?.label || "Selected Doctor"}
                                        </Typography>
                                        <Paper
                                            variant="outlined"
                                            sx={{ maxHeight: 200, overflow: "auto", p: 1 }}
                                        >
                                            {availableSlots?.length > 0 ? (
                                                availableSlots.map((slot, idx) => (
                                                    <Button
                                                        key={idx}
                                                        variant={selectedSlot === slot ? "contained" : "outlined"}
                                                        sx={{ m: 0.5 }}
                                                        size="small"
                                                        onClick={() => handleSlotSelect(slot)}
                                                    >
                                                        {new Date(slot).toLocaleString()}
                                                    </Button>
                                                ))
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
                                    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                                        <Box sx={{ overflow: 'auto', maxHeight: 350 }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                                                        <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Visit</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date & Time</th>
                                                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {appointments?.filter(a => new Date(a.appointment_datetime) >= new Date()).map((appointment) => (
                                                        <tr key={appointment.id}>
                                                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                                                                {appointment.title || "Untitled"}
                                                            </td>
                                                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                                                                {appointment.appointment_datetime
                                                                    ? new Date(appointment.appointment_datetime).toLocaleString()
                                                                    : "Unknown"}
                                                            </td>
                                                            <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                                                                <IconButton
                                                                    size="small"
                                                                    color="warning"
                                                                    onClick={() => handleEditAppointment(appointment)}
                                                                    sx={{ mr: 1 }}
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => deleteAppointment(appointment.id)}
                                                                >
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </Box>
                                    </Paper>
                                </Box>
                            </Stack>
                        </Box>
                    )}

                    {tab === "communication" && (
                        <CommunicationPanel
                            emailForm={emailForm}
                            smsForm={smsForm}
                            emailSending={emailSending}
                            smsSending={smsSending}
                            messageSent={messageSent}
                            smsSent={smsSent}
                            onEmailFormChange={updateEmailForm}
                            onSmsFormChange={updateSmsForm}
                            onSendEmail={sendEmail}
                            onSendSMS={sendSMS}
                            onAttachment={handleAttachment}
                            onRemoveAttachment={removeAttachment}
                        />
                    )}

                    {tab === "calendar" && (
                        <Box sx={{ height: 600 }}>
                            <CalendarView
                                appointments={appointments}
                                refreshFlag={refreshFlag}
                                onAppointmentClick={handleEditAppointment}
                            />
                        </Box>
                    )}
                </Box>

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
