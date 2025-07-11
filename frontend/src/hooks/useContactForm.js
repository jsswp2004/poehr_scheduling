import { useState } from 'react';

/**
 * Custom hook for managing contact form dialog state and data
 * Handles contact creation and editing form functionality
 */
export const useContactForm = () => {
    const [contactForm, setContactForm] = useState({
        name: '',
        phone: '',
        email: ''
    });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingContact, setEditingContact] = useState(null);

    // Handle form field changes
    const updateContactForm = (field, value) => {
        setContactForm(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Reset form to empty state
    const resetForm = () => {
        setContactForm({
            name: '',
            phone: '',
            email: ''
        });
        setEditingContact(null);
    };

    // Open dialog for creating new contact
    const openCreateDialog = () => {
        resetForm();
        setDialogOpen(true);
    };

    // Open dialog for editing existing contact
    const openEditDialog = (contact) => {
        setEditingContact(contact);
        setContactForm({
            name: contact.name,
            phone: contact.phone,
            email: contact.email
        });
        setDialogOpen(true);
    };

    // Close dialog
    const closeDialog = () => {
        setDialogOpen(false);
        resetForm();
    };

    // Check if form is valid
    const isFormValid = () => {
        return contactForm.name.trim() !== '';
    };

    return {
        contactForm,
        dialogOpen,
        editingContact,
        updateContactForm,
        resetForm,
        openCreateDialog,
        openEditDialog,
        closeDialog,
        isFormValid
    };
};
