/**
 * Hook for managing organization form dialogs (create, edit, delete)
 */
import { useState, useCallback } from 'react';
import { validateOrganizationForm, validateUploadedFile, createFilePreview } from '../../utils/organization/organizationUtils';
import { toast } from 'react-toastify';

export const useOrganizationDialogs = (onCreateSuccess, onUpdateSuccess, onDeleteSuccess) => {
    // Create Organization Dialog State
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createFormData, setCreateFormData] = useState({
        name: '',
        logo: null
    });
    const [createFormErrors, setCreateFormErrors] = useState({});
    const [previewCreateLogo, setPreviewCreateLogo] = useState(null);

    // Edit Organization Dialog State
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingOrganization, setEditingOrganization] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        logo: null
    });
    const [editFormErrors, setEditFormErrors] = useState({});
    const [previewEditLogo, setPreviewEditLogo] = useState(null);

    // Delete Organization Dialog State
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
    const [organizationToDelete, setOrganizationToDelete] = useState(null);

    // Create Dialog Functions
    const openCreateDialog = useCallback(() => {
        setCreateFormData({ name: '', logo: null });
        setCreateFormErrors({});
        setPreviewCreateLogo(null);
        setCreateDialogOpen(true);
    }, []);

    const closeCreateDialog = useCallback(() => {
        setCreateDialogOpen(false);
        setCreateFormData({ name: '', logo: null });
        setCreateFormErrors({});
        setPreviewCreateLogo(null);
    }, []);

    const handleCreateLogoChange = useCallback(async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const validation = validateUploadedFile(file);
        if (!validation.isValid) {
            toast.error(validation.error);
            return;
        }

        setCreateFormData(prev => ({ ...prev, logo: file }));

        try {
            const preview = await createFilePreview(file);
            setPreviewCreateLogo(preview);
        } catch (error) {
            console.error('Error creating file preview:', error);
        }
    }, []);

    const validateCreateForm = useCallback(() => {
        const errors = validateOrganizationForm(createFormData);
        setCreateFormErrors(errors);
        return Object.keys(errors).length === 0;
    }, [createFormData]);

    const handleCreateSubmit = useCallback(async (createFunction) => {
        if (!validateCreateForm()) return;

        const result = await createFunction(createFormData);
        if (result.success) {
            closeCreateDialog();
            if (onCreateSuccess) onCreateSuccess();
        }
    }, [createFormData, validateCreateForm, closeCreateDialog, onCreateSuccess]);

    // Edit Dialog Functions
    const openEditDialog = useCallback((organization) => {
        setEditingOrganization(organization);
        setEditFormData({
            name: organization.name || '',
            logo: null
        });
        setEditFormErrors({});
        setPreviewEditLogo(organization.logo);
        setEditDialogOpen(true);
    }, []);

    const closeEditDialog = useCallback(() => {
        setEditDialogOpen(false);
        setEditingOrganization(null);
        setEditFormData({ name: '', logo: null });
        setEditFormErrors({});
        setPreviewEditLogo(null);
    }, []);

    const handleEditLogoChange = useCallback(async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const validation = validateUploadedFile(file);
        if (!validation.isValid) {
            toast.error(validation.error);
            return;
        }

        setEditFormData(prev => ({ ...prev, logo: file }));

        try {
            const preview = await createFilePreview(file);
            setPreviewEditLogo(preview);
        } catch (error) {
            console.error('Error creating file preview:', error);
        }
    }, []);

    const validateEditForm = useCallback(() => {
        const errors = validateOrganizationForm(editFormData);
        setEditFormErrors(errors);
        return Object.keys(errors).length === 0;
    }, [editFormData]);

    const handleEditSubmit = useCallback(async (updateFunction) => {
        if (!validateEditForm() || !editingOrganization) return;

        const result = await updateFunction(editingOrganization.id, editFormData);
        if (result.success) {
            closeEditDialog();
            if (onUpdateSuccess) onUpdateSuccess();
        }
    }, [editFormData, editingOrganization, validateEditForm, closeEditDialog, onUpdateSuccess]);

    // Delete Dialog Functions
    const openDeleteDialog = useCallback((organization) => {
        setOrganizationToDelete(organization);
        setDeleteConfirmDialog(true);
    }, []);

    const closeDeleteDialog = useCallback(() => {
        setDeleteConfirmDialog(false);
        setOrganizationToDelete(null);
    }, []);

    const handleDeleteConfirm = useCallback(async (deleteFunction) => {
        if (!organizationToDelete) return;

        const result = await deleteFunction(organizationToDelete.id);
        if (result.success) {
            closeDeleteDialog();
            if (onDeleteSuccess) onDeleteSuccess();
        }
    }, [organizationToDelete, closeDeleteDialog, onDeleteSuccess]);

    return {
        // Create Dialog
        createDialogOpen,
        createFormData,
        setCreateFormData,
        createFormErrors,
        previewCreateLogo,
        openCreateDialog,
        closeCreateDialog,
        handleCreateLogoChange,
        handleCreateSubmit,

        // Edit Dialog
        editDialogOpen,
        editingOrganization,
        editFormData,
        setEditFormData,
        editFormErrors,
        previewEditLogo,
        openEditDialog,
        closeEditDialog,
        handleEditLogoChange,
        handleEditSubmit,

        // Delete Dialog
        deleteConfirmDialog,
        organizationToDelete,
        openDeleteDialog,
        closeDeleteDialog,
        handleDeleteConfirm,
    };
};
