import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/**
 * Custom hook for managing appointments list functionality
 * Handles fetching, searching, pagination, and CRUD operations
 */
export const useAppointmentsList = (token) => {
    const [appointments, setAppointments] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    // Fetch all appointments
    const fetchAppointments = useCallback(async (searchText = '') => {
        if (!token) return;

        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${API_BASE_URL}/api/appointments/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const lowerQuery = searchText.trim().toLowerCase();

            if (!lowerQuery) {
                setAppointments(response.data);
                return;
            }

            // Client-side filtering
            const filtered = response.data.filter((appt) => {
                const patientName = appt.patient_name ||
                    (appt.patient ? `${appt.patient.first_name} ${appt.patient.last_name}` : '');

                const providerName = appt.provider_name ||
                    (appt.provider ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim() : '');

                let dateTimeFormats = [];
                if (appt.appointment_datetime) {
                    const dateObj = new Date(appt.appointment_datetime);
                    dateTimeFormats.push(dateObj.toLocaleString());
                    dateTimeFormats.push(dateObj.toLocaleDateString());
                    dateTimeFormats.push(dateObj.toLocaleTimeString());
                    dateTimeFormats.push(dateObj.toISOString().slice(0, 10));
                    dateTimeFormats.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`);
                }

                const dateTimeStr = dateTimeFormats.join(' ');
                const description = appt.description || '';
                const duration = appt.duration_minutes ? appt.duration_minutes.toString() : '';
                const status = appt.status || '';
                const clinic = appt.title || '';
                const id = appt.id ? appt.id.toString() : '';

                const combined = `
          ${patientName} 
          ${providerName} 
          ${dateTimeStr} 
          ${description} 
          ${duration} 
          ${status}
          ${clinic}
          ${id}
        `.toLowerCase();

                return combined.includes(lowerQuery);
            });

            setAppointments(filtered);
        } catch (err) {
            console.error('Error fetching appointments:', err);
            setError('Failed to fetch appointments');
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Delete appointment
    const deleteAppointment = useCallback(async (appointmentId) => {
        if (!token) return false;

        try {
            await axios.delete(`${API_BASE_URL}/api/appointments/${appointmentId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Refresh the appointments list
            await fetchAppointments(searchQuery);
            return true;
        } catch (err) {
            console.error('Error deleting appointment:', err);
            setError('Failed to delete appointment');
            return false;
        }
    }, [token, searchQuery, fetchAppointments]);

    // Handle search
    const handleSearch = useCallback((query) => {
        setSearchQuery(query);
        setPage(1); // Reset to first page when searching
    }, []);

    // Auto-fetch on mount and when search query changes
    useEffect(() => {
        fetchAppointments(searchQuery);
    }, [fetchAppointments, searchQuery]);

    // Sort appointments by date (latest first)
    const sortedAppointments = [...appointments].sort((a, b) => {
        const dateA = new Date(a.appointment_datetime);
        const dateB = new Date(b.appointment_datetime);
        return dateB - dateA;
    });

    // Paginated results
    const paginatedAppointments = sortedAppointments.slice(
        (page - 1) * rowsPerPage,
        page * rowsPerPage
    );

    const totalPages = Math.ceil(appointments.length / rowsPerPage);

    return {
        appointments: paginatedAppointments,
        allAppointments: sortedAppointments,
        searchQuery,
        loading,
        error,
        page,
        totalPages,
        rowsPerPage,
        setPage,
        handleSearch,
        fetchAppointments,
        deleteAppointment,
        refreshAppointments: () => fetchAppointments(searchQuery)
    };
};
