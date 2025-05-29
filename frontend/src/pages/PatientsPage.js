import axios from 'axios';
import { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, FormControl, InputLabel, Select as MUISelect,
  Alert, CircularProgress, Tabs, Tab
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../components/CalendarView';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faEye, faCommentDots, faEnvelope, faTrash,
} from '@fortawesome/free-solid-svg-icons';
import RegisterPage from './RegisterPage';

function PatientsPage() {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [emailForm, setEmailForm] = useState({
    subject: 'Message from your provider',
    message: '',
  });

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [tab, setTab] = useState('patients');
  const [page, setPage] = useState(1);
  const [sizePerPage, setSizePerPage] = useState(10);
  const [totalSize, setTotalSize] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem('access_token');
  let userRole = null;

  if (token) {
    try {
      const decoded = jwtDecode(token);
      userRole = decoded.role;
    } catch (err) {
      console.error('Failed to decode token:', err);
    }
  }

  // Role-based access control for admin, system_admin, doctor, registrar, and receptionist only
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (
        role !== 'admin' &&
        role !== 'system_admin' &&
        role !== 'doctor' &&
        role !== 'registrar' &&
        role !== 'receptionist'
      ) {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate, token]);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/patients/', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          search,
          provider,
          page,
          page_size: sizePerPage,
        },
      });

      const patientsWithFullName = res.data.results.map((p) => ({
        ...p,
        full_name: `${p.first_name} ${p.last_name}`,
      }));
      setPatients(patientsWithFullName);
      setTotalSize(res.data.count);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'patients') {
      fetchPatients();
    }
    // eslint-disable-next-line
  }, [page, sizePerPage, tab]);

  const handleSendText = async (patient) => {
    const phone = patient.phone_number;
    const message = `Hello ${patient.first_name}, this is a reminder from your provider.`;

    if (!phone) {
      toast.warning(`No phone number available for ${patient.first_name}`);
      return;
    }

    try {
      await axios.post(
        'http://127.0.0.1:8000/api/sms/send-sms/',
        { phone, message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Text sent to ${patient.first_name}`);
    } catch (err) {
      console.error('SMS failed:', err);
      toast.error('Failed to send SMS');
    }
  };

  const handleOpenEmailModal = (patient) => {
    setSelectedPatient(patient);
    setEmailForm({ subject: 'Message from your provider', message: '' });
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    try {
      await axios.post(
        'http://127.0.0.1:8000/api/messages/send-email/',
        {
          email: selectedPatient.email,
          subject: emailForm.subject,
          message: emailForm.message,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success(`Email sent to ${selectedPatient.first_name}`);
      setShowEmailModal(false);
    } catch (err) {
      console.error('Email failed:', err);
      toast.error('Failed to send email');
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this patient?');
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://127.0.0.1:8000/api/users/patients/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Patient deleted!');
      setPage(1);
      setTimeout(() => {
        fetchPatients();
      }, 300);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete patient.');
    }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(
      patients.map((p) => ({
        Name: `${p.first_name} ${p.last_name}`,
        Email: p.email,
        Provider: p.provider_name || '',
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'patients.csv');
  };

  // --- Render Table for Patient List ---
  const renderPatientTable = () => (
    <Paper sx={{ mb: 3, borderRadius: 2, boxShadow: 2, bgcolor: '#f5faff' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Patient Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 220 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 160 }}>Provider</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 160 }}>Last Appointment</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: 180 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                    No patients found.
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((patient) => (
                  <TableRow key={patient.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                    <TableCell>{patient.full_name}</TableCell>
                    <TableCell>{patient.email}</TableCell>
                    <TableCell>{patient.provider_name ? `Dr. ${patient.provider_name}` : <span style={{ color: '#888' }}>None</span>}</TableCell>
                    <TableCell>{patient.last_appointment_date ? new Date(patient.last_appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="View patient profile" placement="top">
                        <Button variant="outlined" size="small" color="primary" sx={{ minWidth: 36, mr: 1 }} onClick={() => navigate(`/patients/${patient.user_id}`)}>
                          <FontAwesomeIcon icon={faEye} />
                        </Button>
                      </Tooltip>
                      <Tooltip title="Send SMS" placement="top">
                        <Button variant="outlined" size="small" color="warning" sx={{ minWidth: 36, mr: 1 }} onClick={() => handleSendText(patient)}>
                          <FontAwesomeIcon icon={faCommentDots} />
                        </Button>
                      </Tooltip>
                      <Tooltip title="Send email" placement="top">
                        <Button variant="outlined" size="small" color="info" sx={{ minWidth: 36, mr: 1 }} onClick={() => handleOpenEmailModal(patient)}>
                          <FontAwesomeIcon icon={faEnvelope} />
                        </Button>
                      </Tooltip>
                      <Tooltip title="Delete patient" placement="top">
                        <Button variant="outlined" size="small" color="error" sx={{ minWidth: 36 }} onClick={() => handleDelete(patient.user_id)}>
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );

  return (
    <Box sx={{ mt: 0, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>
      <Tabs
        value={tab}
        onChange={(_, val) => setTab(val)}
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
        <Tab label="Quick Register" value="register" />
        <Tab label="Patient List" value="patients" />
        <Tab label="Calendar View" value="calendar" />
      </Tabs>
      {tab === 'register' && (
        <RegisterPage adminMode={true} />
      )}
      {tab === 'patients' && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>

            {(userRole === 'admin' || userRole === 'system_admin') && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => navigate('/admin')}
                sx={{ height: 38, minWidth: 80 }}
              >
                ← Back
              </Button>
            )}
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Search patients..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                fetchPatients();
              }}
              sx={{ maxWidth: 350 }}
              InputProps={{
                endAdornment:
                  search && (
                    <IconButton size="small" onClick={() => { setSearch(''); setPage(1); fetchPatients(); }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  ),
              }}
            />            
            <Button variant="contained" color="primary" onClick={exportCSV}>
              Export CSV
            </Button>
          </Stack>
          {renderPatientTable()}
        </>
      )}
      {tab === 'calendar' && (
        <CalendarView />
      )}

      {/* Email Modal */}
      <Dialog open={showEmailModal} onClose={() => setShowEmailModal(false)} fullWidth maxWidth="sm">
        <DialogTitle>Email Patient</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Subject"
            type="text"
            fullWidth
            variant="outlined"
            value={emailForm.subject}
            onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Message"
            type="text"
            fullWidth
            variant="outlined"
            multiline
            rows={4}
            value={emailForm.message}
            onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEmailModal(false)} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleSendEmail} color="primary">
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PatientsPage;
