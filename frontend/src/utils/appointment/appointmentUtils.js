/**
 * Appointment form utilities
 */

/**
 * Check if appointment time conflicts with provider's blocked availability
 */
export const checkAvailabilityConflict = (startDate, durationMinutes, doctorId, providerBlocks, editMode = false, appointmentToEdit = null) => {
    // If we don't have all required data, no conflict
    if (!doctorId || !startDate || !durationMinutes || isNaN(startDate.getTime())) {
        return false;
    }

    // When editing an existing appointment, check if we're keeping the same time
    if (editMode && appointmentToEdit) {
        const originalStart = new Date(appointmentToEdit.appointment_datetime);
        const originalDuration = appointmentToEdit.duration_minutes || 30;
        const originalEnd = new Date(originalStart.getTime() + (originalDuration * 60 * 1000));
        const currentEnd = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));

        // If the time hasn't changed (or changed minimally), don't check for conflicts
        const timeUnchanged = Math.abs(originalStart.getTime() - startDate.getTime()) < 60000 && // within 1 minute
            Math.abs(originalEnd.getTime() - currentEnd.getTime()) < 60000;

        if (timeUnchanged) {
            return false;
        }
    }

    const end = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));

    // Get blocked availability for the selected provider during this time
    const providerAvailability = providerBlocks.filter(block => {
        const blockDoctorId = block.doctor_id || block.doctor;
        return String(blockDoctorId) === String(doctorId);
    });

    // Find ONLY blocked availability for the selected provider during this time
    const blockedAvailability = providerAvailability.filter(block => {
        const blockStart = new Date(block.start_time);
        const blockEnd = new Date(block.end_time);
        const isBlocked = block.is_blocked === true;
        const overlaps = (startDate < blockEnd && end > blockStart);

        return isBlocked && overlaps;
    });

    // Check if appointment time overlaps with any blocked time
    if (blockedAvailability.length > 0) {
        return 'Cannot schedule appointment during provider\'s blocked time. Please select another time.';
    }

    return false;
};

/**
 * Check if date is blocked day or holiday
 */
export const isDateBlocked = (date, blockedDays, holidays) => {
    const selectedDate = new Date(date);

    // Check blocked days
    const isBlockedDay = blockedDays.includes(selectedDate.getDay());

    // Check holidays
    const isHoliday = holidays.some(h => {
        const holidayDate = new Date(h.date + 'T00:00:00');
        return (
            holidayDate.getFullYear() === selectedDate.getFullYear() &&
            holidayDate.getMonth() === selectedDate.getMonth() &&
            holidayDate.getDate() === selectedDate.getDate()
        );
    });

    return { isBlockedDay, isHoliday, isBlocked: isBlockedDay || isHoliday };
};

/**
 * Validate form data for appointment creation/editing
 */
export const validateAppointmentForm = (formData, selectedClinicEvent, selectedDoctor, editMode, appointmentToEdit) => {
    const errors = [];

    if (!selectedClinicEvent) {
        errors.push("Please select a Clinic Event.");
    }

    if (!selectedDoctor?.value) {
        errors.push("Please select a provider for this appointment.");
    }

    // Require recurrence_end_date if recurrence is set
    if (formData.recurrence !== 'none' && !formData.recurrence_end_date) {
        errors.push('Recurrence End Date is required for recurring appointments.');
    }

    // Validate recurrence_end_date is after appointment start date
    if (formData.recurrence !== 'none' && formData.recurrence_end_date) {
        const appointmentDate = new Date(formData.appointment_datetime).toDateString();
        const endDate = new Date(formData.recurrence_end_date).toDateString();
        if (new Date(endDate) < new Date(appointmentDate)) {
            errors.push('Recurrence End Date must be on or after the appointment date.');
        }
    }

    return errors;
};

/**
 * Prepare appointment payload for API submission
 */
export const prepareAppointmentPayload = (formData, selectedClinicEvent, selectedDoctor, patientId, appointmentToEdit, userRole) => {
    const payload = {
        ...formData,
        title: selectedClinicEvent.label,
        provider: selectedDoctor?.value || null,
        recurrence_end_date: formData.recurrence_end_date || null,
    };

    if (patientId) {
        payload.patient = patientId;
    }

    // Fix: Ensure patient is set when editing
    if (!patientId && appointmentToEdit && appointmentToEdit.patient) {
        payload.patient = appointmentToEdit.patient.id || appointmentToEdit.patient;
    }

    if ((userRole === 'admin' || userRole === 'system_admin') && formData.patient) {
        payload.patient = formData.patient;
    }

    // Send appointment_datetime as-is to timezone-aware Django backend
    // Django will handle timezone conversion based on TIME_ZONE setting
    // No conversion needed - just pass the datetime string directly

    return payload;
};

/**
 * Format available slots for display
 */
export const formatAvailableSlots = (slots) => {
    return slots.map((slot, idx) => ({
        id: idx,
        slot,
        formattedSlot: slot,
        displayText: new Date(slot).toLocaleString()
    }));
};
