import { useState } from 'react';

/**
 * Custom hook for managing delete confirmation dialog
 * Handles the state and logic for organization deletion confirmation
 */
export const useDeleteConfirmation = () => {
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
    const [organizationToDelete, setOrganizationToDelete] = useState(null);

    const openDeleteDialog = (organization) => {
        setOrganizationToDelete(organization);
        setDeleteConfirmDialog(true);
    };

    const closeDeleteDialog = () => {
        setDeleteConfirmDialog(false);
        setOrganizationToDelete(null);
    };

    return {
        deleteConfirmDialog,
        organizationToDelete,
        openDeleteDialog,
        closeDeleteDialog
    };
};
