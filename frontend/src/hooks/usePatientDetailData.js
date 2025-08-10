import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getAccessToken } from '../utils/tokenManager';

export const usePatientDetailData = () => {
    const [doctors, setDoctors] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);

    const token = getAccessToken();

    // Fetch doctors for dropdown
    useEffect(() => {
        if (!token) return;

        axios
            .get(`${API_BASE_URL}/api/users/doctors/`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((res) => setDoctors(res.data))
            .catch((err) => {
                console.error('Failed to load doctors:', err);
                setDoctors([]);
            });
    }, [token]);

    // Fetch organizations for dropdown
    useEffect(() => {
        if (!token) return;

        axios
            .get(`${API_BASE_URL}/api/users/organizations/`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((res) => setOrganizations(res.data))
            .catch((err) => {
                console.error('Failed to load organizations:', err);
                setOrganizations([]);
            });
    }, [token]);

    // Set loading to false when both requests are done
    useEffect(() => {
        if (doctors.length >= 0 && organizations.length >= 0) {
            setLoading(false);
        }
    }, [doctors.length, organizations.length]);

    return {
        doctors,
        organizations,
        loading,
    };
};
