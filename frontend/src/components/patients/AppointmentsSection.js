import React, { useState, useMemo } from 'react';
import { API_BASE_URL } from '../../config/api';
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
    TableSortLabel,
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
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Chip,
    Stack,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../CalendarView';

// Appointment status options from the backend
const APPOINTMENT_STATUS_OPTIONS = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'no_show', label: 'No Show' },
    { value: 'rescheduled', label: 'Rescheduled' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
];

// Helper function to get status color
const getStatusColor = (status) => {
    switch (status) {
        case 'completed': return 'success';
        case 'cancelled': return 'error';
        case 'no_show': return 'error';
        case 'rescheduled': return 'warning';
        case 'pending': return 'info';
        case 'in_progress': return 'primary';
        case 'scheduled':
        default: return 'default';
    }
};

// Columns for the sortable "Today's Appointments" table. `sortValue` pulls
// the raw comparable value for a row; `field` is used as the sort/filter key.
const TODAY_COLUMNS = [
    { field: 'time', label: 'Time' },
    { field: 'patient', label: 'Patient' },
    { field: 'provider', label: 'Provider' },
    { field: 'duration', label: 'Duration' },
    { field: 'arrived', label: 'Arrived', align: 'center' },
    { field: 'no_show', label: 'No Show', align: 'center' },
    { field: 'status', label: 'Status', align: 'center' },
];

const getPatientName = (appointment) =>
    appointment.patient_name ||
    (appointment.patient
        ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
        : '');

const getProviderName = (appointment) =>
    appointment.provider_name ||
    (appointment.provider
        ? `Dr. ${appointment.provider.first_name || ''} ${appointment.provider.last_name || ''}`.trim()
        : '');

const getTodaySortValue = (appointment, field) => {
    switch (field) {
        case 'time':
            return appointment.appointment_datetime
                ? new Date(appointment.appointment_datetime).getTime()
                : 0;
        case 'patient':
            return getPatientName(appointment).toLowerCase();
        case 'provider':
            return getProviderName(appointment).toLowerCase();
        case 'duration':
            return appointment.duration_minutes || 0;
        case 'arrived':
            return appointment.arrived ? 1 : 0;
        case 'no_show':
            return appointment.no_show ? 1 : 0;
        case 'status':
            return (appointment.status || 'scheduled').toLowerCase();
        default:
            return '';
    }
};

const YES_NO_FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
];

