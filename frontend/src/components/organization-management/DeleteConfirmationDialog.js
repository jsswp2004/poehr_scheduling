/**
 * DeleteConfirmationDialog component - Confirmation dialog for deleting organizations
 */
import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Alert,
    Stack,
} from '@mui/material';
import { Warning } from '@mui/icons-material';

const DeleteConfirmationDialog = ({
    open,
    onClose,
    organization,
    onConfirm,
    saving,
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Warning color="error" />
                    <span>Delete Organization</span>
                </Stack>
            </DialogTitle>

            <DialogContent>
                <Alert severity="error" sx={{ mb: 2 }}>
                    This action cannot be undone!
                </Alert>

                <Typography variant="body1">
                    Are you sure you want to delete the organization{' '}
                    <strong>"{organization?.name}"</strong>?
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    This will permanently remove the organization and all associated data.
                    All users belonging to this organization will lose access.
                </Typography>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    onClick={onConfirm}
                    variant="contained"
                    color="error"
                    disabled={saving}
                >
                    {saving ? 'Deleting...' : 'Delete Organization'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteConfirmationDialog;
