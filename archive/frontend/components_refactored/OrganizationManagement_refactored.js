/**
 * Refactored OrganizationManagement component
 * 
 * This is a much more maintainable version of the original 753-line OrganizationManagement.js
 * - Business logic extracted into custom hooks
 * - UI components modularized for better reusability
 * - Utilities extracted for better organization
 * - Clear separation of concerns
 */
import React from 'react';
import {
    Box,
    CircularProgress,
    Typography,
    Alert,
} from '@mui/material';

// Components
import {
    OrganizationHeader,
    UserOrganizationCard,
    OrganizationsTable,
    CreateOrganizationDialog,
    EditOrganizationDialog,
    DeleteConfirmationDialog,
} from './organization-management';

// Hooks
import {
    useOrganizationManagement,
    useOrganizationDialogs,
} from '../hooks/organization-management';

function OrganizationManagement() {
    // Main organization management hook
    const {
        currentUser,
        userOrganization,
        filteredOrganizations,
        searchQuery,
        loading,
        saving,
        isSystemAdmin,
        isAdmin,
        handleSearch,
        createOrganization,
        updateOrganization,
        deleteOrganization,
    } = useOrganizationManagement();

    // Dialog management hook
    const dialogs = useOrganizationDialogs();

    // Show loading state
    if (loading) {
        return (
            <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                minHeight="400px"
            >
                <CircularProgress />
                <Typography variant="h6" sx={{ ml: 2 }}>
                    Loading organizations...
                </Typography>
            </Box>
        );
    }

    // Show access denied for non-admin users
    if (!isAdmin) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">
                    Access denied. You must be an administrator to view this page.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header with search and create button */}
            <OrganizationHeader
                isSystemAdmin={isSystemAdmin}
                searchQuery={searchQuery}
                onSearchChange={handleSearch}
                onCreateClick={dialogs.openCreateDialog}
            />

            {/* User's organization card */}
            <UserOrganizationCard
                userOrganization={userOrganization}
                currentUser={currentUser}
            />

            {/* All organizations table (system admin only) */}
            {isSystemAdmin && (
                <OrganizationsTable
                    organizations={filteredOrganizations}
                    isSystemAdmin={isSystemAdmin}
                    onEditClick={dialogs.openEditDialog}
                    onDeleteClick={dialogs.openDeleteDialog}
                />
            )}

            {/* Create Organization Dialog */}
            <CreateOrganizationDialog
                open={dialogs.createDialogOpen}
                onClose={dialogs.closeCreateDialog}
                formData={dialogs.createFormData}
                setFormData={dialogs.setCreateFormData}
                formErrors={dialogs.createFormErrors}
                previewLogo={dialogs.previewCreateLogo}
                onLogoChange={dialogs.handleCreateLogoChange}
                onSubmit={() => dialogs.handleCreateSubmit(createOrganization)}
                saving={saving}
            />

            {/* Edit Organization Dialog */}
            <EditOrganizationDialog
                open={dialogs.editDialogOpen}
                onClose={dialogs.closeEditDialog}
                organization={dialogs.editingOrganization}
                formData={dialogs.editFormData}
                setFormData={dialogs.setEditFormData}
                formErrors={dialogs.editFormErrors}
                previewLogo={dialogs.previewEditLogo}
                onLogoChange={dialogs.handleEditLogoChange}
                onSubmit={() => dialogs.handleEditSubmit(updateOrganization)}
                saving={saving}
            />

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmationDialog
                open={dialogs.deleteConfirmDialog}
                onClose={dialogs.closeDeleteDialog}
                organization={dialogs.organizationToDelete}
                onConfirm={() => dialogs.handleDeleteConfirm(deleteOrganization)}
                saving={saving}
            />
        </Box>
    );
}

export default OrganizationManagement;
