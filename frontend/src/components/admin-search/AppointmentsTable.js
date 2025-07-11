import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Tooltip,
    Box
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash } from '@fortawesome/free-solid-svg-icons';

/**
 * AppointmentsTable Component
 * Displays appointments in a table format with actions
 */
const AppointmentsTable = ({
    appointments,
    onViewDetails,
    onDeleteAppointment
}) => {
    return (
        <TableContainer
            component={Paper}
            sx={{ borderRadius: 2, boxShadow: 2, minWidth: 900 }}
        >
            <Table
                size="small"
                sx={{ '& tbody tr:nth-of-type(odd)': { backgroundColor: '#f7fafc' } }}
            >
                <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                    <TableRow>
                        <TableCell><b>Clinic Event</b></TableCell>
                        <TableCell><b>Patient</b></TableCell>
                        <TableCell><b>Provider</b></TableCell>
                        <TableCell><b>Date & Time</b></TableCell>
                        <TableCell><b>Description</b></TableCell>
                        <TableCell><b>Duration (min)</b></TableCell>
                        <TableCell><b>Status</b></TableCell>
                        <TableCell><b>Actions</b></TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {appointments.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={8}
                                align="center"
                                sx={{ color: 'text.secondary', py: 3 }}
                            >
                                No appointments found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        appointments.map((appt) => (
                            <TableRow key={appt.id} hover>
                                <TableCell>{appt.title || '-'}</TableCell>
                                <TableCell>
                                    {appt.patient_name ||
                                        (appt.patient &&
                                            `${appt.patient.first_name} ${appt.patient.last_name}`) ||
                                        '-'}
                                </TableCell>
                                <TableCell>
                                    {appt.provider_name ||
                                        (appt.provider &&
                                            (appt.provider.first_name || appt.provider.last_name)
                                            ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                                            : '-')}
                                </TableCell>
                                <TableCell>
                                    {appt.appointment_datetime
                                        ? new Date(appt.appointment_datetime).toLocaleString()
                                        : '-'}
                                </TableCell>
                                <TableCell>{appt.description || '-'}</TableCell>
                                <TableCell>{appt.duration_minutes || '-'}</TableCell>
                                <TableCell>{appt.status || '-'}</TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Tooltip title="View Appointment Details">
                                            <IconButton
                                                size="small"
                                                color="primary"
                                                onClick={() => onViewDetails(appt)}
                                            >
                                                <FontAwesomeIcon icon={faEye} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete Appointment">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteAppointment(appt.id);
                                                }}
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default AppointmentsTable;
