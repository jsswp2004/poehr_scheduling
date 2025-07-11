import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import { toast } from 'react-toastify';

// Import custom hooks
import {
    useAuth,
    useOrganizationData,
    useOrganizationSearch,
    useOrganizationForm,
    useDeleteConfirmation,
    getLogoUrl
} from '../hooks/organization';

// Import components
import {
    OrganizationForm,
    OrganizationSearchTable,
    DeleteConfirmationDialog,
    LoadingSpinner
} from '../components/organization';

function OrganizationPage() {
    // Authentication and permissions
    const { currentUser, loading: authLoading, canEdit, canSearch } = useAuth();

    // Organization data management
    const {
        userOrganization,
        allOrganizations,
        loading: dataLoading,
        setUserOrganization,
        fetchAllOrganizations,
        updateOrganizationInList,
        removeOrganizationFromList
    } = useOrganizationData(currentUser, canSearch);

    // Search functionality
    const {
        searchQuery,
        filteredOrganizations,
        handleSearchChange
    } = useOrganizationSearch(allOrganizations);

    // Form management
    const {
        editMode,
        saving,
        editingOrganization,
        selectedLogo,
        previewLogo,
        formData,
        setEditMode,
        handleInputChange,
        handleLogoChange,
        handleSave,
        handleCancel,
        handleEditOrganization,
        handleDeleteOrganization,
        initializeFormData
    } = useOrganizationForm(
        userOrganization,
        setUserOrganization,
        updateOrganizationInList,
        removeOrganizationFromList,
        fetchAllOrganizations,
        canSearch
    );

    // Delete confirmation
    const {
        deleteConfirmDialog,
        organizationToDelete,
        openDeleteDialog,
        closeDeleteDialog
    } = useDeleteConfirmation();

    // Initialize form data when userOrganization loads
    useEffect(() => {
        if (userOrganization && !editingOrganization) {
            initializeFormData(userOrganization);
        }
    }, [userOrganization, editingOrganization, initializeFormData]);

    // Handlers with permission checks
    const handleSaveWithPermissionCheck = async () => {
        if (!canEdit) {
            toast.error('You do not have permission to edit organization details');
            return;
        }
        await handleSave();
    };

    const handleDeleteWithConfirmation = async (orgId) => {
        await handleDeleteOrganization(orgId);
        closeDeleteDialog();
    };

    // Loading state
    if (authLoading || dataLoading) {
        return <LoadingSpinner />;
    }

    return (
        <Box sx={{ width: '100%' }}>
            {/* User's Organization Section */}
            <OrganizationForm
                userOrganization={userOrganization}
                editingOrganization={editingOrganization}
                editMode={editMode}
                saving={saving}
                formData={formData}
                previewLogo={previewLogo}
                canEdit={canEdit}
                onInputChange={handleInputChange}
                onLogoChange={handleLogoChange}
                onEditToggle={() => setEditMode(true)}
                onSave={handleSaveWithPermissionCheck}
                onCancel={handleCancel}
                getLogoUrl={getLogoUrl}
            />

            {/* System Admin Organization Search Section */}
            {canSearch && (
                <OrganizationSearchTable
                    searchQuery={searchQuery}
                    filteredOrganizations={filteredOrganizations}
                    editingOrganization={editingOrganization}
                    onSearchChange={handleSearchChange}
                    onEditOrganization={handleEditOrganization}
                    onDeleteClick={openDeleteDialog}
                    getLogoUrl={getLogoUrl}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmationDialog
                open={deleteConfirmDialog}
                organizationToDelete={organizationToDelete}
                onClose={closeDeleteDialog}
                onConfirmDelete={handleDeleteWithConfirmation}
            />
        </Box>
    );
}

export default OrganizationPage;
