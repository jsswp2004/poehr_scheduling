import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Box, Stack, Typography, Button, TextField, FormControl, InputLabel,
  Select as MUISelect, MenuItem, Checkbox, FormControlLabel, Grid, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Container
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';

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
  const isFetchingRef = useRef(false);

  function getTodayAt(hour, minute = 0) {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  // Unique by doctor, start_time, end_time, is_blocked (dedupes recurrences)
  const uniqueByTime = (arr) => {
    const seen = new Set();
    return arr.filter(item => {
      const key = `${item.doctor}_${item.start_time}_${item.end_time}_${item.is_blocked}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(res.data);
      } catch (err) {
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
      } catch {}
    };
    fetchHolidays();
  }, [token]);

  useEffect(() => {
    if (selectedDoctor) fetchSchedules();
  }, [selectedDoctor]);

  const fetchSchedules = async () => {
    if (!selectedDoctor || isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      const res = await axios.get('http://127.0.0.1:8000/api/availability/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const doctorSchedules = res.data.filter(
        s => String(s.doctor) === String(selectedDoctor.value)
      );
      setSchedules(uniqueByTime(doctorSchedules));
    } catch {
      toast.error('Failed to load schedules.');
    } finally {
      isFetchingRef.current = false;
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const isHoliday = (dateStr) => {
    const date = new Date(dateStr);
    return holidays.some(h => new Date(h.date).toDateString() === date.toDateString());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDoctor || !formData.start_time || !formData.end_time) return;
    const startDate = new Date(formData.start_time);
    if ([0, 6].includes(startDate.getDay()) || isHoliday(formData.start_time)) return;

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
        await axios.put(`http://127.0.0.1:8000/api/availability/${editingId}/`, payload, { headers: { Authorization: `Bearer ${token}` } });
        toast.success('Schedule updated!');
      } else {
        await axios.post('http://127.0.0.1:8000/api/availability/', payload, { headers: { Authorization: `Bearer ${token}` } });
        toast.success('Schedule saved!');
      }
      setFormData({ start_time: '', end_time: '', is_blocked: false, recurrence: 'none', recurrence_end_date: '' });
      setEditingId(null);
      await fetchSchedules();
    } catch {
      toast.error('Failed to save schedule.');
    }
  };

  const handleEdit = (schedule) => {
    setEditingId(schedule.id);
    setFormData({
      start_time: toLocalDatetimeInputValue(schedule.start_time),
      end_time: toLocalDatetimeInputValue(schedule.end_time),
      is_blocked: schedule.is_blocked,
      recurrence: schedule.recurrence || 'none',
      recurrence_end_date: schedule.recurrence_end_date || '',
    });
    const doc = doctors.find(doc => doc.id === schedule.doctor);
    setSelectedDoctor(doc ? { value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` } : null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await axios.delete(`http://127.0.0.1:8000/api/availability/${id}/`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Deleted.');
      await fetchSchedules();
    } catch {
      toast.error('Failed to delete schedule.');
    }
  };

  const handleCancel = () => {
    setFormData({ start_time: '', end_time: '', is_blocked: false, recurrence: 'none', recurrence_end_date: '' });
    setEditingId(null);
  };

  const toLocalDatetimeInputValue = (isoString) => {
    const local = new Date(isoString);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  };

  return (
    <Container maxWidth={false} disableGutters sx={{ py: 4, px: 0, textAlign: 'left' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" gutterBottom sx={{ textAlign: 'left', m: 0 }}>
          Clinician Schedule Maintenance 🛠️
        </Typography>
      </Box>
      <Grid container spacing={4} justifyContent="flex-start" alignItems="flex-start" sx={{ ml: 0 }}>
        {/* LEFT: Schedule Maintenance Form */}
        <Grid item xs={12} md={6} lg={6} xl={6} sx={{ pl: 0 }}>
          <Box sx={{ p: 3, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', minHeight: 500, maxHeight: 700, minWidth: 400, width: '100%', textAlign: 'left' }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={2} sx={{ textAlign: 'left' }}>
                <FormControl fullWidth>
                  <InputLabel>Select Clinician</InputLabel>
                  <MUISelect
                    value={selectedDoctor?.value || ''}
                    label="Select Clinician"
                    onChange={(e) => {
                      const doc = doctors.find(d => d.id === e.target.value);
                      setSelectedDoctor(doc ? { value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` } : null);
                    }}
                  >
                    {doctors.map(doc => (
                      <MenuItem key={doc.id} value={doc.id}>{`Dr. ${doc.first_name} ${doc.last_name}`}</MenuItem>
                    ))}
                  </MUISelect>
                </FormControl>                <TextField 
                  fullWidth 
                  label="Start Time" 
                  type="datetime-local" 
                  name="start_time" 
                  value={formData.start_time} 
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                />
                <TextField 
                  fullWidth 
                  label="End Time" 
                  type="datetime-local" 
                  name="end_time" 
                  value={formData.end_time} 
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                />

                <FormControl fullWidth>
                  <InputLabel>Recurrence</InputLabel>
                  <MUISelect value={formData.recurrence} onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}>
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </MUISelect>
                </FormControl>

                <TextField 
                  fullWidth 
                  type="date" 
                  label="Recurrence End Date" 
                  value={formData.recurrence_end_date || ''} 
                  onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                />

                <FormControlLabel control={<Checkbox checked={formData.is_blocked} onChange={(e) => setFormData({ ...formData, is_blocked: e.target.checked })} />} label="Block this schedule" />

                <Button type="submit" variant="contained" fullWidth>{editingId ? 'Update' : 'Save'}</Button>
                {editingId && <Button variant="outlined" onClick={handleCancel} fullWidth>Cancel</Button>}
              </Stack>
            </form>
          </Box>
        </Grid>
        {/* RIGHT: Schedule Overview */}
        <Grid item xs={12} md={6} lg={6} xl={6}>
          <Box sx={{ p: 3, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', minHeight: 500, maxHeight: 700, minWidth: 400, width: '100%' }}>
            <Typography variant="h6" gutterBottom>📋 Schedule Overview</Typography>
            <Typography color="success.main">✅ Availability</Typography>
            <TableContainer component={Paper} sx={{ mb: 2, maxHeight: 200, overflowY: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>Date/Time</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                <TableBody>
                  {schedules.filter(s => !s.is_blocked).map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{`${new Date(s.start_time).toLocaleString()} — ${new Date(s.end_time).toLocaleString()}`}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => handleEdit(s)}>✏️</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => handleDelete(s.id)}>🗑️</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer >
            <Typography color="error.main">🚫 Blocked</Typography>
            <TableContainer component={Paper} sx={{ mb: 2, maxHeight: 200, overflowY: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Date/Time</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                <TableBody>
                  {schedules.filter(s => s.is_blocked).map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{`${new Date(s.start_time).toLocaleString()} — ${new Date(s.end_time).toLocaleString()}`}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => handleEdit(s)}>✏️</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => handleDelete(s.id)}>🗑️</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
}

export default MaintenancePage;
