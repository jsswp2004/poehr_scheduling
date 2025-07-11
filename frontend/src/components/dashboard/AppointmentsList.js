import React from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Chip,
    Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

/**
 * Appointments list component with edit/delete actions
 */
const AppointmentsList = ({
    appointments,
    editingId,
    onEdit,
    onDelete,
    getDoctorName,
}) => {
    const formatDateTime = (dateTime) => {
        const date = new Date(dateTime);
        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
    };

    const getStatusColor = (appointment) => {
        const now = new Date();
        const appointmentDate = new Date(appointment.appointment_datetime);

        if (appointmentDate < now) {
            return 'default'; // Past
        } else if (appointmentDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
            return 'warning'; // Today/Tomorrow
        } else {
            return 'primary'; // Future
        }
    };

    const getStatusText = (appointment) => {
        const now = new Date();
        const appointmentDate = new Date(appointment.appointment_datetime);

        if (appointmentDate < now) {
            return 'Completed';
        } else if (appointmentDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
            return 'Upcoming';
        } else {
            return 'Scheduled';
        }
    };

    if (appointments.length === 0) {
        return (
            <Paper elevation={1} sx={{ padding: 3, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                    No appointments found. Book your first appointment above!
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={2} sx={{ marginTop: 3 }}>
            <Box sx={{ padding: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Your Appointments ({appointments.length})
                </Typography>
            </Box>

            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><strong>Title</strong></TableCell>
                            <TableCell><strong>Provider</strong></TableCell>
                            <TableCell><strong>Date</strong></TableCell>
                            <TableCell><strong>Time</strong></TableCell>
                            <TableCell><strong>Duration</strong></TableCell>
                            <TableCell><strong>Status</strong></TableCell>
                            <TableCell align="center"><strong>Actions</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {appointments.map((appointment) => {
                            const { date, time } = formatDateTime(appointment.appointment_datetime);
                            return (
                                <TableRow
                                    key={appointment.id}
                                    sx={{
                                        backgroundColor: editingId === appointment.id ? '#f5f5f5' : 'inherit',
                                        '&:hover': { backgroundColor: '#fafafa' }
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="medium">
                                            {appointment.title}
                                        </Typography>
                                        {appointment.description && (
                                            <Typography variant="caption" color="text.secondary">
                                                {appointment.description}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {getDoctorName(appointment.provider)}
                                    </TableCell>
                                    <TableCell>{date}</TableCell>
                                    <TableCell>{time}</TableCell>
                                    <TableCell>{appointment.duration_minutes} min</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={getStatusText(appointment)}
                                            color={getStatusColor(appointment)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Edit Appointment">
                                            <IconButton
                                                size="small"
                                                onClick={() => onEdit(appointment)}
                                                color="primary"
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete Appointment">
                                            <IconButton
                                                size="small"
                                                onClick={() => {
                                                    if (window.confirm('Are you sure you want to delete this appointment?')) {
                                                        onDelete(appointment.id);
                                                    }
                                                }}
                                                color="error"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default AppointmentsList;
