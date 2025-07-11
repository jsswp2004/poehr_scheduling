import { useState } from 'react';

/**
 * Custom hook for managing appointment details dialog
 * Handles opening/closing the details modal and selected appointment state
 */
export const useAppointmentDetails = () => {
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const openDetails = (appointment) => {
        setSelectedAppointment(appointment);
        setDetailsOpen(true);
    };

    const closeDetails = () => {
        setSelectedAppointment(null);
        setDetailsOpen(false);
    };

    return {
        selectedAppointment,
        detailsOpen,
        openDetails,
        closeDetails
    };
};
