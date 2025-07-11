import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/**
 * Custom hook for managing today's appointments and status updates
 * Handles fetching daily appointments and updating their status (arrived, no_show)
 */
export const useTodaysAppointments = (token) => {
    const [todaysAppointments, setTodaysAppointments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch today's appointments
    const fetchTodaysAppointments = useCallback(async () => {
        if (!token) return;

        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${API_BASE_URL}/api/appointments/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const filtered = response.data.filter((appt) => {
                if (!appt.appointment_datetime) return false;
                const apptDate = new Date(appt.appointment_datetime);
                return apptDate >= today && apptDate < tomorrow;
            });

            setTodaysAppointments(filtered);
        } catch (err) {
            console.error('Error fetching today\'s appointments:', err);
            setError('Failed to fetch today\'s appointments');
            setTodaysAppointments([]);
        } finally {
            setLoading(false);
        }
    }, [token]);

    // Update appointment status (arrived/no_show)
    const updateAppointmentStatus = useCallback(async (appointmentId, field, value) => {
        if (!token) return false;

        try {
            const updateData = {};
            updateData[field] = value;

            // Mutual exclusivity: arrived and no_show cannot both be true
            if (field === 'no_show' && value) {
                updateData.arrived = false;
            }
            if (field === 'arrived' && value) {
                updateData.no_show = false;
            }

            await axios.patch(
                `${API_BASE_URL}/api/appointments/${appointmentId}/status/`,
                updateData,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            // Refresh today's appointments
            await fetchTodaysAppointments();
            return true;
        } catch (err) {
            console.error('Error updating appointment status:', err);
            setError('Failed to update appointment status');
            return false;
        }
    }, [token, fetchTodaysAppointments]);

    // Auto-fetch on mount
    useEffect(() => {
        fetchTodaysAppointments();
    }, [fetchTodaysAppointments]);

    // Sort today's appointments by time
    const sortedTodaysAppointments = [...todaysAppointments].sort(
        (a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime)
    );

    // Calculate summary statistics
    const totalToday = todaysAppointments.length;
    const doctorPatientMap = {};

    todaysAppointments.forEach((appt) => {
        const doctor = appt.provider_name ||
            (appt.provider
                ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                : 'Unknown'
            );

        if (!doctorPatientMap[doctor]) doctorPatientMap[doctor] = 0;
        doctorPatientMap[doctor] += 1;
    });

    return {
        todaysAppointments: sortedTodaysAppointments,
        loading,
        error,
        totalToday,
        doctorPatientMap,
        updateAppointmentStatus,
        refreshTodaysAppointments: fetchTodaysAppointments
    };
};
