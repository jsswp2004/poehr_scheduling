import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button
} from '@mui/material';

/**
 * DeleteConfirmationDialog Component
 * Handles confirmation dialog for organization deletion
 */
const DeleteConfirmationDialog = ({
    open,
    organizationToDelete,
    onClose,
    onConfirmDelete
}) => {
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogContent>
                Are you sure you want to delete the organization "{organizationToDelete?.name}"?
                This action cannot be undone.
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={() => onConfirmDelete(organizationToDelete?.id)}
                    color="error"
                    variant="contained"
                >
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteConfirmationDialog;
