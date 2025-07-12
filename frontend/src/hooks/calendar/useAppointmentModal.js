/**
 * Custom hook for managing calendar appointment modals
 */
import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { calendarApi } from "../../utils/calendar/calendarApi";
import { isPastAppointment } from "../../utils/calendar/dateUtils";

export const useAppointmentModal = (onUpdate, token) => {
    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [isPast, setIsPast] = useState(false);

    // Form data
    const [modalFormData, setModalFormData] = useState({
        title: "New Clinic Visit",
        description: "",
        duration_minutes: 30,
        recurrence: "none",
        appointment_datetime: "",
        provider: null,
    });

    // Selected data
    const [selectedDoctor, setSelectedDoctor] = useState(null);

    // Reset form to initial state
    const resetForm = useCallback(() => {
        setModalFormData({
            title: "New Clinic Visit",
            description: "",
            duration_minutes: 30,
            recurrence: "none",
            appointment_datetime: "",
            provider: null,
        });
        setSelectedDoctor(null);
        setIsEditing(false);
        setEditingId(null);
        setIsPast(false);
    }, []);

    // Open modal for new appointment
    const openNewAppointmentModal = useCallback((start, end) => {
        resetForm();
        // Format as local datetime-local input value without UTC conversion
        const year = start.getFullYear();
        const month = String(start.getMonth() + 1).padStart(2, '0');
        const day = String(start.getDate()).padStart(2, '0');
        const hours = String(start.getHours()).padStart(2, '0');
        const minutes = String(start.getMinutes()).padStart(2, '0');
        const localDatetimeString = `${year}-${month}-${day}T${hours}:${minutes}`;

        setModalFormData(prev => ({
            ...prev,
            appointment_datetime: localDatetimeString,
        }));
        setShowModal(true);
    }, [resetForm]);

    // Open modal for editing existing appointment
    const openEditAppointmentModal = useCallback((event) => {
        const appointmentData = event.resource?.data;
        if (!appointmentData) return;

        const isPastAppt = isPastAppointment(appointmentData.appointment_datetime);
        setIsPast(isPastAppt);
        setIsEditing(true);
        setEditingId(appointmentData.id);

        // Convert timezone-aware datetime to local datetime for editing
        let localDatetimeString = "";
        if (appointmentData.appointment_datetime) {
            console.log('=== MODAL EDIT DATETIME CONVERSION ===');
            console.log('Original datetime from backend:', appointmentData.appointment_datetime);

            // Parse the timezone-aware datetime and convert to local time
            const appointmentDate = new Date(appointmentData.appointment_datetime);
            console.log('Parsed as Date object:', appointmentDate);
            console.log('Local time representation:', appointmentDate.toString());

            // Format as local datetime-local input value
            const year = appointmentDate.getFullYear();
            const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
            const day = String(appointmentDate.getDate()).padStart(2, '0');
            const hours = String(appointmentDate.getHours()).padStart(2, '0');
            const minutes = String(appointmentDate.getMinutes()).padStart(2, '0');
            localDatetimeString = `${year}-${month}-${day}T${hours}:${minutes}`;

            console.log('Converted to local datetime input format:', localDatetimeString);
            console.log('=====================================');
        }

        setModalFormData({
            title: appointmentData.title || "New Clinic Visit",
            description: appointmentData.description || "",
            duration_minutes: appointmentData.duration_minutes || 30,
            recurrence: appointmentData.recurrence || "none",
            appointment_datetime: localDatetimeString,
            provider: appointmentData.provider || null,
            patient: appointmentData.patient || null, // Include patient ID for updates
        });

        setShowModal(true);
    }, []);

    // Close modal and reset
    const closeModal = useCallback(() => {
        setShowModal(false);
        resetForm();
    }, [resetForm]);

    // Handle form submission
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();

        if (!token) {
            toast.error("Authentication required");
            return;
        }

        try {
            // Fix appointment_datetime format - add seconds if missing
            let appointmentDateTime = modalFormData.appointment_datetime;
            if (appointmentDateTime && !appointmentDateTime.includes(':00', appointmentDateTime.length - 3)) {
                appointmentDateTime = appointmentDateTime + ':00';
            }

            const appointmentData = {
                ...modalFormData,
                // Ensure appointment_datetime has proper format with seconds
                appointment_datetime: appointmentDateTime,
            };

            if (isEditing && editingId) {
                await calendarApi.updateAppointment(token, editingId, appointmentData);
                toast.success("Appointment updated successfully!");
            } else {
                await calendarApi.createAppointment(token, appointmentData);
                toast.success("Appointment created successfully!");
            }

            closeModal();
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Error saving appointment:", error);
            const errorMessage = error.response?.data?.detail || "Failed to save appointment";
            toast.error(errorMessage);
        }
    }, [modalFormData, isEditing, editingId, token, closeModal, onUpdate]);

    // Handle appointment deletion
    const handleDelete = useCallback(async () => {
        if (!editingId || !token) return;

        if (!window.confirm("Are you sure you want to delete this appointment?")) {
            return;
        }

        try {
            await calendarApi.deleteAppointment(token, editingId);
            toast.success("Appointment deleted successfully!");
            closeModal();
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Error deleting appointment:", error);
            toast.error("Failed to delete appointment");
        }
    }, [editingId, token, closeModal, onUpdate]);

    return {
        // Modal state
        showModal,
        isEditing,
        isPast,

        // Form data
        modalFormData,
        setModalFormData,
        selectedDoctor,
        setSelectedDoctor,

        // Actions
        openNewAppointmentModal,
        openEditAppointmentModal,
        closeModal,
        handleSubmit,
        handleDelete,
    };
};
