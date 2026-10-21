import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button
} from '@mui/material';

/**
 * Small confirmation dialog (same Dialog pattern as the Staffing Center).
 * Replaces window.confirm and the toast-with-buttons used before.
 */
const ConfirmDialog = ({
    open,
    title,
    children,
    confirmLabel = 'Confirm',
    confirmColor = 'primary',
    busy = false,
    onConfirm,
    onClose
}) => (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
            <DialogContentText component="div">{children}</DialogContentText>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" color={confirmColor} onClick={onConfirm} disabled={busy}>
                {confirmLabel}
            </Button>
        </DialogActions>
    </Dialog>
);

export default ConfirmDialog;
