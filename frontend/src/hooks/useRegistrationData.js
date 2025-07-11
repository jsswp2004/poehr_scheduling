import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken } from '../utils/authUtils';

/**
 * Custom hook for fetching and managing doctors and organizations data
 * Handles API calls to get doctors, organizations, and current user info
 */
export const useRegistrationData = () => {
    const [doctors, setDoctors] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch doctors
    const fetchDoctors = async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                console.log('No valid token available for fetching doctors');
                return;
            }

            const response = await axios.get(`${API_BASE_URL}/api/users/doctors/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setDoctors(response.data);
        } catch (err) {
            console.error('Failed to load doctors:', err);
            setError('Failed to load doctors');
        }
    };

    // Fetch organizations
    const fetchOrganizations = async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                console.log('No valid token available for fetching organizations');
                return;
            }

            const response = await axios.get(`${API_BASE_URL}/api/users/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setOrganizations(response.data);
        } catch (err) {
            console.error('Failed to load organizations:', err);
            setError('Failed to load organizations');
        }
    };

    // Fetch current user's organization
    const fetchCurrentUserOrganization = async () => {
        try {
            const token = await getValidToken();
            if (!token) {
                console.log('No valid token available for fetching user org');
                return null;
            }

            const response = await axios.get(`${API_BASE_URL}/api/users/me/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            return response.data.organization_name || null;
        } catch (error) {
            console.error('Failed to fetch current user information:', error);
            setError('Failed to fetch user information');
            return null;
        }
    };

    // Fetch all data on mount
    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            setError(null);

            await Promise.all([
                fetchDoctors(),
                fetchOrganizations()
            ]);

            setLoading(false);
        };

        fetchAllData();
    }, []);

    // Transform doctors for react-select
    const doctorOptions = doctors.map((doc) => ({
        value: doc.id,
        label: `Dr. ${doc.first_name} ${doc.last_name}`,
    }));

    return {
        doctors,
        organizations,
        doctorOptions,
        loading,
        error,
        fetchCurrentUserOrganization,
        refreshDoctors: fetchDoctors,
        refreshOrganizations: fetchOrganizations
    };
};
