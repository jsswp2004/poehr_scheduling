import React, { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import CreateAppointmentForm from '../components/CreateAppointmentForm';

// Custom hooks
import { usePatientDetail } from '../hooks/usePatientDetail';
import { usePatientDetailData } from '../hooks/usePatientDetailData';
import { useAppointmentForm } from '../hooks/useAppointmentForm';

// Components
import {
    PatientHeader,
    ProfilePictureUpload,
    PatientInformationForm,
} from '../components/patient-detail';

function PatientDetailPageRefactored() {
    const { id } = useParams();

    // Custom hooks
    const {
        patient,
        editMode,
        setEditMode,
        formData,
        loading,
        saving,
        handleChange,
        handleSubmit,
        handleCancel,
        handleProfilePictureUpload,
        handleResetPassword,
    } = usePatientDetail(id);

    const {
        doctors,
        organizations,
        loading: dataLoading,
    } = usePatientDetailData();

    const {
        showAppointmentForm,
        openAppointmentForm,
        closeAppointmentForm,
    } = useAppointmentForm();

    // Stable callback for address changes to prevent re-renders
    const handleAddressChange = useCallback((newAddress) => {
        const syntheticEvent = {
            target: {
                name: 'address',
                value: newAddress,
            },
        };
        handleChange(syntheticEvent);
    }, [handleChange]);

    // Enhanced handleChange to handle provider-organization linking
    const enhancedHandleChange = useCallback((e) => {
        const { name, value } = e.target;

        // If provider is changed, update organization to match provider's org
        if (name === 'provider') {
            const selectedProvider = doctors.find(
                (doc) => String(doc.id) === String(value)
            );
            if (selectedProvider && selectedProvider.organization) {
                // Create synthetic events for both provider and organization
                handleChange(e); // Handle provider change
                const orgEvent = {
                    target: {
                        name: 'organization',
                        value: selectedProvider.organization,
                    },
                };
                handleChange(orgEvent); // Handle organization change
                return;
            }
        }

        handleChange(e);
    }, [handleChange, doctors]);

    const handleEditToggle = () => {
        setEditMode(true);
    };

    const handleCreateAppointment = () => {
        openAppointmentForm();
    };

    // Loading states
    if (loading || dataLoading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '50vh',
                }}
            >
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading patient details...</Typography>
            </Box>
        );
    }

    if (!patient) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography>Patient not found</Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                mt: 0,
                boxShadow: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
                p: 3,
            }}
        >
            {/* Header and Profile Picture */}
            <PatientHeader patient={patient} />

            {/* Profile Picture Upload (Edit Mode Only) */}
            {editMode && (
                <ProfilePictureUpload onFileUpload={handleProfilePictureUpload} />
            )}

            {/* Patient Information Form or Appointment Form */}
            {!showAppointmentForm ? (
                <PatientInformationForm
                    formData={formData}
                    editMode={editMode}
                    saving={saving}
                    doctors={doctors}
                    organizations={organizations}
                    onSubmit={handleSubmit}
                    onChange={enhancedHandleChange}
                    onAddressChange={handleAddressChange}
                    onCancel={handleCancel}
                    onCreateAppointment={handleCreateAppointment}
                    onResetPassword={handleResetPassword}
                    onEditToggle={handleEditToggle}
                />
            ) : (
                <div className="mt-4">
                    <CreateAppointmentForm
                        defaultProviderId={patient.provider}
                        patientName={`${patient.first_name} ${patient.last_name}`}
                        patientId={patient.user_id}
                        appointmentToEdit={null}
                        onSuccess={() => {
                            closeAppointmentForm();
                            // Navigate back to patients list could be handled here
                            // navigate('/patients');
                        }}
                        onCancel={closeAppointmentForm}
                    />
                </div>
            )}
        </Box>
    );
}

export default PatientDetailPageRefactored;