function AppointmentsSection({
    appointmentsTab,
    setAppointmentsTab,
    appointmentsQuery,
    setAppointmentsQuery,
    todaysAppointments,
    appointmentsResults,
    onStatusUpdate,
    onViewDetails,
    onAppointmentStatusUpdate, // New prop for handling appointment status changes
    loading = false,
}) {
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const navigate = useNavigate();

    // Sorting + per-column filtering for the "Today's Appointments" table.
    // These are local UI state only -- they never refetch from the server,
    // they just reorder/narrow the same `todaysAppointments` array the
    // parent already fetched, so a status change (or anything else that
    // refreshes that array) keeps whatever sort/filter is currently set.
    const [todaySort, setTodaySort] = useState({ field: 'time', direction: 'asc' });
    const [todayFilters, setTodayFilters] = useState({
        patient: '',
        provider: '',
        arrived: 'all',
        no_show: 'all',
        status: 'all',
    });

    const handleTodaySort = (field) => {
        setTodaySort((prev) =>
            prev.field === field
                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: 'asc' }
        );
    };

    const handleTodayFilterChange = (field, value) => {
        setTodayFilters((prev) => ({ ...prev, [field]: value }));
    };

    const clearTodayFilters = () => {
        setTodayFilters({ patient: '', provider: '', arrived: 'all', no_show: 'all', status: 'all' });
    };

    const hasActiveTodayFilters =
        todayFilters.patient.trim() !== '' ||
        todayFilters.provider.trim() !== '' ||
        todayFilters.arrived !== 'all' ||
        todayFilters.no_show !== 'all' ||
        todayFilters.status !== 'all';

    const displayedTodaysAppointments = useMemo(() => {
        const patientQuery = todayFilters.patient.trim().toLowerCase();
        const providerQuery = todayFilters.provider.trim().toLowerCase();

        const filtered = todaysAppointments.filter((appointment) => {
            if (patientQuery && !getPatientName(appointment).toLowerCase().includes(patientQuery)) {
                return false;
            }
            if (providerQuery && !getProviderName(appointment).toLowerCase().includes(providerQuery)) {
                return false;
            }
            if (todayFilters.arrived !== 'all') {
                const wantArrived = todayFilters.arrived === 'yes';
                if (!!appointment.arrived !== wantArrived) return false;
            }
            if (todayFilters.no_show !== 'all') {
                const wantNoShow = todayFilters.no_show === 'yes';
                if (!!appointment.no_show !== wantNoShow) return false;
            }
            if (todayFilters.status !== 'all') {
                const status = appointment.status || 'scheduled';
                if (status !== todayFilters.status) return false;
            }
            return true;
        });

        const sorted = [...filtered].sort((a, b) => {
            const va = getTodaySortValue(a, todaySort.field);
            const vb = getTodaySortValue(b, todaySort.field);
            if (va < vb) return todaySort.direction === 'asc' ? -1 : 1;
            if (va > vb) return todaySort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }, [todaysAppointments, todayFilters, todaySort]);

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
                <Tab label="Calendar View" value="calendar" />
                <Tab label="Today's Appointments" value="today" />
                <Tab label="All Appointments" value="all" />
            </Tabs>

            {/* Today's Appointments */}
            {appointmentsTab === 'today' && (
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Typography variant="h6" sx={{ color: 'primary.main' }}>
                            Today's Appointments Summary
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Showing {displayedTodaysAppointments.length} of {todaysAppointments.length}
                        </Typography>
                    </Box>

                    {/* Column filters -- narrows the table below without ever
                        removing a row from the underlying data or refetching;
                        a status change never drops a patient out of this list. */}
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                            <TextField
                                size="small"
                                label="Filter Patient"
                                value={todayFilters.patient}
                                onChange={(e) => handleTodayFilterChange('patient', e.target.value)}
                                sx={{ minWidth: 160 }}
                            />
                            <TextField
                                size="small"
                                label="Filter Provider"
                                value={todayFilters.provider}
                                onChange={(e) => handleTodayFilterChange('provider', e.target.value)}
                                sx={{ minWidth: 160 }}
                            />
                            <FormControl size="small" sx={{ minWidth: 130 }}>
                                <InputLabel id="today-filter-arrived-label">Arrived</InputLabel>
                                <Select
                                    labelId="today-filter-arrived-label"
                                    label="Arrived"
                                    value={todayFilters.arrived}
                                    onChange={(e) => handleTodayFilterChange('arrived', e.target.value)}
                                >
                                    {YES_NO_FILTER_OPTIONS.map((opt) => (
                                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 130 }}>
                                <InputLabel id="today-filter-noshow-label">No Show</InputLabel>
                                <Select
                                    labelId="today-filter-noshow-label"
                                    label="No Show"
                                    value={todayFilters.no_show}
                                    onChange={(e) => handleTodayFilterChange('no_show', e.target.value)}
                                >
                                    {YES_NO_FILTER_OPTIONS.map((opt) => (
                                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel id="today-filter-status-label">Status</InputLabel>
                                <Select
                                    labelId="today-filter-status-label"
                                    label="Status"
                                    value={todayFilters.status}
                                    onChange={(e) => handleTodayFilterChange('status', e.target.value)}
                                >
                                    <MenuItem value="all">All</MenuItem>
                                    {APPOINTMENT_STATUS_OPTIONS.map((opt) => (
                                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            {hasActiveTodayFilters && (
                                <Button size="small" onClick={clearTodayFilters}>
                                    Clear filters
                                </Button>
                            )}
                        </Stack>
                    </Paper>

                    {todaysAppointments.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No appointments scheduled for today
                            </Typography>
                        </Paper>
                    ) : displayedTodaysAppointments.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                No appointments match the current filters
                            </Typography>
                        </Paper>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                        {TODAY_COLUMNS.map((col) => (
                                            <TableCell
                                                key={col.field}
                                                sx={{ fontWeight: 'bold', textAlign: col.align || 'left' }}
                                            >
                                                <TableSortLabel
                                                    active={todaySort.field === col.field}
                                                    direction={todaySort.field === col.field ? todaySort.direction : 'asc'}
                                                    onClick={() => handleTodaySort(col.field)}
                                                >
                                                    {col.label}
                                                </TableSortLabel>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {displayedTodaysAppointments.map((appointment) => (
                                        <TableRow key={appointment.id}>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDateTime(appointment.appointment_datetime)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {getPatientName(appointment) || 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {getProviderName(appointment) || 'N/A'}
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
                                                <FormControl size="small" sx={{ minWidth: 120 }}>
                                                    <Select
                                                        value={appointment.status || 'scheduled'}
                                                        onChange={(e) => {
                                                            if (onAppointmentStatusUpdate) {
                                                                onAppointmentStatusUpdate(appointment.id, e.target.value);
                                                            }
                                                        }}
                                                        displayEmpty
                                                        renderValue={(selected) => {
                                                            const option = APPOINTMENT_STATUS_OPTIONS.find(opt => opt.value === selected);
                                                            return (
                                                                <Chip
                                                                    label={option?.label || 'Scheduled'}
                                                                    color={getStatusColor(selected)}
                                                                    size="small"
                                                                    variant="filled"
                                                                />
                                                            );
                                                        }}
                                                        sx={{
                                                            height: 32,
                                                            fontSize: '0.875rem',
                                                            '& .MuiSelect-select': {
                                                                padding: '4px 8px',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }
                                                        }}
                                                    >
                                                        {APPOINTMENT_STATUS_OPTIONS.map((option) => (
                                                            <MenuItem key={option.value} value={option.value}>
                                                                <Chip
                                                                    label={option.label}
                                                                    color={getStatusColor(option.value)}
                                                                    size="small"
                                                                    variant="outlined"
                                                                />
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
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
                                                                            `${API_BASE_URL}/api/appointments/${appointment.id}/`,
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
