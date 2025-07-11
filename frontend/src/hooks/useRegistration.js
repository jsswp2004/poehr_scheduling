import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken } from '../utils/authUtils';

/**
 * Custom hook for managing registration form data and submission
 * Handles form state, validation, and registration API calls
 */
export const useRegistration = (adminMode = false) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: adminMode ? 'patient' : 'patient',
        assigned_doctor: '',
        phone_number: '',
        organization_name: '',
    });

    const [isPatient, setIsPatient] = useState(adminMode ? true : true);
    const [hasProvider, setHasProvider] = useState(null); // 'yes' or 'no'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Handle form field changes
    const handleFormChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    // Handle patient type change
    const handlePatientTypeChange = (isPatientValue) => {
        setIsPatient(isPatientValue);
        setFormData({
            ...formData,
            role: isPatientValue ? 'patient' : ''
        });
    };

    // Handle provider selection change
    const handleProviderSelectionChange = (hasProviderValue) => {
        setHasProvider(hasProviderValue);
        if (hasProviderValue === 'no') {
            setFormData({
                ...formData,
                assigned_doctor: ''
            });
        }
    };

    // Handle doctor selection
    const handleDoctorSelection = (selectedDoctor) => {
        setFormData({
            ...formData,
            assigned_doctor: selectedDoctor?.value || ''
        });
    };

    // Validate form data
    const validateForm = () => {
        if (isPatient && hasProvider === 'no' && (!formData.email || !formData.phone_number)) {
            return 'Please fill out both email and phone number.';
        }
        return null;
    };

    // Submit registration
    const submitRegistration = async () => {
        setLoading(true);
        setError(null);

        try {
            const validationError = validateForm();
            if (validationError) {
                setError(validationError);
                return null;
            }

            const payload = {
                ...formData,
                role: isPatient ? 'patient' : formData.role || 'none',
                provider: formData.assigned_doctor,
            };

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

            return response.data;
        } catch (err) {
            console.error('Registration error:', err);
            setError('Registration failed. Please try again.');
            return null;
        } finally {
            setLoading(false);
        }
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            username: '',
            email: '',
            password: '',
            first_name: '',
            last_name: '',
            role: adminMode ? 'patient' : 'patient',
            assigned_doctor: '',
            phone_number: '',
            organization_name: '',
        });
        setHasProvider(null);
    };

    // Set organization from current user
    const setOrganizationFromCurrentUser = (orgName) => {
        setFormData(prevState => ({
            ...prevState,
            organization_name: orgName
        }));
    };

    return {
        formData,
        isPatient,
        hasProvider,
        loading,
        error,
        handleFormChange,
        handlePatientTypeChange,
        handleProviderSelectionChange,
        handleDoctorSelection,
        submitRegistration,
        resetForm,
        setOrganizationFromCurrentUser,
        validateForm
    };
};
