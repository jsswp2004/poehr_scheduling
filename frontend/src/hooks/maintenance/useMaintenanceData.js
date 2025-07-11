import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';

export const useMaintenanceData = () => {
    const [doctors, setDoctors] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState(null);

    const token = localStorage.getItem('access_token');

    useEffect(() => {
        const fetchDoctors = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/users/doctors/`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setDoctors(res.data);
            } catch (err) {
                toast.error('Error loading doctors.');
            }
        };
        fetchDoctors();
    }, [token]);

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/holidays/`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setHolidays(res.data.filter(h => h.is_recognized));
            } catch (err) {
                console.warn('Failed to fetch holidays:', err);
            }
        };
        fetchHolidays();
    }, [token]);

    const handleDoctorChange = (doctorId) => {
        const doc = doctors.find(d => d.id === doctorId);
        setSelectedDoctor(doc ? {
            value: doc.id,
            label: `Dr. ${doc.first_name} ${doc.last_name}`
        } : null);
    };

    return {
        doctors,
        holidays,
        selectedDoctor,
        setSelectedDoctor,
        handleDoctorChange,
        token,
    };
};
