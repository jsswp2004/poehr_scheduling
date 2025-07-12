import React, { useEffect } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Box, Paper } from '@mui/material';

// Custom hooks
import { useRegistration } from '../hooks/useRegistration';
import { useRegistrationData } from '../hooks/useRegistrationData';
import { usePatientManagement } from '../hooks/usePatientManagement';
import { useRegistrationUtils } from '../hooks/useRegistrationUtils';

// Components
import {
    RegistrationForm,
    PatientInfoPanel,
    DeleteConfirmationDialog
} from '../components/registration';

/**
 * Refactored RegisterPage with modular components and hooks
 * 
 * Features:
 * - User registration with role-based fields
 * - Admin mode for patient management
 * - Doctor and organization selection
 * - Patient information display and editing
 * - Patient deletion with confirmation
 */
function RegisterPage({ adminMode = false }) {
    const navigate = useNavigate();

    // Custom hooks for business logic
    const registration = useRegistration(adminMode);
    const registrationData = useRegistrationData();
    const patientManagement = usePatientManagement();
    const utils = useRegistrationUtils();

    // Set organization from current user on mount
    useEffect(() => {
        const setUserOrganization = async () => {
            const orgName = await registrationData.fetchCurrentUserOrganization();
            if (orgName) {
                registration.setOrganizationFromCurrentUser(orgName);
            }
        };

        setUserOrganization();
    }, []);

    // Handle registration form submission
    const handleRegistrationSubmit = async (e) => {
        e.preventDefault();

        const result = await registration.submitRegistration();
        if (result) {
            toast.success('Registration successful!');

            // Fetch and display the created patient for both admin and non-admin modes
            const patient = await patientManagement.fetchRegisteredPatient(registration.formData.username);
            if (patient) {
                registration.resetForm();
            }
        } else if (registration.error) {
            toast.error(registration.error);
        }
    };

    // Handle patient edit save
    const handlePatientSave = async () => {
        const success = await patientManagement.savePatient();
        if (success) {
            toast.success('Patient information updated successfully!');
        } else if (patientManagement.error) {
            toast.error(patientManagement.error);
        }
    };

    // Handle patient deletion
    const handlePatientDelete = async () => {
        const success = await patientManagement.deletePatient();
        if (success) {
            toast.success('Patient deleted successfully!');
        } else if (patientManagement.error) {
            toast.error(patientManagement.error);
        }
    };

    return (
        <Box sx={{ mt: 0, maxWidth: '100vw', px: 2 }}>
            <Paper
                elevation={4}
                sx={{
                    borderRadius: 3,
                    minHeight: '70vh',
                    maxHeight: '75vh',
                    overflowY: 'auto',
                    p: 3,
                    display: 'flex',
                    gap: 3,
                }}
            >
                {/* Left Pane - Registration Form */}
                <RegistrationForm
                    adminMode={adminMode}
                    formData={registration.formData}
                    isPatient={registration.isPatient}
                    hasProvider={registration.hasProvider}
                    doctorOptions={registrationData.doctorOptions}
                    loading={registration.loading}
                    isLoggedIn={utils.isLoggedIn()}
                    onFormChange={registration.handleFormChange}
                    onPatientTypeChange={registration.handlePatientTypeChange}
                    onProviderSelectionChange={registration.handleProviderSelectionChange}
                    onDoctorSelection={registration.handleDoctorSelection}
                    onSubmit={handleRegistrationSubmit}
                    formatPhoneNumber={utils.formatPhoneNumber}
                    getContactValidationMessage={utils.getContactValidationMessage}
                />

                {/* Right Pane - Patient Information Display */}
                <PatientInfoPanel
                    registeredPatient={patientManagement.registeredPatient}
                    patientEditData={patientManagement.patientEditData}
                    editMode={patientManagement.editMode}
                    doctors={registrationData.doctors}
                    organizations={registrationData.organizations}
                    loading={patientManagement.loading}
                    onEditStart={patientManagement.startEdit}
                    onEditSave={handlePatientSave}
                    onEditCancel={patientManagement.cancelEdit}
                    onDelete={() => patientManagement.setDeleteDialogOpen(true)}
                    onPatientEditChange={patientManagement.handlePatientEditChange}
                    onPhoneChange={patientManagement.handlePhoneChange}
                    formatPhoneNumber={utils.formatPhoneNumber}
                />
            </Paper>

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmationDialog
                open={patientManagement.deleteDialogOpen}
                onClose={() => patientManagement.setDeleteDialogOpen(false)}
                onConfirm={handlePatientDelete}
                loading={patientManagement.loading}
            />
        </Box>
    );
}

export default RegisterPage;
