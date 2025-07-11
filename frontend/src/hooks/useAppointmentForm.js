import { useState } from 'react';

export const useAppointmentForm = () => {
    const [showAppointmentForm, setShowAppointmentForm] = useState(false);

    const openAppointmentForm = () => {
        setShowAppointmentForm(true);
    };

    const closeAppointmentForm = () => {
        setShowAppointmentForm(false);
    };

    const toggleAppointmentForm = () => {
        setShowAppointmentForm(prev => !prev);
    };

    return {
        showAppointmentForm,
        openAppointmentForm,
        closeAppointmentForm,
        toggleAppointmentForm,
    };
};
