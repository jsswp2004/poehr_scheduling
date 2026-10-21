import React from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField
} from '@mui/material';

/**
 * Contact form dialog for creating and editing contacts.
 * Same structure as the Staffing dialogs: stacked fields, inline error alert.
 */
const ContactFormDialog = ({
    open,
    editingContact,
    contactForm,
    error,
    saving = false,
    onClose,
    onSave,
    onFormChange
}) => {
    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>

            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <TextField
                        fullWidth
                        required
                        label="Name"
                        value={contactForm.name}
                        onChange={(e) => onFormChange('name', e.target.value)}
                    />
                    <TextField
                        fullWidth
                        label="Phone"
                        value={contactForm.phone}
                        onChange={(e) => onFormChange('phone', e.target.value)}
                        placeholder="+1234567890"
                        helperText="Used for texts. Include the area code."
                    />
                    <TextField
                        fullWidth
                        label="Email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => onFormChange('email', e.target.value)}
                        placeholder="contact@example.com"
                    />
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={onSave} variant="contained" disabled={saving || !contactForm.name.trim()}>
                    {saving ? 'Saving...' : editingContact ? 'Save' : 'Add contact'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ContactFormDialog;
