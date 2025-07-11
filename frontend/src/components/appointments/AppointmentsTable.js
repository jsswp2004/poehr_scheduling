import React from 'react';
import {
    TextField,
    Button,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Typography,
    Grid,
    Pagination
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';

/**
 * Main appointments table with search and pagination
 */
const AppointmentsTable = ({
    searchQuery,
    onSearchChange,
    appointments,
    onViewDetails,
    onDeleteAppointment,
    formatPatientName,
    formatProviderName,
    formatAppointmentDateTime,
    page,
    totalPages,
    onPageChange,
    loading
}) => {
    const handleDelete = async (appointment, event) => {
        event.stopPropagation();

        if (window.confirm('Are you sure you want to delete this appointment?')) {
            const success = await onDeleteAppointment(appointment.id);
            if (!success) {
                alert('Failed to delete appointment.');
            }
        }
    };

    return (
        <Grid item xs={12}>
            <Paper
                sx={{
                    p: 3,
                    borderRadius: 2,
                    boxShadow: 2,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
                <Typography variant="h5" fontWeight={600} gutterBottom>
                    Appointments
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                    <TextField
                        type="text"
                        label="Search by patient, provider, date or description"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        fullWidth
                        size="small"
                        disabled={loading}
                    />
                </Box>

                <TableContainer
                    sx={{
                        borderRadius: 2,
                        boxShadow: 2,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'auto',
                        minHeight: 0,
                        width: '100%',
                    }}
                >
                    <Table
                        size="small"
                        sx={{
                            '& tbody tr:nth-of-type(odd)': { backgroundColor: '#f7fafc' },
                        }}
                    >
                        <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>Clinic Event</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Date & Time</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Duration (min)</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
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
                                        {loading ? 'Loading appointments...' : 'No appointments found.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                appointments.map((appt) => (
                                    <TableRow key={appt.id} hover>
                                        <TableCell>{appt.title || '-'}</TableCell>
                                        <TableCell>{formatPatientName(appt)}</TableCell>
                                        <TableCell>{formatProviderName(appt)}</TableCell>
                                        <TableCell>{formatAppointmentDateTime(appt.appointment_datetime)}</TableCell>
                                        <TableCell>{appt.description || '-'}</TableCell>
                                        <TableCell>{appt.duration_minutes || '-'}</TableCell>
                                        <TableCell>{appt.status || '-'}</TableCell>
                                        <TableCell>
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                }}
                                            >
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    onClick={() => onViewDetails(appt)}
                                                    sx={{
                                                        backgroundColor: 'white',
                                                        color: 'primary.main',
                                                        borderColor: 'primary.light',
                                                        minWidth: 0,
                                                        px: 1.5,
                                                        py: 0.5,
                                                        fontWeight: 500,
                                                        fontSize: 14,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        '&:hover': {
                                                            backgroundColor: '#e3f2fd',
                                                            color: '#1976d2',
                                                            borderColor: '#1976d2',
                                                            boxShadow: '0 2px 8px 0 rgba(25, 118, 210, 0.10)',
                                                        },
                                                    }}
                                                    title="View Appointment Details"
                                                >
                                                    <VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                </Button>

                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    color="error"
                                                    onClick={(e) => handleDelete(appt, e)}
                                                    sx={{
                                                        backgroundColor: 'white',
                                                        borderColor: 'error.light',
                                                        color: 'error.main',
                                                        minWidth: 0,
                                                        px: 1.5,
                                                        py: 0.5,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        transition: 'background 0.2s, color 0.2s',
                                                        '&:hover': {
                                                            backgroundColor: '#ffebee',
                                                            color: '#d32f2f',
                                                            borderColor: '#d32f2f',
                                                            boxShadow: '0 2px 8px 0 rgba(211, 47, 47, 0.10)',
                                                        },
                                                    }}
                                                    title="Delete Appointment"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(_, value) => onPageChange(value)}
                            color="primary"
                            shape="rounded"
                        />
                    </Box>
                )}
            </Paper>
        </Grid>
    );
};

export default AppointmentsTable;
