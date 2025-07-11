import React from 'react';
import {
    Paper,
    Typography,
    Box,
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox
} from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';

/**
 * Today's appointments table with status management
 */
const TodaysAppointmentsPanel = ({
    todaysAppointments,
    onStatusUpdate,
    onAppointmentClick,
    formatPatientName,
    formatProviderName,
    formatAppointmentTime
}) => {
    return (
        <Grid item xs={12}>
            <Paper
                sx={{
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 2,
                    mb: 2,
                    minWidth: 420,
                    minHeight: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TodayIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                        Today's Appointments
                    </Typography>
                </Box>

                <TableContainer sx={{ maxHeight: '300px', overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Arrived</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>No Show</TableCell>
                            </TableRow>
                        </TableHead>

                        <TableBody>
                            {todaysAppointments.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        align="center"
                                        sx={{ color: 'text.secondary', py: 2 }}
                                    >
                                        No appointments today.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                todaysAppointments.map((appt) => (
                                    <TableRow
                                        key={appt.id}
                                        hover
                                        sx={{
                                            '&:hover': {
                                                backgroundColor: '#f0f7ff',
                                            },
                                        }}
                                    >
                                        <TableCell
                                            onClick={() => onAppointmentClick(appt)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            {formatAppointmentTime(appt.appointment_datetime)}
                                        </TableCell>

                                        <TableCell
                                            onClick={() => onAppointmentClick(appt)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            {formatPatientName(appt)}
                                        </TableCell>

                                        <TableCell
                                            onClick={() => onAppointmentClick(appt)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            {formatProviderName(appt)}
                                        </TableCell>

                                        <TableCell>
                                            <Checkbox
                                                checked={appt.arrived || false}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    onStatusUpdate(appt.id, 'arrived', e.target.checked);
                                                }}
                                                color="primary"
                                                size="small"
                                            />
                                        </TableCell>

                                        <TableCell>
                                            <Checkbox
                                                checked={appt.no_show || false}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    onStatusUpdate(appt.id, 'no_show', e.target.checked);
                                                }}
                                                color="error"
                                                size="small"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Grid>
    );
};

export default TodaysAppointmentsPanel;
