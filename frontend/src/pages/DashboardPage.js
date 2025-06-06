// src/pages/DashboardPage.js (Material UI migration, fully feature-retained)
import { jwtDecode } from 'jwt-decode';
import Select from 'react-select';
import { useState, useEffect } from 'react';
import axios from 'axios';
import CalendarView from '../components/CalendarView';
import { toast } from 'react-toastify';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  IconButton,
  Tooltip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Divider,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import { useNavigate } from 'react-router-dom';

function toLocalDatetimeString(dateObj) {
  const local = new Date(dateObj);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16); // format: YYYY-MM-DDTHH:MM
}

function DashboardPage() {
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [formData, setFormData] = useState({
    title: 'New Clinic Visit',
    description: '',
    appointment_datetime: '',
    duration_minutes: 30,
    recurrence: 'none',
    provider: null,
  });
  const [showForm, setShowForm] = useState(true);

  // Message my Provider form state
  const [emailForm, setEmailForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    message: '',
    attachments: [],
  });
  const [providerName, setProviderName] = useState('');
  const [patientName, setPatientName] = useState('');

  const token = localStorage.getItem('access_token');
  const userRole = token ? jwtDecode(token).role : null;
  const navigate = useNavigate();
  const [tab, setTab] = useState('manage');

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data);
      } catch (error) {
        console.error('Failed to fetch doctors:', error);
      }
    };

    const fetchAppointments = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/appointments/', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setAppointments(response.data);
        if (response.data && response.data.length > 0) {
          const doctorId = response.data[0].doctor;
          const matchedDoctor = doctors.find(doc => doc.id === doctorId);
          setSelectedDoctor(matchedDoctor ? { value: matchedDoctor.id, label: `Dr. ${matchedDoctor.first_name} ${matchedDoctor.last_name}` } : null);
        }
      } catch (error) {
        console.error('Error fetching appointments:', error);
      }
    };

    if (doctors.length === 0) {
      fetchDoctors();
    } else {
      fetchAppointments();
    }
  }, [token, doctors.length, refreshFlag]);

  useEffect(() => {
    if (!token) return;
    const fetchUserAndProvider = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/me/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = res.data;
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        setPatientName(name);
        if (user.provider) {
          const provRes = await axios.get(`http://127.0.0.1:8000/api/users/${user.provider}/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const prov = provRes.data;
          const provName = `${prov.first_name || ''} ${prov.last_name || ''}`.trim();
          setProviderName(provName);
          setEmailForm(prev => ({ ...prev, to: prov.email || '' }));
          const template = `${new Date().toLocaleDateString()}\n\nDear ${provName},\n\n[Your message here]\n\nThank you,\n${name}`;
          setEmailForm(prev => ({ ...prev, message: template }));
        }
      } catch (err) {
        console.error('Failed to fetch user/provider info:', err);
      }
    };
    fetchUserAndProvider();
  }, [token]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const fetchAvailableSlots = async (doctorId) => {
    setAvailableSlots([]);
    if (!doctorId) return;

    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/doctors/${doctorId}/available-dates/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableSlots(res.data);
    } catch (error) {
      console.error("Failed to fetch available slots:", error);
    }
  };

  const handleEditClick = (appointment) => {
    const now = new Date();
    const appointmentDate = new Date(appointment.appointment_datetime);

    if (appointmentDate < now) {
      toast.error('Cannot edit past appointments.');
      return;
    }

    setFormData({
      title: appointment.title,
      description: appointment.description,
      appointment_datetime: toLocalDatetimeString(appointment.appointment_datetime),
      duration_minutes: appointment.duration_minutes,
      recurrence: appointment.recurrence || 'none',
    });

    const matched = doctors.find(doc => doc.id === appointment.provider);
    const selected = matched
      ? { value: matched.id, label: `Dr. ${matched.first_name} ${matched.last_name}` }
      : null;

    setSelectedDoctor(selected);
    fetchAvailableSlots(selected?.value);

    setEditingId(appointment.id);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this appointment?')) return;

    try {
      await axios.delete(`http://127.0.0.1:8000/api/appointments/${id}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Appointment deleted!');
      setAppointments(appointments.filter(a => a.id !== id));
    } catch (error) {
      console.error(error);
      toast.error('Delete failed.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      provider: selectedDoctor?.value || null,
    };

    try {
      if (editMode && editingId) {
        await axios.put(`http://127.0.0.1:8000/api/appointments/${editingId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment updated!');
      } else {
        await axios.post('http://127.0.0.1:8000/api/appointments/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Appointment created!');
      }

      const refreshed = await axios.get('http://127.0.0.1:8000/api/appointments/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAppointments(refreshed.data);

      setFormData({ title: '', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none' });
      setSelectedDoctor(null);
      setEditMode(false);
      setEditingId(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save appointment.');
    }
  };

  const handleEmailChange = (field) => (e) => {
    setEmailForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleAttachmentChange = (e) => {
    const files = Array.from(e.target.files || []);
    setEmailForm(prev => ({ ...prev, attachments: files }));
  };

  const handleSendMessage = async () => {
    try {
      const form = new FormData();
      form.append('email', emailForm.to);
      if (emailForm.cc) form.append('cc', emailForm.cc);
      if (emailForm.bcc) form.append('bcc', emailForm.bcc);
      form.append('subject', emailForm.subject);
      form.append('message', emailForm.message);
      emailForm.attachments.forEach(f => form.append('attachments', f));
      await axios.post('http://127.0.0.1:8000/api/messages/send-email/', form, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Message sent');
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  };

  // Only show future appointments
  const filteredAppointments = (appointments || [])
    .filter(a => {
      const apptDate = new Date(a.appointment_datetime);
      const now = new Date();
      return apptDate.setHours(0, 0, 0, 0) >= now.setHours(0, 0, 0, 0);
    })
    .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime));

  return (
    <Box sx={{ mt: 4, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0 }}>Dashboard</Typography>
      <Tabs value={tab} onChange={(_, val) => setTab(val)} aria-label="dashboard-tabs" sx={{ mb: 0 }}>
        <Tab value="manage" label="Manage Appointments" />
        <Tab value="message" label="Message my Provider" />
        <Tab value="calendar" label="Calendar" />
      </Tabs>
      <Divider sx={{ mb: 2 }} />
      {tab === 'manage' && (
        <Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
            <Box sx={{ flex: 1, minWidth: 350 }}>
              <form onSubmit={handleSubmit}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {editMode ? 'Edit Appointment' : 'Request an Appointment'}
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                  <TextField
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    multiline
                    rows={2}
                    fullWidth
                  />
                  <TextField
                    label="Date & Time"
                    name="appointment_datetime"
                    type="datetime-local"
                    value={formData.appointment_datetime}
                    onChange={handleChange}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    required
                  />
                  <TextField
                    label="Duration (minutes)"
                    name="duration_minutes"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={handleChange}
                    fullWidth
                    required
                  />
                  <FormControl fullWidth>
                    <InputLabel id="recurrence-label">Recurrence</InputLabel>
                    <MUISelect
                      labelId="recurrence-label"
                      name="recurrence"
                      value={formData.recurrence}
                      onChange={handleChange}
                      label="Recurrence"
                    >
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                    </MUISelect>
                  </FormControl>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Select Doctor</Typography>
                    <Select
                      options={doctors.map(doc => ({
                        value: doc.id,
                        label: `Dr. ${doc.first_name} ${doc.last_name}`
                      }))}
                      value={selectedDoctor}
                      onChange={selected => {
                        setSelectedDoctor(selected);
                        fetchAvailableSlots(selected?.value);
                      }}
                      placeholder="Search or select doctor..."
                      isClearable
                    />
                  </Box>
                  <Stack direction="row" spacing={2}>
                    <Button type="submit" variant="contained" color="primary" fullWidth>
                      {editMode ? 'Update Appointment' : 'Create Appointment'}
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      fullWidth
                      onClick={() => {
                        setFormData({
                          title: '',
                          description: '',
                          appointment_datetime: '',
                          duration_minutes: 30,
                          recurrence: 'none',
                          provider: null,
                        });
                        setSelectedDoctor(null);
                        setEditingId(null);
                        setEditMode(false);
                        setSelectedSlot(null);
                      }}
                    >
                      Clear Form
                    </Button>
                  </Stack>
                </Stack>
              </form>
              <Box sx={{ mt: 4 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Available Dates for {selectedDoctor?.label || 'Selected Doctor'}
                </Typography>
                <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', p: 1 }}>
                  {availableSlots.length > 0 ? (
                    availableSlots.map((slot, idx) => {
                      const formattedSlot = toLocalDatetimeString(slot);
                      return (
                        <Button
                          key={idx}
                          variant={selectedSlot === formattedSlot ? "contained" : "outlined"}
                          sx={{ m: 0.5 }}
                          size="small"
                          onClick={() => {
                            setSelectedSlot(formattedSlot);
                            setFormData((prev) => ({
                              ...prev,
                              appointment_datetime: formattedSlot,
                            }));
                          }}
                        >
                          {new Date(slot).toLocaleString()}
                        </Button>
                      );
                    })
                  ) : (
                    <Typography variant="body2" color="text.secondary">No available slots</Typography>
                  )}
                </Paper>
              </Box>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Your Appointments</Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 350 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Visit</TableCell>
                      <TableCell>Date & Time</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredAppointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.title || 'Untitled'}</TableCell>
                        <TableCell>{a.appointment_datetime ? new Date(a.appointment_datetime).toLocaleString() : 'Unknown'}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit appointment">
                            <IconButton size="small" color="warning" onClick={() => handleEditClick(a)} sx={{ mr: 1 }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete appointment">
                            <IconButton size="small" color="error" onClick={() => handleDelete(a.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Stack>
        </Box>
      )}
      {tab === 'message' && (
        <Box sx={{ maxWidth: 600 }}>
          <Stack spacing={2}>
            <TextField label="To" value={emailForm.to} onChange={handleEmailChange('to')} fullWidth />
            <TextField label="Cc" value={emailForm.cc} onChange={handleEmailChange('cc')} fullWidth />
            <TextField label="Bcc" value={emailForm.bcc} onChange={handleEmailChange('bcc')} fullWidth />
            <TextField label="Subject" value={emailForm.subject} onChange={handleEmailChange('subject')} fullWidth />
            <TextField
              label="Message"
              multiline
              rows={8}
              value={emailForm.message}
              onChange={handleEmailChange('message')}
              fullWidth
            />
            <div>
              <Button variant="outlined" component="label">
                Attach Files
                <input type="file" multiple hidden onChange={handleAttachmentChange} />
              </Button>
              {emailForm.attachments.map((f, idx) => (
                <Typography key={idx} variant="caption" sx={{ ml: 1, display: 'block' }}>{f.name}</Typography>
              ))}
            </div>
            <Button variant="contained" onClick={handleSendMessage}>Send Message</Button>
          </Stack>
        </Box>
      )}
      {tab === 'calendar' && (
        <Box sx={{ mt: 2 }}>
          <CalendarView onUpdate={() => setRefreshFlag(prev => !prev)} />
        </Box>
      )}
    </Box>
  );
}

export default DashboardPage;
