import axios from 'axios';
import { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, FormControl, InputLabel, Select as MUISelect,
  Alert, CircularProgress, Tabs, Tab
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import CloseIcon from '@mui/icons-material/Close';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import CalendarView from '../components/CalendarView';
import BackButton from '../components/BackButton';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faEye, faCommentDots, faEnvelope, faTrash,
  faPrint, faFileCsv, faFilePdf,
} from '@fortawesome/free-solid-svg-icons';
import RegisterPage from './RegisterPage';
import AppointmentsPage from './AppointmentsPage';

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
  const [team, setTeam] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [teamSearch, setTeamSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [tab, setTab] = useState('patients');
  const [page, setPage] = useState(1);
  const [sizePerPage, setSizePerPage] = useState(10);
  const [totalSize, setTotalSize] = useState(0);
  const [reportStartDate, setReportStartDate] = useState(null);
  const [reportEndDate, setReportEndDate] = useState(null);
  const [reportProvider, setReportProvider] = useState('all');
  const [providers, setProviders] = useState([]);
  const navigate = useNavigate();
  const rowsPerPage = 15;
  const totalPages = Math.ceil(patients.length / rowsPerPage);
  const paginatedPatients = patients.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const analyticsReports = [
    'Upcoming Appointments Report',
    'Past Appointments Report',
    'Provider Schedule Report',
    'Appointment Status Report',
    'New Patient Registrations',
    'Blocked Time Slots',
    'Appointment Recurrence Report',
    'Appointment Duration Summary',
  ];

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

  const fetchTeam = async () => {
    setLoadingTeam(true);
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/team/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: teamSearch },
      });

      const teamWithFullName = res.data.results.map((u) => ({
        ...u,
        full_name: `${u.first_name} ${u.last_name}`,
      }));
      setTeam(teamWithFullName);
    } catch (err) {
      console.error('Failed to fetch team:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/doctors/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProviders(res.data);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    }
  };

  useEffect(() => {
    if (tab === 'patients') {
      fetchPatients();
    } else if (tab === 'team') {
      fetchTeam();
    } else if (tab === 'analytics') {
      fetchProviders();
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

    // Get current user's name from token
    let userName = 'your provider';
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const firstName = decoded.first_name || '';
        const lastName = decoded.last_name || '';
        if (firstName || lastName) {
          userName = `${firstName} ${lastName}`.trim();
        }
      } catch (err) {
        console.error('Failed to decode token for user name:', err);
      }
    }

    setEmailForm({ subject: `Message from ${userName}`, message: '' });
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

  const handlePrintReport = (report) => {
    console.log('Print report:', report);
    window.print();
  };

  const handleExportCsvReport = (report) => {
    console.log('Export CSV for:', report);
  };

  const handleExportPdfReport = (report) => {
    console.log('Export PDF for:', report);
  };

  // --- Render Table for Patient List ---

  const renderPatientTable = () => (
    <Paper sx={{ mb: 3, borderRadius: 2, boxShadow: 2, bgcolor: '#f5faff' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
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
                {paginatedPatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No patients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPatients.map((patient) => (
                    <TableRow key={patient.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                      <TableCell>{patient.full_name}</TableCell>
                      <TableCell>{patient.email}</TableCell>
                      <TableCell>{patient.provider_name ? `Dr. ${patient.provider_name}` : <span style={{ color: '#888' }}>None</span>}</TableCell>
                      <TableCell>{patient.last_appointment_date ? new Date(patient.last_appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 1 }}>
                          <Tooltip title="View patient profile" placement="top">
                            <IconButton variant="contained" size="small" color="primary"
                              sx={{
                                width: 36,
                                height: 36,
                                minWidth: 0,
                                padding: 0,
                                mr: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onClick={() => navigate(`/patients/${patient.user_id}`)}>
                              <FontAwesomeIcon icon={faEye} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Send SMS" placement="top">
                            <IconButton variant="contained" size="small" color="warning"
                              sx={{
                                width: 36,
                                height: 36,
                                minWidth: 0,
                                padding: 0,
                                mr: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onClick={() => handleSendText(patient)}>
                              <FontAwesomeIcon icon={faCommentDots} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Send email" placement="top">
                            <IconButton variant="outlined" size="small" color="info"
                              sx={{
                                width: 36,
                                height: 36,
                                minWidth: 0,
                                padding: 0,
                                mr: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onClick={() => handleOpenEmailModal(patient)}>
                              <FontAwesomeIcon icon={faEnvelope} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete patient" placement="top">
                            <IconButton variant="outlined" size="small" color="error"
                              sx={{
                                width: 36,
                                height: 36,
                                minWidth: 0,
                                padding: 0,

                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onClick={() => handleDelete(patient.user_id)}>
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Box display="flex" justifyContent="center" alignItems="center" py={2}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              sx={{ mx: 1 }}
            >
              Prev
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              sx={{ mx: 1 }}
            >
              Next
            </Button>
          </Box>
        </>
      )}
    </Paper>
  );

  const renderTeamTable = () => (
    <Paper sx={{ mb: 3, borderRadius: 2, boxShadow: 2, bgcolor: '#f5faff' }}>
      {loadingTeam ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table size="small" stickyHeader>            <TableHead>
              <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 140 }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Organization</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: 140 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
              <TableBody>
                {team.length === 0 ? (
                  <TableRow>                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                    No team members found.
                  </TableCell>
                  </TableRow>
                ) : (team.map((member) => (
                  <TableRow key={member.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.phone_number || '—'}</TableCell>
                    <TableCell>{member.role || 'N/A'}</TableCell>
                    <TableCell>{member.organization_name || '—'}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 1 }}>
                        <Tooltip title="Send SMS" placement="top">
                          <IconButton variant="contained" size="small" color="warning"
                            sx={{ width: 36, height: 36, minWidth: 0, padding: 0, mr: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleSendText(member)}>
                            <FontAwesomeIcon icon={faCommentDots} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send email" placement="top">
                          <IconButton variant="outlined" size="small" color="info"
                            sx={{ width: 36, height: 36, minWidth: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleOpenEmailModal(member)}>
                            <FontAwesomeIcon icon={faEnvelope} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );

  const renderAnalyticsTable = () => (
    <Paper sx={{ mb: 3, borderRadius: 2, boxShadow: 2, bgcolor: '#f5faff', p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="Start Date"
            value={reportStartDate}
            onChange={(newVal) => setReportStartDate(newVal)}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </LocalizationProvider>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="End Date"
            value={reportEndDate}
            onChange={(newVal) => setReportEndDate(newVal)}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </LocalizationProvider>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="report-provider-label">Provider</InputLabel>
          <MUISelect
            labelId="report-provider-label"
            value={reportProvider}
            label="Provider"
            onChange={(e) => setReportProvider(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            {providers.map((p) => (
              <MenuItem key={p.id} value={p.id}>{`Dr. ${p.first_name} ${p.last_name}`}</MenuItem>
            ))}
          </MUISelect>
        </FormControl>
      </Stack>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#e3f2fd' }}>
            <TableCell sx={{ fontWeight: 'bold', width: 300 }}>Reports</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 240 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {analyticsReports.map((r, idx) => (
            <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
              <TableCell>{r}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Print">
                    <IconButton color="primary" onClick={() => handlePrintReport(r)} sx={{ width: 36, height: 36 }}>
                      <FontAwesomeIcon icon={faPrint} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export CSV">
                    <IconButton color="success" onClick={() => handleExportCsvReport(r)} sx={{ width: 36, height: 36 }}>
                      <FontAwesomeIcon icon={faFileCsv} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export PDF">
                    <IconButton color="secondary" onClick={() => handleExportPdfReport(r)} sx={{ width: 36, height: 36 }}>
                      <FontAwesomeIcon icon={faFilePdf} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

  return (
    <Box sx={{ mt: 0, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }}>      <Box sx={{
      display: 'flex',
      alignItems: 'center',
      mb: 1,
      borderRadius: 2,
      bgcolor: '#f5faff',
      boxShadow: 1,
      minHeight: 48,
      p: 1
    }}>
      <Tabs
        value={tab}
        onChange={(_, val) => setTab(val)}
        sx={{
          flex: 1,
          minHeight: 40,
          '& .MuiTabs-indicator': {
            height: 4,
            borderRadius: 2,
            bgcolor: 'primary.main',
          }, '& .MuiTab-root': {
            fontWeight: 500,
            fontSize: '1rem',
            color: 'primary.main',
            minHeight: 40,
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
        {(userRole !== 'doctor') && (
          <Tab label="Quick Register" value="register" />
        )}
        <Tab label="Patients" value="patients" />
        <Tab label="Team" value="team" />
        <Tab label="Calendar" value="calendar" />
        <Tab label="Appointments" value="appointments" />
        <Tab label="Analytics" value="analytics" />
      </Tabs>

      {(userRole === 'admin' || userRole === 'registrar' || userRole === 'system_admin') && (
        <Box sx={{ ml: 1 }}>
          <BackButton />
        </Box>
      )}
    </Box>

      {tab === 'register' && (
        <RegisterPage adminMode={true} />
      )}
      {tab === 'patients' && (<>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
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
      {tab === 'team' && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Search team..."
              value={teamSearch}
              onChange={(e) => {
                setTeamSearch(e.target.value);
                fetchTeam();
              }}
              sx={{ maxWidth: 350 }}
              InputProps={{
                endAdornment:
                  teamSearch && (
                    <IconButton size="small" onClick={() => { setTeamSearch(''); fetchTeam(); }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  ),
              }}
            />
          </Stack>
          {renderTeamTable()}
        </>
      )}
      {tab === 'analytics' && (
        <>
          {renderAnalyticsTable()}
        </>
      )}
      {tab === 'calendar' && (
        <CalendarView />
      )}
      {tab === 'appointments' && (
        <AppointmentsPage />
      )}      {/* Email Modal */}
      <Dialog open={showEmailModal} onClose={() => setShowEmailModal(false)} fullWidth maxWidth="sm">
        <DialogTitle>Message</DialogTitle>
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
