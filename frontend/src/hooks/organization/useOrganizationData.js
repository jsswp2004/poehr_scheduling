import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

/**
 * Custom hook for managing organization data
 * Handles user organization and all organizations list (for system admin)
 */
export const useOrganizationData = (currentUser, canSearch) => {
    const [userOrganization, setUserOrganization] = useState(null);
    const [allOrganizations, setAllOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchUserOrganization = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token || !currentUser?.organization) {
                setLoading(false);
                return;
            }

            const response = await axios.get(
                `http://127.0.0.1:8000/api/users/organizations/${currentUser.organization}/`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setUserOrganization(response.data);
        } catch (error) {
            console.error('Failed to fetch organization:', error);
            toast.error('Failed to fetch organization information');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllOrganizations = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const response = await axios.get(`http://127.0.0.1:8000/api/users/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            console.log('Organizations data:', response.data);
            response.data.forEach(org => {
                console.log(`Organization: ${org.name}, Logo: ${org.logo}`);
            });

            setAllOrganizations(response.data);
        } catch (error) {
            console.error('Failed to fetch all organizations:', error);
            toast.error('Failed to fetch organizations list');
        }
    };

    const updateOrganizationInList = (organizationId, updatedData) => {
        setAllOrganizations(prev =>
            prev.map(org => org.id === organizationId ? updatedData : org)
        );
    };

    const removeOrganizationFromList = (organizationId) => {
        setAllOrganizations(prev => prev.filter(org => org.id !== organizationId));
    };

    useEffect(() => {
        if (currentUser) {
            fetchUserOrganization();
            if (canSearch) {
                fetchAllOrganizations();
            }
        }
    }, [currentUser, canSearch]);

    return {
        userOrganization,
        allOrganizations,
        loading,
        setUserOrganization,
        fetchUserOrganization,
        fetchAllOrganizations,
        updateOrganizationInList,
        removeOrganizationFromList
    };
};
