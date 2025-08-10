import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken, clearAuthData } from '../utils/auth';

/**
 * Custom hook for managing patient information after registration
 * Handles fetching, editing, and deleting registered patients in admin mode
 */
export const usePatientManagement = () => {
    const [registeredPatient, setRegisteredPatient] = useState(null);
    const [patientEditData, setPatientEditData] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch patient data after registration
    const fetchRegisteredPatient = async (username) => {
        setLoading(true);
        setError(null);

        try {
            const token = await getValidToken();
            if (!token) {
                setError('No valid token available');
                return null;
            }

            const response = await axios.get(`${API_BASE_URL}/api/users/patients/`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { search: username }
            });

            if (response.data.results && response.data.results.length > 0) {
                const newPatient = response.data.results[0];
                setRegisteredPatient(newPatient);
                setPatientEditData(newPatient);
                return newPatient;
            }

            return null;
        } catch (err) {
            console.error('Failed to fetch registered patient:', err);
            setError('Failed to fetch patient data');
            return null;
        } finally {
            setLoading(false);
        }
    };

    // Handle patient edit form changes
    const handlePatientEditChange = (e) => {
        setPatientEditData({
            ...patientEditData,
            [e.target.name]: e.target.value,
        });
    };

    // Handle phone number formatting
    const handlePhoneChange = (value) => {
        const raw = value.replace(/\D/g, '');
        setPatientEditData(prev => ({
            ...prev,
            phone_number: raw,
        }));
    };

    // Start editing mode
    const startEdit = () => {
        setEditMode(true);
    };

    // Cancel editing
    const cancelEdit = () => {
        setPatientEditData(registeredPatient);
        setEditMode(false);
    };

    // Save patient changes
    const savePatient = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = await getValidToken();
            if (!token) {
                setError('Session expired. Please log in again.');
                clearAuthData();
                return false;
            }

            const updateData = {
                ...patientEditData,
                provider_id: patientEditData.provider,
            };

            await axios.put(
                `${API_BASE_URL}/api/users/patients/by-user/${registeredPatient.user_id}/edit/`,
                updateData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setRegisteredPatient(patientEditData);
            setEditMode(false);
            return true;
        } catch (err) {
            console.error('Update error:', err);
            setError('Failed to update patient information');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Delete patient
    const deletePatient = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = await getValidToken();
            if (!token) {
                setError('Session expired. Please log in again.');
                clearAuthData();
                return false;
            }

            await axios.delete(
                `${API_BASE_URL}/api/users/patients/${registeredPatient.id}/`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setRegisteredPatient(null);
            setPatientEditData({});
            setDeleteDialogOpen(false);
            return true;
        } catch (err) {
            console.error('Delete error:', err);
            setError('Failed to delete patient');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Clear patient data (for new registration)
    const clearPatientData = () => {
        setRegisteredPatient(null);
        setPatientEditData({});
        setEditMode(false);
        setDeleteDialogOpen(false);
        setError(null);
    };

    return {
        registeredPatient,
        patientEditData,
        editMode,
        deleteDialogOpen,
        loading,
        error,
        setDeleteDialogOpen,
        handlePatientEditChange,
        handlePhoneChange,
        startEdit,
        cancelEdit,
        savePatient,
        deletePatient,
        fetchRegisteredPatient,
        clearPatientData
    };
};
