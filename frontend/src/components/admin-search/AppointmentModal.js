import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * AppointmentModal Component
 * Displays appointment details in a modal dialog
 */
const AppointmentModal = ({
    open,
    onClose,
    appointment
}) => {
    const navigate = useNavigate();

    const handleEdit = () => {
        onClose();
        navigate(`/appointments/${appointment.id}/edit`);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {appointment && (
                    <>
                        <Typography>
                            <b>Patient:</b>{' '}
                            {appointment.patient_name ||
                                (appointment.patient
                                    ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                                    : '-')}
                        </Typography>
                        <Typography>
                            <b>Provider:</b>{' '}
                            {appointment.provider_name ||
                                (appointment.provider
                                    ? `Dr. ${appointment.provider.first_name || ''} ${appointment.provider.last_name || ''}`.trim()
                                    : '-')}
                        </Typography>
                        <Typography>
                            <b>Date & Time:</b>{' '}
                            {appointment.appointment_datetime
                                ? new Date(appointment.appointment_datetime).toLocaleString()
                                : '-'}
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
                    </>
                )}
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

export default AppointmentModal;
