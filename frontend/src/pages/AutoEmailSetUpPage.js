import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Stack
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

function AutoEmailSetUpPage() {
  const [frequency, setFrequency] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startDate, setStartDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/auto-email/1/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFrequency(res.data.auto_message_frequency || 'weekly');
        setDayOfWeek(res.data.auto_message_day_of_week || 1);
        setStartDate(res.data.auto_message_start_date ? new Date(res.data.auto_message_start_date) : null);
      } catch (err) {
        setStatus('Failed to load settings.');
        console.error(err);
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        'http://127.0.0.1:8000/api/auto-email/1/',
        {
          auto_message_frequency: frequency,
          auto_message_day_of_week: dayOfWeek,
          auto_message_start_date: startDate ? startDate.toISOString().split('T')[0] : null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatus('Settings Saved!');
    } catch (e) {
      setStatus('Failed to save settings.');
      console.error(e);
    }
    setSaving(false);
  };

  const handleRunNow = async () => {
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await axios.post('http://127.0.0.1:8000/api/run-patient-reminders-now/', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatus('Auto message triggered!');
    } catch (e) {
      setStatus('Failed to run auto message.');
      console.error(e);
    }
  };

  return (
    <Box sx={{ boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Auto Message Frequency
      </Typography>
      <Stack spacing={2} sx={{ maxWidth: 300 }}>
        <FormControl fullWidth>
          <InputLabel id="frequency-label">Frequency</InputLabel>
          <Select
            labelId="frequency-label"
            value={frequency}
            label="Frequency"
            onChange={(e) => setFrequency(e.target.value)}
          >
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="bi-weekly">Bi-weekly</MenuItem>
            <MenuItem value="monthly">Monthly</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel id="day-label">Day of Week</InputLabel>
          <Select
            labelId="day-label"
            value={dayOfWeek}
            label="Day of Week"
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            <MenuItem value={1}>Monday</MenuItem>
            <MenuItem value={2}>Tuesday</MenuItem>
            <MenuItem value={3}>Wednesday</MenuItem>
            <MenuItem value={4}>Thursday</MenuItem>
            <MenuItem value={5}>Friday</MenuItem>
            <MenuItem value={6}>Saturday</MenuItem>
            <MenuItem value={0}>Sunday</MenuItem>
          </Select>
        </FormControl>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
            renderInput={(params) => <FormControl fullWidth>{params.input}</FormControl>}
          />
        </LocalizationProvider>
        <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
          {saving ? <CircularProgress size={24} /> : 'Save Settings'}
        </Button>
        <Button variant="outlined" color="secondary" onClick={handleRunNow} disabled={loading}>
          Run Now
        </Button>
        {status && (
          <Alert severity={status === 'Settings Saved!' || status === 'Auto message triggered!' ? 'success' : 'error'}>{status}</Alert>
        )}
      </Stack>
    </Box>
  );
}

export default AutoEmailSetUpPage;
