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
  Stack,
  TextField
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import MessageLogTable from '../components/MessageLogTable';

function AutoSMSSetUpPage() {
  const [frequency, setFrequency] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startDate, setStartDate] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [runNowStatus, setRunNowStatus] = useState('');
  const [monthlySMSTotal, setMonthlySMSTotal] = useState(0);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/settings/environment/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFrequency(res.data.auto_message_frequency || 'weekly');
        setDayOfWeek(res.data.auto_message_day_of_week || 1);
        
        // Handle start date from API response
        if (res.data.auto_message_start_date) {
          setStartDate(new Date(res.data.auto_message_start_date));
        } else {
          // Set default to next day if no date is set
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          setStartDate(tomorrow);
        }
      } catch (err) {
        setStatus('Failed to load settings.');
        console.error(err);
      }
      setLoading(false);    }
    fetchSettings();
  }, []);

  const fetchMonthlyTotal = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];
      
      const res = await axios.get(`http://127.0.0.1:8000/api/communicator/logs/?message_type=sms&created_at__gte=${startDate}&created_at__lte=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMonthlySMSTotal(res.data.length);
    } catch (err) {
      console.error('Failed to fetch monthly SMS total:', err);
    }
  };

  useEffect(() => {
    fetchMonthlyTotal();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      
      // Format date to YYYY-MM-DD
      const formattedDate = startDate.toISOString().split('T')[0];
      
      await axios.post(
        'http://127.0.0.1:8000/api/settings/environment/',
        {
          auto_message_frequency: frequency,
          auto_message_day_of_week: dayOfWeek,
          auto_message_start_date: formattedDate
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatus('Settings Saved!');
    } catch (e) {
      setStatus('Failed to save settings.');
      console.error(e);
    }
    setSaving(false);
  };  const handleRunNow = async () => {
    setRunNowStatus('Running...');
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        'http://127.0.0.1:8000/api/run-patient-sms-reminders-now/',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRunNowStatus('SMS messages are being sent!');
      // Recalculate monthly total after sending SMS
      setTimeout(() => {
        fetchMonthlyTotal();
      }, 2000); // Wait 2 seconds for SMS to be logged
    } catch (e) {
      setRunNowStatus('Failed to trigger SMS.');
      console.error('Error triggering reminders:', e);
    }
  };
  return (
    <Box sx={{ display: 'flex', gap: 3, height: '100%' }}>
      {/* Left Pane - SMS Settings */}
      <Box sx={{ 
        flex: '0 0 400px', 
        boxShadow: 2, 
        borderRadius: 2, 
        bgcolor: 'background.paper', 
        p: 3 
      }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Automatic Text Messaging Setup
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 300 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={(newDate) => setStartDate(newDate)}
            slotProps={{
              textField: { 
                fullWidth: true,
                size: "medium",
                helperText: "Select when to start sending automated SMS"
              }
            }}
            disablePast
            minDate={new Date()}
          />
        </LocalizationProvider>        <FormControl fullWidth>
          <InputLabel id="frequency-label">Frequency</InputLabel>
          <Select
            labelId="frequency-label"
            value={frequency}
            label="Frequency"
            onChange={(e) => setFrequency(e.target.value)}
          >
            <MenuItem value="daily">Daily</MenuItem>
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
            disabled={frequency === 'daily'}
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
        <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
          {saving ? <CircularProgress size={24} /> : 'Save Settings'}
        </Button>
        <Button variant="outlined" color="secondary" onClick={handleRunNow} disabled={loading}>
          Run Now
        </Button>
        {status && (
          <Alert severity={status === 'Settings Saved!' ? 'success' : 'error'}>{status}</Alert>
        )}        {runNowStatus && (
          <Alert severity={runNowStatus === 'SMS messages are being sent!' ? 'success' : 'info'}>{runNowStatus}</Alert>
        )}
        
        {/* Monthly Summary */}
        <Box sx={{ mt: 2, p: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
          <Typography variant="body2" color="text.secondary">
            Total SMS sent for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: <strong>{monthlySMSTotal}</strong>
          </Typography>
        </Box>
      </Stack>
    </Box>
    
    {/* Right Pane - SMS Logs */}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <MessageLogTable type="sms" />
    </Box>
  </Box>
  );
}

export default AutoSMSSetUpPage;
