import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing appointment search functionality
 * Handles fetching, filtering, and searching appointments
 */
export const useAppointmentSearch = (getAuthToken) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);

    const fetchAppointments = async (searchText = '') => {
        try {
            const token = getAuthToken();
            const res = await axios.get(`${API_BASE_URL}/api/appointments/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const lowerQuery = searchText.trim().toLowerCase();
            const filtered = res.data.filter((appt) => {
                const patientName =
                    appt.patient_name ||
                    (appt.patient
                        ? `${appt.patient.first_name} ${appt.patient.last_name}`
                        : '');
                const providerName =
                    appt.provider_name ||
                    (appt.provider
                        ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                        : '');
                const dateTime = appt.appointment_datetime
                    ? new Date(appt.appointment_datetime).toLocaleString()
                    : '';
                const description = appt.description || '';
                const duration = appt.duration_minutes
                    ? appt.duration_minutes.toString()
                    : '';
                const status = appt.status || '';
                const combined =
                    `${patientName} ${providerName} ${dateTime} ${description} ${duration} ${status}`.toLowerCase();
                return combined.includes(lowerQuery);
            });

            setResults(filtered);
        } catch (err) {
            console.error('Fetch failed', err);
        }
    };

    useEffect(() => {
        fetchAppointments(query);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on component mount, search is handled separately

    const handleSearch = async (e) => {
        e.preventDefault();
        fetchAppointments(query);
    };

    const handleDeleteAppointment = async (appointmentId) => {
        if (window.confirm('Are you sure you want to delete this appointment?')) {
            try {
                const token = getAuthToken();
                await axios.delete(
                    `${API_BASE_URL}/api/appointments/${appointmentId}/`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );
                fetchAppointments(query);
            } catch (err) {
                alert('Failed to delete appointment.');
            }
        }
    };

    const sortedResults = [...results].sort(
        (a, b) =>
            new Date(b.appointment_datetime) - new Date(a.appointment_datetime)
    );

    return {
        query,
        setQuery,
        results,
        sortedResults,
        handleSearch,
        handleDeleteAppointment,
        fetchAppointments
    };
};
