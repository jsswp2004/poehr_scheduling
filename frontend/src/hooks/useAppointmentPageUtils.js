import { jwtDecode } from 'jwt-decode';

/**
 * Custom hook for appointment page utilities
 * Provides user greeting, name extraction, and role checking
 */
export const useAppointmentPageUtils = (token) => {
    // Get user's first name from token
    const getUserFirstName = () => {
        try {
            if (!token) return '';
            const decoded = jwtDecode(token);
            return decoded.first_name || decoded.username || '';
        } catch {
            return '';
        }
    };

    // Get greeting based on time of day
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    // Check if user is admin
    const checkIsAdmin = () => {
        try {
            if (!token) return false;
            const decoded = jwtDecode(token);
            const role = decoded.role || '';
            return role === 'admin' || role === 'system_admin' || role === 'registrar';
        } catch {
            return false;
        }
    };

    // Format provider name
    const formatProviderName = (appointment) => {
        return appointment.provider_name ||
            (appointment.provider &&
                (appointment.provider.first_name || appointment.provider.last_name)
                ? `Dr. ${appointment.provider.first_name || ''} ${appointment.provider.last_name || ''}`.trim()
                : '-');
    };

    // Format patient name
    const formatPatientName = (appointment) => {
        return appointment.patient_name ||
            (appointment.patient &&
                `${appointment.patient.first_name} ${appointment.patient.last_name}`) ||
            '-';
    };

    // Format appointment time
    const formatAppointmentTime = (dateTime) => {
        if (!dateTime) return '-';
        return new Date(dateTime).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Format full datetime
    const formatAppointmentDateTime = (dateTime) => {
        if (!dateTime) return '-';
        return new Date(dateTime).toLocaleString();
    };

    return {
        userName: getUserFirstName(),
        greeting: getGreeting(),
        isAdmin: checkIsAdmin(),
        formatProviderName,
        formatPatientName,
        formatAppointmentTime,
        formatAppointmentDateTime
    };
};
