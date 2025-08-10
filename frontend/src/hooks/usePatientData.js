import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { getValidToken, clearAuthData } from '../utils/auth';

export const usePatientData = (navigate) => {
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchPatientWithToken = useCallback(async (patientId, token) => {
        if (!patientId || !token) return;

        setLoading(true);
        setError(null);

        try {
            console.log('📡 Fetching patient data with provided token...');
            const response = await api.get(`/api/users/patients/by-user/${patientId}/`);

            console.log('✅ Patient data loaded');
            setPatient(response.data);
            return response.data;
        } catch (err) {
            console.error('❌ Error fetching patient:', err);
            setError(err);

            if (err?.response?.status === 401) {
                clearAuthData();
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    const fetchPatient = useCallback(async (patientId) => {
        if (!patientId) return;

        setLoading(true);
        setError(null);

        try {
            const token = await getValidToken();
            if (!token) {
                clearAuthData();
                navigate('/login');
                return;
            }

            console.log('📡 Fetching patient data...');
            const response = await api.get(`/api/users/patients/by-user/${patientId}/`);

            console.log('✅ Patient data loaded');
            setPatient(response.data);
            return response.data;
        } catch (err) {
            console.error('❌ Error fetching patient:', err);
            setError(err);

            if (err?.response?.status === 401) {
                clearAuthData();
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    return {
        patient,
        setPatient,
        loading,
        error,
        fetchPatient,
        fetchPatientWithToken
    };
};
