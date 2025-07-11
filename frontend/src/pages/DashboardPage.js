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
} from "@mui/material";
import CalendarView from "../components/CalendarView";
import AnnouncementDisplay from "../components/AnnouncementDisplay";
import { useAuth } from "../hooks/useAuth";
import { useAppointments } from "../hooks/useAppointments";
import { useCommunication } from "../hooks/useCommunication";
import { useDoctors } from "../hooks/useDoctors";
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
        updateFormData('provider', doctor);
        if (doctor) {
            loadAvailableSlots(doctor.id, new Date().toISOString().split('T')[0]);
        }
    };

    const handleSlotSelect = (slot) => {
        setSelectedSlot(slot);
        if (slot) {
            updateFormData('appointment_datetime', slot.value);
        }
    };

    const handleSubmitAppointment = async () => {
        try {
            if (editMode && editingId) {
                await updateAppointment(editingId, formData);
            } else {
                await createAppointment();
            }
            setRefreshFlag(!refreshFlag); // Trigger calendar refresh
        } catch (error) {
            console.error('Error submitting appointment:', error);
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

    const handlePhoneSave = () => {
        // TODO: Implement phone update API call
        setPhoneEditing(false);
    };

    const handlePhoneCancel = () => {
        setTempPhoneNumber("");
        setPhoneEditing(false);
    };

    const handleSmsConsentEdit = () => {
        setTempSmsConsent(currentUser?.sms_consent || false);
        setSmsConsentEditing(true);
    };

    const handleSmsConsentSave = () => {
        // TODO: Implement SMS consent update API call
        setSmsConsentEditing(false);
    };

    const handleSmsConsentCancel = () => {
        setTempSmsConsent(false);
        setSmsConsentEditing(false);
    };

    if (!currentUser) {
        return <LoadingSpinner message="Loading dashboard..." />;
    }

    return (
        <Box sx={{ padding: 3, maxWidth: 1400, margin: "0 auto" }}>
            <Typography variant="h4" gutterBottom align="center">
                Healthcare Dashboard
            </Typography>

            <Grid container spacing={3}>
                {/* Main Content - Left Side */}
                <Grid item xs={12} lg={8}>
                    <Paper elevation={3} sx={{ padding: 3 }}>
                        {/* Tab Navigation */}
                        <Tabs
                            value={tab}
                            onChange={(e, newValue) => setTab(newValue)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ marginBottom: 3 }}
                        >
                            <Tab label="My Information" value="myinfo" />
                            <Tab label="Appointments" value="appointments" />
                            <Tab label="Communication" value="communication" />
                            <Tab label="Calendar" value="calendar" />
                        </Tabs>

                        <Divider sx={{ marginBottom: 3 }} />

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
                            <Stack spacing={3}>
                                <AppointmentForm
                                    formData={formData}
                                    doctors={doctors}
                                    availableSlots={availableSlots}
                                    selectedSlot={selectedSlot}
                                    editMode={editMode}
                                    loading={appointmentLoading}
                                    onFormChange={updateFormData}
                                    onDoctorChange={handleDoctorChange}
                                    onSlotSelect={handleSlotSelect}
                                    onSubmit={handleSubmitAppointment}
                                    onCancel={cancelEditing}
                                />

                                <AppointmentsList
                                    appointments={appointments}
                                    editingId={editingId}
                                    onEdit={handleEditAppointment}
                                    onDelete={deleteAppointment}
                                    getDoctorName={getDoctorName}
                                />
                            </Stack>
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
                    </Paper>
                </Grid>

                {/* Sidebar - Right Side */}
                <Grid item xs={12} lg={4}>
                    <AnnouncementDisplay />
                </Grid>
            </Grid>
        </Box>
    );
}

export default DashboardPage;
