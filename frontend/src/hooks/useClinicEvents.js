import { useState, useEffect } from 'react';
import axios from 'axios';
import { getValidToken } from '../utils/auth';
import { API_BASE_URL } from '../config/api';

export const useClinicEvents = () => {
    const [clinicEvents, setClinicEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchClinicEvents = async () => {
        try {
            setLoading(true);
            const token = await getValidToken();
            if (!token) {
                throw new Error('No valid token available');
            }

            const response = await axios.get(`${API_BASE_URL}/api/clinic-events/`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setClinicEvents(response.data || []);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch clinic events:', err);
            setError(err.message);
            setClinicEvents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClinicEvents();
    }, []);

    return {
        clinicEvents,
        loading,
        error,
        refetch: fetchClinicEvents
    };
};
