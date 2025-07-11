import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button
} from '@mui/material';

/**
 * Contact form dialog for creating and editing contacts
 */
const ContactFormDialog = ({
    open,
    editingContact,
    contactForm,
    onClose,
    onSave,
    onFormChange
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
            </DialogTitle>

            <DialogContent>
                <TextField
                    fullWidth
                    label="Name"
                    value={contactForm.name}
                    onChange={(e) => onFormChange('name', e.target.value)}
                    margin="normal"
                    required
                />

                <TextField
                    fullWidth
                    label="Phone"
                    value={contactForm.phone}
                    onChange={(e) => onFormChange('phone', e.target.value)}
                    margin="normal"
                    placeholder="+1234567890"
                />

                <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => onFormChange('email', e.target.value)}
                    margin="normal"
                    placeholder="contact@example.com"
                />
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={onSave} variant="contained">
                    {editingContact ? 'Update' : 'Create'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ContactFormDialog;
