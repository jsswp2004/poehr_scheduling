import { useState, useEffect } from 'react';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, FormControl, InputLabel, Select as MUISelect, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Tabs, Tab, CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import HolidaysTab from './HolidaysPage';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const HOLIDAYS = [
  { name: 'New Year\'s Day', date: '2024-01-01' },
  { name: 'Martin Luther King, Jr. Day', date: '2024-01-15' },
  { name: 'Washington’s Birthday', date: '2024-02-19' },
  { name: 'Memorial Day', date: '2024-05-27' },
  { name: 'Juneteenth National Independence Day', date: '2024-06-19' },
  { name: 'Independence Day', date: '2024-07-04' },
  { name: 'Labor Day', date: '2024-09-02' },
  { name: 'Columbus Day', date: '2024-10-14' },
  { name: 'Veterans Day', date: '2024-11-11' },
  { name: 'Thanksgiving Day', date: '2024-11-28' },
  { name: 'Christmas Day', date: '2024-12-25' }
];

function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const token = localStorage.getItem('access_token');

  const handleDownload = async () => {
    const token = localStorage.getItem('access_token');
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/upload/clinic-events/template/', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'clinic_events_template.csv');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Download failed.');
    }
  };


  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('❌ Please select a file to upload.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://127.0.0.1:8000/api/upload/clinic-events/', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus('✅ Upload successful.');
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Upload failed.');
    }
  };

  return (
    <>
      <Table size="small" stickyHeader sx={{ bgcolor: '#f5faff', borderRadius: 2, boxShadow: 1, mt: 3 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: '#e3f2fd' }}>
            <TableCell sx={{ fontWeight: 'bold', width: 200, fontSize: '1rem' }}>Items</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 300, fontSize: '1rem', textAlign: 'left' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
            <TableCell>Clinic Events</TableCell>
            <TableCell>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-start" flexWrap="wrap">
                <Button variant="outlined" onClick={handleDownload}>
                  Download Template
                </Button>
                <TextField
                  type="file"
                  inputProps={{ accept: '.csv' }}
                  onChange={(e) => setFile(e.target.files[0])}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <Button variant="contained" onClick={handleUpload}>
                  Upload CSV
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {uploadStatus && (
        <Alert severity={uploadStatus.startsWith('✅') ? 'success' : 'error'} sx={{ mt: 3 }}>
          {uploadStatus}
        </Alert>
      )}
    </>
  );
}

function EnvironmentProfilePage() {
  const [blockedDays, setBlockedDays] = useState([0, 6]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedHolidays, setSelectedHolidays] = useState([]);
  const [tabKey, setTabKey] = useState('blocked-days');
  const navigate = useNavigate();

  useEffect(() => {
    // Role-based access control for admin and system_admin only
    const token = localStorage.getItem('access_token');
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
  }, [navigate]);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('http://127.0.0.1:8000/api/settings/environment/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBlockedDays(res.data.blocked_days || []);
      } catch (err) {
        setStatus('Failed to load settings.');
        console.error(err);
      }
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const handleCheckbox = (dayValue) => {
    setBlockedDays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((d) => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        'http://127.0.0.1:8000/api/settings/environment/',
        { blocked_days: blockedDays },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatus('Saved!');
    } catch (e) {
      setStatus('Failed to save.');
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <Box sx={{ mt: 4, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Environment Profile</Typography>
      <Tabs
        value={tabKey}
        onChange={(e, newValue) => setTabKey(newValue)}
        sx={{
          mb: 3,
          borderRadius: 2,
          bgcolor: '#f5faff',
          boxShadow: 1,
          minHeight: 48,
          '& .MuiTabs-indicator': {
            height: 4,
            borderRadius: 2,
            bgcolor: 'primary.main',
          },
          '& .MuiTab-root': {
            fontWeight: 700,
            fontSize: '1rem',
            color: 'primary.main',
            minHeight: 48,
            textTransform: 'none',
            borderRadius: 2,
            mx: 0.5,
            transition: 'background 0.2s',
            '&.Mui-selected': {
              bgcolor: 'primary.light',
              color: 'primary.dark',
              boxShadow: 2,
            },
            '&:hover': {
              bgcolor: 'primary.lighter',
              color: 'primary.dark',
            },
          },
        }}
      >
        <Tab label="Default Blocked Days" value="blocked-days" />
        <Tab label="Holidays" value="holidays" />
        <Tab label="Uploads" value="uploads" />
      </Tabs>

      {tabKey === 'blocked-days' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}><b>Default Blocked Days</b></Typography>
          <Table size="small" stickyHeader sx={{ bgcolor: '#f5faff', borderRadius: 2, boxShadow: 1 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                <TableCell sx={{ fontWeight: 'bold', width: 180, fontSize: '1rem' }}>Setting</TableCell>
                {DAYS.map((d) => (
                  <TableCell key={d.value} sx={{ fontWeight: 'bold', width: 80, textAlign: 'center', fontSize: '1rem' }}>{d.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                <TableCell className="text-start"><b>Default Blocked Days</b></TableCell>
                {DAYS.map((d) => (
                  <TableCell key={d.value} sx={{ textAlign: 'center' }}>
                    <Checkbox
                      checked={blockedDays.includes(d.value)}
                      onChange={() => handleCheckbox(d.value)}
                      disabled={loading || saving}
                    />
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
            <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
              {saving ? <CircularProgress size={24} /> : 'Save Settings'}
            </Button>
            {status && (
              <Alert severity={status === 'Saved!' ? 'success' : 'error'} sx={{ flex: 1 }}>
                {status}
              </Alert>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Select which days are <b>blocked by default</b> for clinic scheduling. Unchecked days are available for appointments.
          </Typography>
        </Paper>
      )}

      {tabKey === 'holidays' && (
        <HolidaysTab />
      )}

      {tabKey === 'uploads' && (
        <UploadTab />
      )}      <BackButton to="/admin" sx={{ mt: 2, mb: 3 }} />
    </Box>
  );
}

export default EnvironmentProfilePage;
