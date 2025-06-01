import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container, TextField, Button, Box, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Typography
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';
import Pagination from '@mui/material/Pagination';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import TodayIcon from '@mui/icons-material/Today';

function AppointmentsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [todaysAppointments, setTodaysAppointments] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const token = localStorage.getItem('access_token');
  const navigate = useNavigate();
  const rowsPerPage = 10;
  // Role check and redirect logic
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'doctor' && role !== 'registrar' && role !== 'admin' && role !== 'system_admin') {
        navigate('/');
      }
      // Set admin status - allow registrars, admin and system_admin to see the admin button
      setIsAdmin(role === 'admin' || role === 'system_admin' || role === 'registrar');
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  // Fetch all appointments and filter client-side
  const fetchAppointments = async (searchText = '') => {
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lowerQuery = searchText.trim().toLowerCase();

      // No filter needed if search is empty
      if (!lowerQuery) {
        setResults(res.data);
        return;
      }

      // Enhanced filtering logic to search all columns
      const filtered = res.data.filter((appt) => {
        // Basic fields
        const patientName = appt.patient_name || (appt.patient ? `${appt.patient.first_name} ${appt.patient.last_name}` : '');
        const providerName = appt.provider_name || (appt.provider ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim() : '');

        // Date & time - multiple formats for better matching
        let dateTimeFormats = [];
        if (appt.appointment_datetime) {
          const dateObj = new Date(appt.appointment_datetime);
          // Full date/time
          dateTimeFormats.push(dateObj.toLocaleString());
          // Just date
          dateTimeFormats.push(dateObj.toLocaleDateString());
          // Just time
          dateTimeFormats.push(dateObj.toLocaleTimeString());
          // Simple formats
          dateTimeFormats.push(dateObj.toISOString().slice(0, 10)); // YYYY-MM-DD
          dateTimeFormats.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`); // MM/DD
        }
        const dateTimeStr = dateTimeFormats.join(' ');

        // Other fields
        const description = appt.description || '';
        const duration = appt.duration_minutes ? appt.duration_minutes.toString() : '';
        const status = appt.status || '';
        const clinic = appt.title || '';
        const id = appt.id ? appt.id.toString() : '';

        // Combine all searchable fields
        const combined = `
          ${patientName} 
          ${providerName} 
          ${dateTimeStr} 
          ${description} 
          ${duration} 
          ${status}
          ${clinic}
          ${id}
        `.toLowerCase();

        return combined.includes(lowerQuery);
      });

      console.log(`Search for "${lowerQuery}" found ${filtered.length} results out of ${res.data.length}`);
      setResults(filtered);
    } catch (err) {
      console.error('Fetch failed', err);
      setResults([]);
    }
  };

  // Fetch today's appointments
  useEffect(() => {
    const fetchTodaysAppointments = async () => {
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Get today's date at midnight (start of the day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get tomorrow's date at midnight (start of the next day)
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        console.log("Today's date (midnight):", today.toISOString());
        console.log("Tomorrow's date (midnight):", tomorrow.toISOString());

        // Filter appointments between today midnight and tomorrow midnight
        const filtered = res.data.filter((appt) => {
          if (!appt.appointment_datetime) return false;

          const apptDate = new Date(appt.appointment_datetime);
          const isToday = apptDate >= today && apptDate < tomorrow;

          // Debug logging for each appointment
          if (apptDate.toDateString() === today.toDateString()) {
            console.log(`Appointment: ${appt.id}, Date: ${apptDate.toISOString()}, Included: ${isToday}`);
          }

          return isToday;
        });

        console.log(`Found ${filtered.length} appointments for today out of ${res.data.length} total`);
        setTodaysAppointments(filtered);
      } catch (err) {
        console.error('Fetch today\'s appointments failed', err);
        setTodaysAppointments([]);
      }
    };
    fetchTodaysAppointments();
  }, [token]);

  // On mount, fetch all appointments (auto-refresh table)
  useEffect(() => {
    fetchAppointments(query);
    // eslint-disable-next-line
  }, []);

  // Search handler
  const handleSearch = async (e) => {
    e.preventDefault();
    fetchAppointments(query);
  };

  // Sort results by appointment_datetime descending (latest first)
  const sortedResults = [...results].sort((a, b) => {
    const dateA = new Date(a.appointment_datetime);
    const dateB = new Date(b.appointment_datetime);
    return dateB - dateA;
  });
  const paginatedResults = sortedResults.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Define a specific handler for back button navigation
  const handleBackNavigation = (e) => {
    if (e) e.preventDefault(); // Protect if e is undefined
    navigate(-1);
  };

  // Helper: get user first name from token
  const getUserFirstName = () => {
    try {
      if (!token) return '';
      const decoded = jwtDecode(token);
      return decoded.first_name || decoded.username || '';
    } catch {
      return '';
    }
  };

  // Helper: get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Compute summary for today's appointments
  const totalToday = todaysAppointments.length;
  const doctorPatientMap = {};
  todaysAppointments.forEach(appt => {
    let doctor = appt.provider_name || (appt.provider ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim() : 'Unknown');
    if (!doctorPatientMap[doctor]) doctorPatientMap[doctor] = 0;
    doctorPatientMap[doctor] += 1;
  });
  const userName = getUserFirstName();
  const greeting = getGreeting();


  return (
    <Container maxWidth="lg" sx={{ mt: 5, ml: 0, mr: 'auto', pl: 0, pr: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
        {/*{isAdmin && (
          <BackButton onClick={handleBackNavigation} />
        )}*/}
      </Box>
      <Grid container spacing={3} alignItems="stretch" justifyContent="flex-start" sx={{ mb: 4 }}>
        {/* Left Panel: Today's Appointments */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TodayIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h5" fontWeight={600}>Today's Appointments</Typography>
            </Box>
            <TableContainer sx={{ maxHeight: '300px', overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>                  {todaysAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                        No appointments today.
                      </TableCell>
                    </TableRow>
                  ) : (
                    todaysAppointments
                      .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime))
                      .map((appt) => (
                        <TableRow
                          key={appt.id}
                          hover
                          onClick={() => {
                            setSelectedAppointment(appt);
                            setDetailsOpen(true);
                          }}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': {
                              backgroundColor: '#f0f7ff',
                            }
                          }}
                        >
                          <TableCell>{appt.appointment_datetime ? new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                          <TableCell>{appt.patient_name || (appt.patient && `${appt.patient.first_name} ${appt.patient.last_name}`) || '-'}</TableCell>
                          <TableCell>{appt.provider_name || (appt.provider && (appt.provider.first_name || appt.provider.last_name)
                            ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                            : '-')
                          }</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
        {/* Right Panel: Summary */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TodayIcon color="secondary" sx={{ mr: 1 }} />
              <Typography variant="h5" fontWeight={600}>Summary</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', overflow: 'auto' }}>
              <Typography variant="h5" fontWeight={700} color="primary.main" gutterBottom>
                {greeting}{userName ? `, ${userName}` : ''}! 🌞
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                Wishing you a wonderful day at POWER Scheduling!
              </Typography>
              <Typography variant="h6" fontWeight={600} sx={{ mt: 1 }}>
                Total Appointments Today: {totalToday}
              </Typography>
              <Box sx={{ mt: 2, width: '100%' }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                  Patients per Doctor:
                </Typography>
                {Object.keys(doctorPatientMap).length === 0 ? (
                  <Typography color="text.secondary">No appointments scheduled for today.</Typography>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {Object.entries(doctorPatientMap).map(([doctor, count]) => (
                      <li key={doctor}>
                        <Typography variant="body2" color="text.primary">
                          {doctor}: {count} patient{count > 1 ? 's' : ''}
                        </Typography>
                      </li>
                    ))}
                  </ul>
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
      {/* Bottom row with main content */}
      <Grid container>
        {/* Main Content: All Appointments */}
        <Grid item xs={12}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Appointments
          </Typography>
          <Box
            component="form"
            onSubmit={handleSearch}
            sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}
          >
            <TextField
              type="text"
              label="Search by patient, provider, date or description"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fullWidth
              size="small"
            />
            <Button variant="contained" color="primary" type="submit">
              Search
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 2 }}>
            <Table size="small" sx={{ '& tbody tr:nth-of-type(odd)': { backgroundColor: '#f7fafc' } }}>
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
                {paginatedResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No appointments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedResults.map((appt) => (
                    <TableRow key={appt.id} hover>
                      <TableCell>{appt.title || '-'}</TableCell>
                      <TableCell>{appt.patient_name || (appt.patient && `${appt.patient.first_name} ${appt.patient.last_name}`) || '-'}</TableCell>
                      <TableCell>{appt.provider_name || (appt.provider && (appt.provider.first_name || appt.provider.last_name)
                        ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                        : '-')
                      }</TableCell>
                      <TableCell>{appt.appointment_datetime ? new Date(appt.appointment_datetime).toLocaleString() : '-'}</TableCell>
                      <TableCell>{appt.description || '-'}</TableCell>
                      <TableCell>{appt.duration_minutes || '-'}</TableCell>
                      <TableCell>{appt.status || '-'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              setSelectedAppointment(appt);
                              setDetailsOpen(true);
                            }}
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm('Are you sure you want to delete this appointment?')) {
                                try {
                                  await axios.delete(`http://127.0.0.1:8000/api/appointments/${appt.id}/`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  fetchAppointments(query);

                                  // Also refresh today's appointments
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const tomorrow = new Date(today);
                                  tomorrow.setDate(tomorrow.getDate() + 1);

                                  const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });

                                  const filtered = res.data.filter((appointment) => {
                                    if (!appointment.appointment_datetime) return false;
                                    const apptDate = new Date(appointment.appointment_datetime);
                                    return apptDate >= today && apptDate < tomorrow;
                                  });

                                  setTodaysAppointments(filtered);
                                } catch (err) {
                                  alert('Failed to delete appointment.');
                                  console.error('Delete failed', err);
                                }
                              }
                            }}
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
          {results.length > rowsPerPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={Math.ceil(results.length / rowsPerPage)}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}

          {/* Appointment Details Dialog */}
          <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogContent dividers>
              {selectedAppointment && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography><b>Patient:</b> {selectedAppointment.patient_name || (selectedAppointment.patient ? `${selectedAppointment.patient.first_name} ${selectedAppointment.patient.last_name}` : '-')}</Typography>
                  <Typography><b>Provider:</b> {selectedAppointment.provider_name || (selectedAppointment.provider ? `Dr. ${selectedAppointment.provider.first_name || ''} ${selectedAppointment.provider.last_name || ''}`.trim() : '-')}</Typography>
                  <Typography><b>Date & Time:</b> {selectedAppointment.appointment_datetime ? new Date(selectedAppointment.appointment_datetime).toLocaleString() : '-'}</Typography>
                  <Typography><b>Description:</b> {selectedAppointment.description || '-'}</Typography>
                  <Typography><b>Duration (min):</b> {selectedAppointment.duration_minutes || '-'}</Typography>
                  <Typography><b>Status:</b> {selectedAppointment.status || '-'}</Typography>
                  <Typography><b>Clinic Event:</b> {selectedAppointment.title || '-'}</Typography>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)} color="primary">Close</Button>
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
        </Grid>
      </Grid>
    </Container>
  );
}

export default AppointmentsPage;
