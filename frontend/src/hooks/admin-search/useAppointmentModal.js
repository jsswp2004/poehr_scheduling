import { useState } from 'react';

/**
 * Custom hook for managing appointment details modal
 * Handles modal state and selected appointment
 */
export const useAppointmentModal = () => {
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const openAppointmentDetails = (appointment) => {
        setSelectedAppointment(appointment);
        setDetailsOpen(true);
    };

    const closeAppointmentDetails = () => {
        setSelectedAppointment(null);
        setDetailsOpen(false);
    };

    return {
        selectedAppointment,
        detailsOpen,
        openAppointmentDetails,
        closeAppointmentDetails
    };
};
