import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing Email automation settings
 * Handles loading, saving, and state management of Email settings
 */
export const useEmailSettings = () => {
    const [frequency, setFrequency] = useState('weekly');
    const [dayOfWeek, setDayOfWeek] = useState(1);
    const [startDate, setStartDate] = useState(new Date());
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);

    const getAuthToken = () => {
        return localStorage.getItem('access_token');
    };

    useEffect(() => {
        async function fetchSettings() {
            setLoading(true);
            try {
                const token = getAuthToken();
                const res = await axios.get(
                    `${API_BASE_URL}/api/settings/environment/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                setFrequency(res.data.auto_message_frequency || 'weekly');
                setDayOfWeek(res.data.auto_message_day_of_week || 1);

                // Handle start date from API response
                if (res.data.auto_message_start_date) {
                    setStartDate(new Date(res.data.auto_message_start_date));
                } else {
                    // Set default to next day if no date is set
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setStartDate(tomorrow);
                }
            } catch (err) {
                setStatus('Failed to load settings.');
                console.error(err);
            }
            setLoading(false);
        }
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setStatus('');
        try {
            const token = getAuthToken();

            // Format date to YYYY-MM-DD
            const formattedDate = startDate.toISOString().split('T')[0];

            await axios.post(
                `${API_BASE_URL}/api/settings/environment/`,
                {
                    auto_message_frequency: frequency,
                    auto_message_day_of_week: dayOfWeek,
                    auto_message_start_date: formattedDate,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus('Settings Saved!');
        } catch (e) {
            setStatus('Failed to save settings.');
            console.error(e);
        }
        setSaving(false);
    };

    return {
        frequency,
        setFrequency,
        dayOfWeek,
        setDayOfWeek,
        startDate,
        setStartDate,
        saving,
        status,
        loading,
        handleSave,
        getAuthToken
    };
};
