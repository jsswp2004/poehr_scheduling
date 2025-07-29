import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing organization form and CRUD operations
 * Handles create, update, and delete operations for organizations
 */
export const useOrganizationForm = (
    userOrganization,
    setUserOrganization,
    updateOrganizationInList,
    removeOrganizationFromList,
    fetchAllOrganizations,
    canSearch
) => {
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingOrganization, setEditingOrganization] = useState(null);
    const [selectedLogo, setSelectedLogo] = useState(null);
    const [previewLogo, setPreviewLogo] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        logo: null
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedLogo(file);
            // Create preview URL
            const previewUrl = URL.createObjectURL(file);
            setPreviewLogo(previewUrl);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const formDataToSend = new FormData();

            formDataToSend.append('name', formData.name);
            if (selectedLogo) {
                formDataToSend.append('logo', selectedLogo);
            }

            const organizationId = editingOrganization ? editingOrganization.id : userOrganization.id;
            const response = await axios.put(
                `${API_BASE_URL}/api/users/organizations/${organizationId}/`,
                formDataToSend,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            if (editingOrganization) {
                // Update the organization in the search results
                updateOrganizationInList(organizationId, response.data);
                setEditingOrganization(null);
            } else {
                // Update user's own organization
                setUserOrganization(response.data);
            }

            setFormData({
                name: response.data.name,
                logo: response.data.logo
            });
            setEditMode(false);
            setSelectedLogo(null);
            setPreviewLogo(null);
            toast.success('Organization updated successfully!');

            // Refresh all organizations list if user is system admin
            if (canSearch) {
                fetchAllOrganizations();
            }
        } catch (error) {
            console.error('Failed to update organization:', error);
            toast.error('Failed to update organization');
        }
        setSaving(false);
    };

    const handleCancel = () => {
        if (editingOrganization) {
            setFormData({
                name: editingOrganization.name,
                logo: editingOrganization.logo
            });
            setEditingOrganization(null);
        } else {
            setFormData({
                name: userOrganization.name,
                logo: userOrganization.logo
            });
        }
        setEditMode(false);
        setSelectedLogo(null);
        setPreviewLogo(null);
    };

    const handleEditOrganization = (org) => {
        setEditingOrganization(org);
        setFormData({
            name: org.name,
            logo: org.logo
        });
        setEditMode(true);
        setSelectedLogo(null);
        setPreviewLogo(null);

        // Scroll to top to show the edit form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteOrganization = async (orgId) => {
        try {
            const token = localStorage.getItem('access_token');
            await axios.delete(`${API_BASE_URL}/api/users/organizations/${orgId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Organization deleted successfully!');
            removeOrganizationFromList(orgId);

            if (canSearch) {
                fetchAllOrganizations();
            }
        } catch (error) {
            console.error('Failed to delete organization:', error);
            toast.error('Failed to delete organization');
        }
    };

    // Initialize form data when userOrganization is loaded
    const initializeFormData = (organization) => {
        if (organization) {
            setFormData({
                name: organization.name,
                logo: organization.logo
            });
        }
    };

    return {
        editMode,
        saving,
        editingOrganization,
        selectedLogo,
        previewLogo,
        formData,
        setEditMode,
        setEditingOrganization,
        handleInputChange,
        handleLogoChange,
        handleSave,
        handleCancel,
        handleEditOrganization,
        handleDeleteOrganization,
        initializeFormData
    };
};
