import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Container,
    Paper,
    TextField,
    Typography,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Checkbox,
    CircularProgress,
    Backdrop,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getValidToken, clearAuthData } from '../utils/auth';
import { API_BASE_URL } from '../config/api';
import BackButton from '../components/BackButton';

// Debounce utility function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const CheckInPage = () => {
    const navigate = useNavigate();
    const [token, setToken] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    // Authentication and authorization
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const validToken = await getValidToken();
                if (!validToken) {
                    clearAuthData();
                    navigate('/login');
                    return;
                }

                setToken(validToken);
                const decoded = jwtDecode(validToken);
                const role = decoded.role || '';

                // Check if user has proper permissions
                if (!['admin', 'system_admin', 'registrar'].includes(role)) {
                    toast.error('Access denied. Only administrators and registrars can access the check-in system.');
                    navigate('/dashboard');
                    return;
                }
            } catch (err) {
                console.error('❌ CheckInPage: Authentication failed:', err);
                clearAuthData();
                navigate('/login');
            }
        };

        initializeAuth();
    }, [navigate]);

    // Debounced search function
    const searchAppointments = useCallback(async (query) => {
        if (!query.trim() || !token) {
            setAppointments([]);
            return;
        }

        setSearchLoading(true);
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/check-in/search/`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { query: query.trim() }
                }
            );
            setAppointments(response.data);
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search appointments');
            setAppointments([]);
        } finally {
            setSearchLoading(false);
        }
    }, [token]);

    const debouncedSearch = useCallback((query) => {
        const search = debounce(searchAppointments, 300);
        search(query);
    }, [searchAppointments]);

    // Handle search input changes
    useEffect(() => {
        debouncedSearch(searchQuery);
    }, [searchQuery, debouncedSearch]);

    // Handle check-in status update
    const handleCheckInToggle = async (appointmentId, currentStatus) => {
        if (!token) return;

        setLoading(true);
        try {
            await axios.patch(
                `${API_BASE_URL}/api/check-in/update-status/${appointmentId}/`,
                { arrived: !currentStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Show immediate success alert
            alert(
                !currentStatus
                    ? 'Patient checked in successfully! Status updated to "In Progress". Page will refresh now.'
                    : 'Patient check-in status updated! Page will refresh now.'
            );

            // Auto-refresh the page after successful check-in
            window.location.reload();

        } catch (error) {
            console.error('Check-in update error:', error);
            toast.error('Failed to update check-in status');
            setLoading(false); // Only set loading false on error, since we're refreshing on success
        }
    };

    // Format appointment time
    const formatAppointmentTime = (datetime) => {
        if (!datetime) return '-';
        return new Date(datetime).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Format patient name
    const formatPatientName = (appointment) => {
        if (appointment.patient_name) {
            return appointment.patient_name;
        }
        if (appointment.patient) {
            return `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
        }
        return 'Unknown Patient';
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', py: 3 }}>
            <Container maxWidth="md">
                <BackButton />

                {/* Header */}
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Typography
                        variant="h3"
                        fontWeight={700}
                        sx={{
                            color: '#1976d2',
                            mb: 1,
                            fontSize: { xs: '2rem', md: '3rem' }
                        }}
                    >
                        Patient Check-In
                    </Typography>
                    <Typography
                        variant="h6"
                        color="text.secondary"
                        sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}
                    >
                        Quick and easy patient arrival tracking
                    </Typography>
                </Box>

                {/* Search Container */}
                <Paper
                    elevation={3}
                    sx={{
                        p: { xs: 3, md: 4 },
                        mb: 4,
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                        borderRadius: 3
                    }}
                >
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Typography variant="h5" fontWeight={600} color="primary" gutterBottom>
                            Search Patient
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Start typing a patient's name to find today's appointments
                        </Typography>
                    </Box>

                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="Please type your name to check in"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                fontSize: '1.2rem',
                                padding: '12px 16px',
                                borderRadius: 2,
                                '&:hover': {
                                    '& > fieldset': {
                                        borderColor: '#1976d2',
                                    },
                                },
                            },
                            '& .MuiInputBase-input': {
                                textAlign: 'center',
                                fontSize: { xs: '1.1rem', md: '1.3rem' },
                                py: { xs: 1.5, md: 2 }
                            }
                        }}
                        InputProps={{
                            endAdornment: searchLoading && (
                                <CircularProgress size={24} sx={{ color: '#1976d2' }} />
                            )
                        }}
                    />
                </Paper>

                {/* Results Table */}
                {appointments.length > 0 && (
                    <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{ p: 3, bgcolor: '#e3f2fd' }}>
                            <Typography variant="h6" fontWeight={600} color="primary">
                                Today's Appointments ({appointments.length})
                            </Typography>
                        </Box>

                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                            Time
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                            Patient Name
                                        </TableCell>
                                        <TableCell
                                            align="center"
                                            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                                        >
                                            Arrived
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {appointments
                                        .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime))
                                        .map((appointment) => (
                                            <TableRow
                                                key={appointment.id}
                                                hover
                                                sx={{
                                                    '&:nth-of-type(odd)': { bgcolor: '#fafafa' },
                                                    '&:hover': { bgcolor: '#e3f2fd' }
                                                }}
                                            >
                                                <TableCell sx={{ fontSize: '1.1rem', fontWeight: 500 }}>
                                                    {formatAppointmentTime(appointment.appointment_datetime)}
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '1.1rem', fontWeight: 500 }}>
                                                    {formatPatientName(appointment)}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Checkbox
                                                        checked={appointment.arrived || false}
                                                        onChange={() => handleCheckInToggle(
                                                            appointment.id,
                                                            appointment.arrived
                                                        )}
                                                        color="primary"
                                                        size="large"
                                                        sx={{
                                                            transform: 'scale(1.3)',
                                                            '&.Mui-checked': {
                                                                color: '#4caf50'
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                {/* No results message */}
                {searchQuery.trim() && !searchLoading && appointments.length === 0 && (
                    <Paper elevation={2} sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            No appointments found
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            No appointments scheduled for today matching "{searchQuery}"
                        </Typography>
                    </Paper>
                )}

                {/* Loading backdrop */}
                <Backdrop
                    sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                    open={loading}
                >
                    <CircularProgress color="inherit" />
                </Backdrop>
            </Container>
        </Box>
    );
};

export default CheckInPage;
