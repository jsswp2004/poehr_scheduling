import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders } from '../config/api';
import { toast } from '../components/SimpleToast';

/**
 * Custom hook for doctor/provider management
 */
export const useDoctors = () => {
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [loading, setLoading] = useState(false);

    // Load doctors
    const loadDoctors = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get(apiEndpoints.doctors, {
                headers: getAuthHeaders(),
            });
            setDoctors(response.data);
        } catch (error) {
            console.error('Error loading doctors:', error);
            toast.error('Failed to load doctors');
        } finally {
            setLoading(false);
        }
    }, []);

    // Select doctor
    const selectDoctor = useCallback((doctor) => {
        setSelectedDoctor(doctor);
    }, []);

    // Get doctor by ID
    const getDoctorById = useCallback((id) => {
        return doctors.find(doctor => doctor.id === id);
    }, [doctors]);

    // Get doctor name
    const getDoctorName = useCallback((doctor) => {
        if (!doctor) return 'Unknown Doctor';
        return `Dr. ${doctor.first_name} ${doctor.last_name}`;
    }, []);

    useEffect(() => {
        loadDoctors();
    }, [loadDoctors]);

    return {
        doctors,
        selectedDoctor,
        loading,
        loadDoctors,
        selectDoctor,
        getDoctorById,
        getDoctorName,
    };
};
