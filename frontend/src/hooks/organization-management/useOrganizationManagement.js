/**
 * Main hook for organization management data and operations
 */
import { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import { organizationApi } from '../../utils/organization/organizationApi';
import { filterOrganizations } from '../../utils/organization/organizationUtils';

export const useOrganizationManagement = () => {
    // Core data state
    const [currentUser, setCurrentUser] = useState(null);
    const [userOrganization, setUserOrganization] = useState(null);
    const [allOrganizations, setAllOrganizations] = useState([]);
    const [filteredOrganizations, setFilteredOrganizations] = useState([]);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Authentication
    const token = localStorage.getItem('access_token');

    // User permissions
    const isSystemAdmin = currentUser && (currentUser.role === 'system_admin' || currentUser.role === 'admin');
    const isAdmin = currentUser && ['admin', 'system_admin'].includes(currentUser.role);

    // Fetch current user
    const fetchCurrentUser = useCallback(async () => {
        if (!token) return;

        try {
            const decoded = jwtDecode(token);
            setCurrentUser(decoded);
        } catch (error) {
            console.error('Failed to decode token:', error);
            toast.error('Authentication error');
        }
    }, [token]);

    // Fetch user's organization
    const fetchUserOrganization = useCallback(async () => {
        if (!token) return;

        try {
            const data = await organizationApi.getUserOrganization(token);
            setUserOrganization(data);
        } catch (error) {
            console.error('Failed to fetch user organization:', error);
            toast.error('Failed to fetch your organization');
        }
    }, [token]);

    // Fetch all organizations (system admin only)
    const fetchAllOrganizations = useCallback(async () => {
        if (!token || !isSystemAdmin) return;

        try {
            const data = await organizationApi.getAllOrganizations(token);
            setAllOrganizations(data);
            setFilteredOrganizations(data);
        } catch (error) {
            console.error('Failed to fetch organizations:', error);
            toast.error('Failed to fetch organizations');
        } finally {
            setLoading(false);
        }
    }, [token, isSystemAdmin]);

    // Handle search
    const handleSearch = useCallback((query) => {
        setSearchQuery(query);
        const filtered = filterOrganizations(allOrganizations, query);
        setFilteredOrganizations(filtered);
    }, [allOrganizations]);

    // Create organization
    const createOrganization = useCallback(async (formData) => {
        if (!token) return { success: false, error: 'Authentication required' };

        setSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            if (formData.logo) {
                data.append('logo', formData.logo);
            }

            await organizationApi.createOrganization(token, data);
            toast.success('Organization created successfully!');

            // Refresh data
            await fetchAllOrganizations();
            return { success: true };
        } catch (error) {
            console.error('Failed to create organization:', error);
            const errorMessage = error.response?.data?.detail || 'Failed to create organization';
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setSaving(false);
        }
    }, [token, fetchAllOrganizations]);

    // Update organization
    const updateOrganization = useCallback(async (organizationId, formData) => {
        if (!token) return { success: false, error: 'Authentication required' };

        setSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            if (formData.logo) {
                data.append('logo', formData.logo);
            }

            await organizationApi.updateOrganization(token, organizationId, data);
            toast.success('Organization updated successfully!');

            // Refresh data
            await fetchAllOrganizations();
            return { success: true };
        } catch (error) {
            console.error('Failed to update organization:', error);
            const errorMessage = error.response?.data?.detail || 'Failed to update organization';
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setSaving(false);
        }
    }, [token, fetchAllOrganizations]);

    // Delete organization
    const deleteOrganization = useCallback(async (organizationId) => {
        if (!token) return { success: false, error: 'Authentication required' };

        setSaving(true);
        try {
            await organizationApi.deleteOrganization(token, organizationId);
            toast.success('Organization deleted successfully!');

            // Refresh data
            await fetchAllOrganizations();
            return { success: true };
        } catch (error) {
            console.error('Failed to delete organization:', error);
            const errorMessage = error.response?.data?.detail || 'Failed to delete organization';
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setSaving(false);
        }
    }, [token, fetchAllOrganizations]);

    // Initial data loading
    useEffect(() => {
        fetchCurrentUser();
    }, [fetchCurrentUser]);

    useEffect(() => {
        if (currentUser) {
            fetchUserOrganization();
            if (isSystemAdmin) {
                fetchAllOrganizations();
            } else {
                setLoading(false);
            }
        }
    }, [currentUser, isSystemAdmin, fetchUserOrganization, fetchAllOrganizations]);

    return {
        // Data
        currentUser,
        userOrganization,
        allOrganizations,
        filteredOrganizations,

        // UI State
        searchQuery,
        loading,
        saving,

        // Permissions
        isSystemAdmin,
        isAdmin,

        // Actions
        handleSearch,
        createOrganization,
        updateOrganization,
        deleteOrganization,
        refetchData: fetchAllOrganizations,
    };
};
