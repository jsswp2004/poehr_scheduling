import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * Modal dialog for displaying appointment details
 */
const AppointmentDetailsDialog = ({
    open,
    onClose,
    appointment,
    formatPatientName,
    formatProviderName,
    formatAppointmentDateTime
}) => {
    const navigate = useNavigate();

    const handleEdit = () => {
        onClose();
        navigate(`/appointments/${appointment.id}/edit`);
    };

    if (!appointment) {
        return null;
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>Appointment Details</DialogTitle>

            <DialogContent dividers>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography>
                        <b>Patient:</b> {formatPatientName(appointment)}
                    </Typography>

                    <Typography>
                        <b>Provider:</b> {formatProviderName(appointment)}
                    </Typography>

                    <Typography>
                        <b>Date & Time:</b> {formatAppointmentDateTime(appointment.appointment_datetime)}
                    </Typography>

                    <Typography>
                        <b>Description:</b> {appointment.description || '-'}
                    </Typography>

                    <Typography>
                        <b>Duration (min):</b> {appointment.duration_minutes || '-'}
                    </Typography>

                    <Typography>
                        <b>Status:</b> {appointment.status || '-'}
                    </Typography>

                    <Typography>
                        <b>Clinic Event:</b> {appointment.title || '-'}
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} color="primary">
                    Close
                </Button>
                <Button
                    color="secondary"
                    variant="contained"
                    onClick={handleEdit}
                >
                    Edit
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AppointmentDetailsDialog;
