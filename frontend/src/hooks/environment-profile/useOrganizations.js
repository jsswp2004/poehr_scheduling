import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing organization data and selection
 * Handles fetching organizations for system admins
 */
export const useOrganizations = (userRole, getAuthToken) => {
    const [organizations, setOrganizations] = useState([]);
    const [selectedOrganization, setSelectedOrganization] = useState('');

    useEffect(() => {
        // Fetch organizations for system admin
        const fetchOrganizations = async () => {
            if (userRole === 'system_admin') {
                const token = getAuthToken();
                try {
                    const res = await axios.get(`${API_BASE_URL}/api/organizations/`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    setOrganizations(res.data);
                    if (res.data.length > 0) {
                        setSelectedOrganization(res.data[0].id);
                    }
                } catch (err) {
                    console.error('Failed to fetch organizations:', err);
                    // Try alternative endpoint
                    try {
                        const res = await axios.get(`${API_BASE_URL}/api/users/organizations/`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        setOrganizations(res.data);
                        if (res.data.length > 0) {
                            setSelectedOrganization(res.data[0].id);
                        }
                    } catch (err2) {
                        console.error('Alternative endpoint also failed:', err2);
                    }
                }
            }
        };
        fetchOrganizations();
    }, [userRole, getAuthToken]);

    return {
        organizations,
        selectedOrganization,
        setSelectedOrganization
    };
};
