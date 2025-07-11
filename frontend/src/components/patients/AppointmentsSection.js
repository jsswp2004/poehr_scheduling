import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Tabs,
    Tab,
    Button,
    CircularProgress,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import CalendarView from '../CalendarView';

function AppointmentsSection({
    appointmentsTab,
    setAppointmentsTab,
    appointmentsQuery,
    setAppointmentsQuery,
    todaysAppointments,
    appointmentsResults,
    onStatusUpdate,
    onViewDetails,
    loading = false,
}) {
    const formatDateTime = (dateTimeStr) => {
        if (!dateTimeStr) return 'N/A';
        try {
            const date = new Date(dateTimeStr);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
        } catch {
            return 'Invalid Date';
        }
    };

    if (loading) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Loading appointments...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* Appointments Sub-tabs */}
            <Tabs
                value={appointmentsTab}
                onChange={(e, newVal) => setAppointmentsTab(newVal)}
                sx={{
                    mb: 3,
                    '& .MuiTabs-indicator': {
                        height: 3,
                        borderRadius: 1,
                    },
                }}
            >
                <Tab label="Today's Appointments" value="today" />
                <Tab label="Calendar View" value="calendar" />
                <Tab label="All Appointments" value="all" />
            </Tabs>

            {/* Today's Appointments */}
            {appointmentsTab === 'today' && (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                        Today's Appointments Summary
                    </Typography>

                    {todaysAppointments.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No appointments scheduled for today
                            </Typography>
                        </Paper>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Duration</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                            Arrived
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                            No Show
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                            Actions
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {todaysAppointments.map((appointment) => (
                                        <TableRow key={appointment.id}>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDateTime(appointment.appointment_datetime)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.patient_name ||
                                                        (appointment.patient
                                                            ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                                                            : 'N/A')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.provider_name ||
                                                        (appointment.provider
                                                            ? `Dr. ${appointment.provider.first_name} ${appointment.provider.last_name}`
                                                            : 'N/A')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.duration_minutes ? `${appointment.duration_minutes} min` : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Checkbox
                                                    checked={appointment.arrived || false}
                                                    onChange={(e) =>
                                                        onStatusUpdate(appointment.id, 'arrived', e.target.checked)
                                                    }
                                                    color="success"
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Checkbox
                                                    checked={appointment.no_show || false}
                                                    onChange={(e) =>
                                                        onStatusUpdate(appointment.id, 'no_show', e.target.checked)
                                                    }
                                                    color="error"
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Button
                                                    size="small"
                                                    onClick={() => onViewDetails(appointment)}
                                                    sx={{ minWidth: 'auto', p: 0.5 }}
                                                >
                                                    <FontAwesomeIcon icon={faEye} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}

            {/* Calendar View */}
            {appointmentsTab === 'calendar' && (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                        Calendar View
                    </Typography>
                    <CalendarView />
                </Box>
            )}

            {/* All Appointments */}
            {appointmentsTab === 'all' && (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                        All Appointments
                    </Typography>

                    {/* Search */}
                    <Box sx={{ mb: 3 }}>
                        <TextField
                            label="Search appointments..."
                            value={appointmentsQuery}
                            onChange={(e) => setAppointmentsQuery(e.target.value)}
                            variant="outlined"
                            size="small"
                            sx={{ minWidth: 300 }}
                            placeholder="Search by patient, provider, date, description..."
                        />
                    </Box>

                    {/* Appointments Table */}
                    {appointmentsResults.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                {appointmentsQuery ? 'No appointments found matching your search' : 'No appointments found'}
                            </Typography>
                        </Paper>
                    ) : (
                        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Date & Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Duration</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                            Actions
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {appointmentsResults.map((appointment) => (
                                        <TableRow
                                            key={appointment.id}
                                            sx={{ '&:hover': { bgcolor: '#f5f5f5' } }}
                                        >
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDateTime(appointment.appointment_datetime)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.patient_name ||
                                                        (appointment.patient
                                                            ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                                                            : 'N/A')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.provider_name ||
                                                        (appointment.provider
                                                            ? `Dr. ${appointment.provider.first_name} ${appointment.provider.last_name}`
                                                            : 'N/A')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {appointment.duration_minutes ? `${appointment.duration_minutes} min` : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: appointment.status === 'confirmed' ? 'success.main' :
                                                            appointment.status === 'cancelled' ? 'error.main' : 'text.primary'
                                                    }}
                                                >
                                                    {appointment.status || 'Pending'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Button
                                                    size="small"
                                                    onClick={() => onViewDetails(appointment)}
                                                    sx={{ minWidth: 'auto', p: 0.5 }}
                                                >
                                                    <FontAwesomeIcon icon={faEye} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}
        </Box>
    );
}

export default AppointmentsSection;
