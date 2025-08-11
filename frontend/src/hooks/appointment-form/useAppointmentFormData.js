/**
 * Hook for managing appointment form data and validation
 */
import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import {
    validateAppointmentForm,
    prepareAppointmentPayload,
    isDateBlocked,
    checkAvailabilityConflict
} from '../../utils/appointment/appointmentUtils';

export const useAppointmentFormData = (appointmentToEdit, editMode, patientId, clinicEvents, token) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        appointment_datetime: '',
        duration_minutes: 30,
        recurrence: 'none',
        recurrence_end_date: '',
    });

    const [selectedClinicEvent, setSelectedClinicEvent] = useState(null);

    // Get user role from token when available
    let userRole = null;
    if (token) {
        try {
            const decoded = jwtDecode(token);
            userRole = decoded.role;
        } catch (err) {
            // ignore
        }
    }

    // Initialize form data when editing
    useEffect(() => {
        if (appointmentToEdit) {
            setFormData({
                title: appointmentToEdit.title || '',
                description: appointmentToEdit.description || '',
                appointment_datetime: appointmentToEdit.appointment_datetime
                    ? appointmentToEdit.appointment_datetime.slice(0, 16)
                    : '',
                duration_minutes: appointmentToEdit.duration_minutes || 30,
                recurrence: appointmentToEdit.recurrence || 'none',
                recurrence_end_date: appointmentToEdit.recurrence_end_date || '',
                status: appointmentToEdit.status || 'scheduled',
            });

            // Preselect clinic event
            if (clinicEvents.length > 0 && appointmentToEdit.title) {
                const matchedEvent = clinicEvents.find(
                    evt => evt.name === appointmentToEdit.title
                );
                setSelectedClinicEvent(
                    matchedEvent
                        ? { value: matchedEvent.id, label: matchedEvent.name }
                        : null
                );
            }
        }
    }, [appointmentToEdit, clinicEvents]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleClinicEventChange = (selected) => {
        setSelectedClinicEvent(selected);
        setFormData(prev => ({ ...prev, title: selected ? selected.label : '' }));
    };

    const validateForm = (selectedDoctor, blockedDays, holidays, providerBlocks) => {
        // Basic form validation
        const formErrors = validateAppointmentForm(
            formData,
            selectedClinicEvent,
            selectedDoctor,
            editMode,
            appointmentToEdit
        );

        if (formErrors.length > 0) {
            return { isValid: false, errors: formErrors };
        }

        // Date validation
        const dateCheck = isDateBlocked(formData.appointment_datetime, blockedDays, holidays);
        if (dateCheck.isBlocked) {
            return {
                isValid: false,
                errors: ['Appointments cannot be created on a blocked day or recognized holiday.']
            };
        }

        // Availability conflict check
        const appointmentStart = new Date(formData.appointment_datetime);
        const conflictResult = checkAvailabilityConflict(
            appointmentStart,
            formData.duration_minutes,
            selectedDoctor.value,
            providerBlocks,
            editMode,
            appointmentToEdit
        );

        if (conflictResult) {
            return { isValid: false, errors: [conflictResult] };
        }

        return { isValid: true, errors: [] };
    };

    const preparePayload = (selectedDoctor) => {
        return prepareAppointmentPayload(
            formData,
            selectedClinicEvent,
            selectedDoctor,
            patientId,
            appointmentToEdit,
            userRole
        );
    };

    return {
        formData,
        selectedClinicEvent,
        userRole,
        handleChange,
        handleClinicEventChange,
        validateForm,
        preparePayload,
    };
};
