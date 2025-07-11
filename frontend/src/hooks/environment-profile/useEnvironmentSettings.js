import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing environment settings (blocked days)
 * Handles loading, saving, and state management of blocked days
 */
export const useEnvironmentSettings = (userRole, selectedOrganization, getAuthToken) => {
    const [blockedDays, setBlockedDays] = useState([0, 6]);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSettings() {
            setLoading(true);
            try {
                const token = getAuthToken();
                const params = {};
                if (userRole === 'system_admin' && selectedOrganization) {
                    params.organization_id = selectedOrganization;
                }
                const res = await axios.get(
                    `${API_BASE_URL}/api/settings/environment/`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        params,
                    }
                );
                setBlockedDays(res.data.blocked_days || []);
            } catch (err) {
                setStatus('Failed to load settings.');
                console.error(err);
            }
            setLoading(false);
        }
        if (userRole && (userRole !== 'system_admin' || selectedOrganization)) {
            fetchSettings();
        }
    }, [userRole, selectedOrganization, getAuthToken]);

    const handleCheckbox = (dayValue) => {
        setBlockedDays((prev) =>
            prev.includes(dayValue)
                ? prev.filter((d) => d !== dayValue)
                : [...prev, dayValue]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus('');
        try {
            const token = getAuthToken();
            const payload = { blocked_days: blockedDays };
            if (userRole === 'system_admin' && selectedOrganization) {
                payload.organization_id = selectedOrganization;
            }
            await axios.post(
                `${API_BASE_URL}/api/settings/environment/`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus('Saved!');
        } catch (e) {
            setStatus('Failed to save.');
            console.error(e);
        }
        setSaving(false);
    };

    return {
        blockedDays,
        saving,
        status,
        loading,
        handleCheckbox,
        handleSave
    };
};
