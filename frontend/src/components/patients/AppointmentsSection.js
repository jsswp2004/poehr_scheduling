import React, { useState } from 'react';
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
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
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
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const navigate = useNavigate();

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
                    <CalendarView showBackButton={false} />
                </Box>
            )}

            {/* All Appointments */}
            {appointmentsTab === 'all' && (
                <Box>
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 3
                    }}>
                        <Typography variant="h6" sx={{ color: 'primary.main' }}>
                            Appointments List
                        </Typography>

                        {/* Search */}
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
                        <TableContainer
                            component={Paper}
                            sx={{ borderRadius: 2, boxShadow: 2, minWidth: 900 }}
                        >
                            <Table
                                size="small"
                                sx={{ "& tbody tr:nth-of-type(odd)": { backgroundColor: "#f7fafc" } }}
                            >
                                <TableHead sx={{ bgcolor: "#e3f2fd" }}>
                                    <TableRow>
                                        <TableCell>
                                            <b>Clinic Event</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Patient</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Provider</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Date & Time</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Description</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Duration (min)</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Status</b>
                                        </TableCell>
                                        <TableCell>
                                            <b>Actions</b>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {appointmentsResults.map((appointment) => (
                                        <TableRow
                                            key={appointment.id}
                                            hover
                                        >
                                            <TableCell>{appointment.title || "-"}</TableCell>
                                            <TableCell>
                                                {appointment.patient_name ||
                                                    (appointment.patient
                                                        ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                                                        : "-")}
                                            </TableCell>
                                            <TableCell>
                                                {appointment.provider_name ||
                                                    (appointment.provider &&
                                                        (appointment.provider.first_name || appointment.provider.last_name)
                                                        ? `Dr. ${appointment.provider.first_name || ""} ${appointment.provider.last_name || ""}`.trim()
                                                        : "-")}
                                            </TableCell>
                                            <TableCell>
                                                {appointment.appointment_datetime
                                                    ? new Date(appointment.appointment_datetime).toLocaleString()
                                                    : "-"}
                                            </TableCell>
                                            <TableCell>{appointment.description || "-"}</TableCell>
                                            <TableCell>{appointment.duration_minutes || "-"}</TableCell>
                                            <TableCell>{appointment.status || "scheduled"}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: "flex", gap: 1 }}>
                                                    <Tooltip title="View Appointment Details">
                                                        <IconButton
                                                            size="small"
                                                            color="primary"
                                                            onClick={() => {
                                                                setSelectedAppointment(appointment);
                                                                setDetailsOpen(true);
                                                            }}
                                                        >
                                                            <FontAwesomeIcon icon={faEye} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete Appointment">
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (
                                                                    window.confirm(
                                                                        "Are you sure you want to delete this appointment?"
                                                                    )
                                                                ) {
                                                                    try {
                                                                        const token = localStorage.getItem("access_token");
                                                                        await fetch(
                                                                            `http://127.0.0.1:8000/api/appointments/${appointment.id}/`,
                                                                            {
                                                                                method: 'DELETE',
                                                                                headers: {
                                                                                    Authorization: `Bearer ${token}`,
                                                                                },
                                                                            }
                                                                        );
                                                                        // Refresh appointments list
                                                                        window.location.reload();
                                                                    } catch (err) {
                                                                        alert("Failed to delete appointment.");
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <FontAwesomeIcon icon={faTrash} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}

            {/* Appointment Details Dialog */}
            <Dialog
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Appointment Details</DialogTitle>
                <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {selectedAppointment && (
                        <>
                            <Typography>
                                <b>Patient:</b>{" "}
                                {selectedAppointment.patient_name ||
                                    (selectedAppointment.patient
                                        ? `${selectedAppointment.patient.first_name} ${selectedAppointment.patient.last_name}`
                                        : "-")}
                            </Typography>
                            <Typography>
                                <b>Provider:</b>{" "}
                                {selectedAppointment.provider_name ||
                                    (selectedAppointment.provider
                                        ? `Dr. ${selectedAppointment.provider.first_name || ""} ${selectedAppointment.provider.last_name || ""
                                            }`.trim()
                                        : "-")}
                            </Typography>
                            <Typography>
                                <b>Date & Time:</b>{" "}
                                {selectedAppointment.appointment_datetime
                                    ? new Date(
                                        selectedAppointment.appointment_datetime
                                    ).toLocaleString()
                                    : "-"}
                            </Typography>
                            <Typography>
                                <b>Description:</b> {selectedAppointment.description || "-"}
                            </Typography>
                            <Typography>
                                <b>Duration (min):</b>{" "}
                                {selectedAppointment.duration_minutes || "-"}
                            </Typography>
                            <Typography>
                                <b>Status:</b> {selectedAppointment.status || "-"}
                            </Typography>
                            <Typography>
                                <b>Clinic Event:</b> {selectedAppointment.title || "-"}
                            </Typography>
                            {selectedAppointment.arrived && (
                                <Typography>
                                    <b>Patient Arrived:</b> Yes
                                </Typography>
                            )}
                            {selectedAppointment.no_show && (
                                <Typography>
                                    <b>No Show:</b> Yes
                                </Typography>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsOpen(false)} color="primary">
                        Close
                    </Button>
                    <Button
                        color="secondary"
                        variant="contained"
                        onClick={() => {
                            setDetailsOpen(false);
                            navigate(`/appointments/${selectedAppointment.id}/edit`);
                        }}
                    >
                        Edit
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default AppointmentsSection;
