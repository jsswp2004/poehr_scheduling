import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders } from '../config/api';
import { toast } from '../components/SimpleToast';
import { STORAGE_KEYS } from '../config/constants';

/**
 * Custom hook for appointment management
 */
export const useAppointments = () => {
    const [appointments, setAppointments] = useState([]);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        title: "New Clinic Visit",
        description: "",
        appointment_datetime: "",
        duration_minutes: 30,
        recurrence: "none",
        provider: null,
    });

    // Helper to get token
    const getToken = () => localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    // Load appointments
    const loadAppointments = useCallback(async () => {
        try {
            setLoading(true);
            const token = getToken();
            const response = await axios.get(apiEndpoints.appointments, {
                headers: getAuthHeaders(token),
            });
            setAppointments(response.data);
        } catch (error) {
            console.error('Error loading appointments:', error);
            toast.error('Failed to load appointments');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load available slots
    const loadAvailableSlots = useCallback(async (providerId, date) => {
        if (!providerId || !date) return;

        try {
            const token = getToken();
            console.log('🔍 Loading available slots for provider:', providerId, 'date:', date);
            const response = await axios.get(
                apiEndpoints.availableSlots(providerId, date),
                { headers: getAuthHeaders(token) }
            );
            console.log('📅 Available slots response:', response.data);
            setAvailableSlots(response.data);
        } catch (error) {
            console.error('Error loading available slots:', error);
            console.error('Error details:', error.response?.data);
            toast.error('Failed to load available slots');
        }
    }, []);

    // Create appointment
    const createAppointment = useCallback(async () => {
        try {
            setLoading(true);
            const token = getToken();
            console.log('💾 Creating appointment with data:', formData);
            const response = await axios.post(
                apiEndpoints.appointments,
                formData,
                { headers: getAuthHeaders(token) }
            );

            setAppointments(prev => [...prev, response.data]);
            setFormData({
                title: "New Clinic Visit",
                description: "",
                appointment_datetime: "",
                duration_minutes: 30,
                recurrence: "none",
                provider: null,
            });

            toast.success('Appointment created successfully!');
            return response.data;
        } catch (error) {
            console.error('Error creating appointment:', error);
            console.error('Error details:', error.response?.data);
            toast.error('Failed to create appointment');
            throw error;
        } finally {
            setLoading(false);
        }
    }, [formData]);

    // Update appointment
    const updateAppointment = useCallback(async (id, data) => {
        try {
            setLoading(true);
            const token = getToken();
            const response = await axios.put(
                apiEndpoints.appointment(id),
                data,
                { headers: getAuthHeaders(token) }
            );

            setAppointments(prev =>
                prev.map(apt => apt.id === id ? response.data : apt)
            );

            setEditMode(false);
            setEditingId(null);

            toast.success('Appointment updated successfully!');
            return response.data;
        } catch (error) {
            console.error('Error updating appointment:', error);
            console.error('Error details:', error.response?.data);
            toast.error('Failed to update appointment');
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    // Delete appointment
    const deleteAppointment = useCallback(async (id) => {
        try {
            const token = getToken();
            await axios.delete(apiEndpoints.appointment(id), {
                headers: getAuthHeaders(token),
            });

            setAppointments(prev => prev.filter(apt => apt.id !== id));
            toast.success('Appointment deleted successfully!');
        } catch (error) {
            console.error('Error deleting appointment:', error);
            toast.error('Failed to delete appointment');
            throw error;
        }
    }, []);

    // Update form data
    const updateFormData = useCallback((field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    // Start editing
    const startEditing = useCallback((appointment) => {
        setEditMode(true);
        setEditingId(appointment.id);
        setFormData({
            title: appointment.title,
            description: appointment.description,
            appointment_datetime: appointment.appointment_datetime,
            duration_minutes: appointment.duration_minutes,
            recurrence: appointment.recurrence || "none",
            provider: appointment.provider,
        });
    }, []);

    // Cancel editing
    const cancelEditing = useCallback(() => {
        setEditMode(false);
        setEditingId(null);
        setFormData({
            title: "New Clinic Visit",
            description: "",
            appointment_datetime: "",
            duration_minutes: 30,
            recurrence: "none",
            provider: null,
        });
    }, []);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    return {
        appointments,
        availableSlots,
        selectedSlot,
        loading,
        editMode,
        editingId,
        formData,
        setSelectedSlot,
        updateFormData,
        loadAppointments,
        loadAvailableSlots,
        createAppointment,
        updateAppointment,
        deleteAppointment,
        startEditing,
        cancelEditing,
    };
};
