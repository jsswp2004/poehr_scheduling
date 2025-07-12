/**
 * Hook for managing doctors selection and availability
 */
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
    fetchDoctors,
    fetchDoctorAvailableDates,
    fetchProviderAvailability
} from '../../utils/appointment/appointmentApi';

export const useAppointmentDoctors = (token, defaultProviderId, appointmentToEdit) => {
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [providerBlocks, setProviderBlocks] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);

    // Fetch doctors on mount
    useEffect(() => {
        const loadDoctors = async () => {
            try {
                const doctorsData = await fetchDoctors(token);
                setDoctors(doctorsData);

                // Handle default provider selection
                if (defaultProviderId) {
                    const doc = doctorsData.find((d) => d.id === defaultProviderId);
                    if (doc) {
                        const selected = {
                            value: doc.id,
                            label: `Dr. ${doc.first_name} ${doc.last_name}`
                        };
                        setSelectedDoctor(selected);
                        handleDoctorChange(selected);
                    }
                }

                // Handle preselect for editing
                if (appointmentToEdit && appointmentToEdit.provider) {
                    const selected = {
                        value: appointmentToEdit.provider.id || appointmentToEdit.provider,
                        label:
                            appointmentToEdit.provider_name ||
                            (appointmentToEdit.provider.first_name && appointmentToEdit.provider.last_name
                                ? `Dr. ${appointmentToEdit.provider.first_name} ${appointmentToEdit.provider.last_name}`
                                : 'Provider'),
                    };
                    setSelectedDoctor(selected);

                    // Automatically fetch available slots for the preselected doctor
                    try {
                        const slots = await fetchDoctorAvailableDates(selected.value, token);
                        setAvailableSlots(slots);
                    } catch (error) {
                        console.error('Failed to fetch available slots:', error);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch doctors:', error);
                toast.error('Failed to load doctors');
            }
        };

        if (token) {
            loadDoctors();
        }
    }, [token, defaultProviderId, appointmentToEdit]);

    // Load provider availability when doctor changes
    useEffect(() => {
        const loadProviderBlocks = async () => {
            if (!selectedDoctor) {
                setProviderBlocks([]);
                return;
            }

            try {
                const blocks = await fetchProviderAvailability(selectedDoctor.value, token);
                setProviderBlocks(blocks);
            } catch (err) {
                console.error('Failed to load provider availability:', err);
            }
        };

        loadProviderBlocks();
    }, [selectedDoctor, token]);

    // Handle doctor selection and fetch slots
    const handleDoctorChange = async (selected) => {
        setSelectedDoctor(selected);
        setAvailableSlots([]);

        if (selected) {
            try {
                const slots = await fetchDoctorAvailableDates(selected.value, token);
                setAvailableSlots(slots);
            } catch (error) {
                console.error("Failed to fetch available slots:", error);
                toast.error("Failed to fetch available slots");
            }
        }
    };

    const handleSlotSelection = (slot, formattedSlot, setFormData) => {
        setSelectedSlot(formattedSlot);
        setFormData((prev) => ({ ...prev, appointment_datetime: formattedSlot }));
    };

    return {
        doctors,
        selectedDoctor,
        availableSlots,
        providerBlocks,
        selectedSlot,
        handleDoctorChange,
        handleSlotSelection,
    };
};
