import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select as MUISelect, MenuItem, Checkbox, FormControlLabel, CircularProgress, Alert, Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
// MUI X Date Picker imports:
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

function MaintenancePage() {
  const [editingId, setEditingId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [formData, setFormData] = useState({
    start_time: getTodayAt(8),
    end_time: getTodayAt(17),
    is_blocked: false,
    recurrence: 'none',
    recurrence_end_date: '',
  });
  const navigate = useNavigate();
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin') {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate, token]);
  
  function getTodayAt(hour, minute = 0) {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(res.data);
      } catch (err) {
        console.error('Failed to load doctors:', err);
        toast.error('Error loading doctors.');
      }
    };
    fetchDoctors();
  }, [token]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/holidays/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setHolidays(res.data.filter(h => h.is_recognized));
      } catch (err) {
        console.error('Failed to fetch holidays:', err);
      }
    };
    fetchHolidays();
  }, [token]);

  useEffect(() => {
    if (selectedDoctor) {
      fetchSchedules();
    }
  }, [selectedDoctor]);
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  function isHoliday(dateStr) {
    const date = new Date(dateStr);
    return holidays.some(h => {
      const hDate = new Date(h.date + 'T00:00:00');
      return (
        hDate.getFullYear() === date.getFullYear() &&
        hDate.getMonth() === date.getMonth() &&
        hDate.getDate() === date.getDate()
      );
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!selectedDoctor) {
      toast.warning('Please select a clinician.');
      return;
    }
  
    if (!formData.start_time || !formData.end_time) {
      toast.warning('Please enter both start and end time.');
      return;
    }

    const startDate = new Date(formData.start_time);
    if (startDate.getDay() === 0 || startDate.getDay() === 6) {
      toast.error('Cannot create availability on a Saturday or Sunday!');
      return;
    }

    if (isHoliday(formData.start_time)) {
      toast.error('Cannot create availability on a holiday!');
      return;
    }
  
    const payload = {
      doctor: selectedDoctor.value,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      is_blocked: formData.is_blocked,
      recurrence: formData.recurrence,
      recurrence_end_date: formData.recurrence_end_date || null,
    };
  
    try {
      if (editingId) {
        await axios.put(`http://127.0.0.1:8000/api/availability/${editingId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Schedule updated!');
      } else {
        await axios.post('http://127.0.0.1:8000/api/availability/', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Schedule saved!');
      }
  
      setFormData({
        start_time: '',
        end_time: '',
        is_blocked: false,
        recurrence: 'none',
        recurrence_end_date: '',
      });
      setEditingId(null);
      await fetchSchedules();
  
    } catch (err) {
      console.error(err);
      toast.error('Failed to save schedule.');
    }
  };
  
  const fetchSchedules = async () => {
    if (!selectedDoctor) return;
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/availability/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const doctorId = String(selectedDoctor.value);
      const doctorSchedules = res.data.filter(s => String(s.doctor) === doctorId);
      setSchedules(doctorSchedules);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      toast.error('Failed to load schedules.');
    }
  };

  const toLocalDatetimeInputValue = (isoString) => {
    const local = new Date(isoString);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  };
  
  const handleEdit = (schedule) => {
    setEditingId(schedule.id);
    setFormData({
      start_time: toLocalDatetimeInputValue(schedule.start_time),
      end_time: toLocalDatetimeInputValue(schedule.end_time),
      is_blocked: schedule.is_blocked,
      recurrence: schedule.recurrence || 'none',
      recurrence_end_date: schedule.recurrence_end_date ? schedule.recurrence_end_date.slice(0, 10) : '',
    });
    const matched = doctors.find(doc => doc.id === schedule.doctor);
    setSelectedDoctor(
      matched
        ? { value: matched.id, label: `Dr. ${matched.first_name} ${matched.last_name}` }
        : null
    );
  };

  const handleDelete = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await axios.delete(`http://127.0.0.1:8000/api/availability/${scheduleId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Schedule deleted.');
      await fetchSchedules();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete schedule.');
    }
  };

  const handleCancel = () => {
    setFormData({
      start_time: '',
      end_time: '',
      is_blocked: false,
      recurrence: 'none',
      recurrence_end_date: '',
    });
    setEditingId(null);
    toast.info('Edit canceled.');
  };

  return (
    <Box sx={{ mt: 4, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>

        <Typography variant="h5">Maintenance</Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {/* LEFT SIDE: Schedule form */}
        <Paper elevation={3} sx={{ p: 3, flex: 1 }}>
          <Typography variant="h6" gutterBottom>Clinician Schedule Maintenance 🛠️</Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Select Clinician</InputLabel>
                <MUISelect
                  value={selectedDoctor?.value || ''}
                  onChange={(e) => {
                    const doctorId = e.target.value;
                    const doctor = doctors.find(doc => doc.id === doctorId);
                    setSelectedDoctor(doctor ? { value: doctor.id, label: `Dr. ${doctor.first_name} ${doctor.last_name}` } : null);
                  }}
                  label="Select Clinician"
                >
                  {doctors.map(doc => (
                    <MenuItem key={doc.id} value={doc.id}>
                      {`Dr. ${doc.first_name} ${doc.last_name}`}
                    </MenuItem>
                  ))}
                </MUISelect>
              </FormControl>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Start Time"
                  type="datetime-local"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleChange}
                  fullWidth
                />
                <TextField
                  label="End Time"
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  fullWidth
                />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Recurrence</InputLabel>
                  <MUISelect
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                    label="Recurrence"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </MUISelect>
                </FormControl>

                {/* --- Improved Date Picker for Recurrence End Date --- */}
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Recurrence End Date"
                    value={formData.recurrence_end_date ? new Date(formData.recurrence_end_date) : null}
                    onChange={date =>
                      setFormData({
                        ...formData,
                        recurrence_end_date: date ? date.toISOString().slice(0, 10) : ''
                      })
                    }
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small'
                      }
                    }}
                  />
                </LocalizationProvider>
              </Stack>

              <FormControlLabel
                control={
                  <Checkbox
                    id="blockSchedule"
                    checked={formData.is_blocked || false}
                    onChange={(e) => setFormData({ ...formData, is_blocked: e.target.checked })}
                  />
                }
                label="Block this schedule"
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button type="submit" variant="contained" color="primary" fullWidth>
                  {editingId ? 'Update Schedule' : 'Save Schedule'}
                </Button>

                {editingId && (
                  <Button variant="outlined" color="secondary" onClick={handleCancel} fullWidth>
                    Cancel
                  </Button>
                )}
              </Stack>
            </Stack>
          </form>
        </Paper>

        {/* RIGHT SIDE: Schedule list */}
        <Paper elevation={3} sx={{ p: 3, flex: 1 }}>
          <Typography variant="h6" gutterBottom>📋 Schedule Overview</Typography>
          <Typography variant="subtitle1" gutterBottom>
            {selectedDoctor ? (
              <span style={{ color: '#1976d2' }}>Showing schedules for <strong>{selectedDoctor.label}</strong></span>
            ) : (
              <span style={{ color: '#888' }}>No clinician selected</span>
            )}
          </Typography>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="success.main" gutterBottom>✅ Availability</Typography>
          <TableContainer component={Box} sx={{ maxHeight: 260, mb: 2, borderRadius: 2, boxShadow: 1, bgcolor: '#fafbfc' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                  <TableCell>Date/Time</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {schedules.filter(s => !s.is_blocked).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No available schedules.
                    </TableCell>
                  </TableRow>
                ) : (
                  schedules.filter(s => !s.is_blocked).map(s => (
                    <TableRow key={s.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f5f6fa' } }}>
                      <TableCell>
                        {new Date(s.start_time).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/New_York',
                        })} — {new Date(s.end_time).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/New_York',
                        })}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          color="primary"
                          sx={{ mr: 1, minWidth: 36 }}
                          onClick={() => handleEdit(s)}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          sx={{ minWidth: 36 }}
                          onClick={() => handleDelete(s.id)}
                        >
                          🗑️
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle2" color="error.main" gutterBottom>🚫 Blocked</Typography>
          <TableContainer component={Box} sx={{ maxHeight: 260, borderRadius: 2, boxShadow: 1, bgcolor: '#fafbfc' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: '#ffebee' }}>
                  <TableCell>Date/Time</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {schedules.filter(s => s.is_blocked).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No blocked schedules.
                    </TableCell>
                  </TableRow>
                ) : (
                  schedules.filter(s => s.is_blocked).map(s => (
                    <TableRow key={s.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f5f6fa' } }}>
                      <TableCell>
                        {new Date(s.start_time).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/New_York',
                        })} — {new Date(s.end_time).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/New_York',
                        })}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          color="primary"
                          sx={{ mr: 1, minWidth: 36 }}
                          onClick={() => handleEdit(s)}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          sx={{ minWidth: 36 }}
                          onClick={() => handleDelete(s.id)}
                        >
                          🗑️
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </Box>
  );
}

export default MaintenancePage;
