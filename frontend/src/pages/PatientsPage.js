import axios from 'axios';
import { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Button, TextField, IconButton, Tooltip, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, FormControl, InputLabel, Select as MUISelect,
  Alert, CircularProgress, Tabs, Tab, Pagination, Checkbox
} from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
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
  const [reportStartDate, setReportStartDate] = useState(null);  const [reportEndDate, setReportEndDate] = useState(null);  const [reportProvider, setReportProvider] = useState('all');
  const [providers, setProviders] = useState([]);
  const [todaysAppointments, setTodaysAppointments] = useState([]);
  
  // Appointments table state
  const [appointmentsQuery, setAppointmentsQuery] = useState('');
  const [appointmentsResults, setAppointmentsResults] = useState([]);
  const [appointmentsPage, setAppointmentsPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
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

  // Fetch all appointments and filter client-side for main appointments table
  const fetchAppointments = async (searchText = '') => {
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lowerQuery = searchText.trim().toLowerCase();

      if (!lowerQuery) {
        setAppointmentsResults(res.data);
        return;
      }

      const filtered = res.data.filter((appt) => {
        const patientName = appt.patient_name || (appt.patient ? `${appt.patient.first_name} ${appt.patient.last_name}` : '');
        const providerName = appt.provider_name || (appt.provider ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim() : '');
        let dateTimeFormats = [];
        if (appt.appointment_datetime) {
          const dateObj = new Date(appt.appointment_datetime);
          dateTimeFormats.push(dateObj.toLocaleString());
          dateTimeFormats.push(dateObj.toLocaleDateString());
          dateTimeFormats.push(dateObj.toLocaleTimeString());
          dateTimeFormats.push(dateObj.toISOString().slice(0, 10));
          dateTimeFormats.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`);
        }
        const dateTimeStr = dateTimeFormats.join(' ');
        const description = appt.description || '';
        const duration = appt.duration_minutes ? appt.duration_minutes.toString() : '';
        const status = appt.status || '';
        const clinic = appt.title || '';
        const id = appt.id ? appt.id.toString() : '';
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

      setAppointmentsResults(filtered);    } catch (err) {
      setAppointmentsResults([]);
    }
  };

  // Search handler for appointments
  const handleAppointmentsSearch = async (e) => {
    e.preventDefault();
    fetchAppointments(appointmentsQuery);
  };  useEffect(() => {
    if (tab === 'patients') {
      fetchPatients();
    } else if (tab === 'team') {
      fetchTeam();
    } else if (tab === 'analytics') {
      fetchProviders();
    } else if (tab === 'appointments') {
      fetchProviders();
      fetchAppointments(appointmentsQuery);
    }
    // eslint-disable-next-line
  }, [page, sizePerPage, tab]);
  // Fetch today's appointments for the summary panel
  useEffect(() => {
    const fetchTodaysAppointments = async () => {
      if (tab !== 'appointments') return;
      
      try {
        const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const filtered = res.data.filter((appt) => {
          if (!appt.appointment_datetime) return false;
          const apptDate = new Date(appt.appointment_datetime);
          return apptDate >= today && apptDate < tomorrow;
        });

        // Debug: Log the appointments to see if arrived/no_show fields are present
        console.log('=== DEBUG: PatientsPage Today\'s appointments data ===');
        console.log('All appointments from API:', res.data.length);
        console.log('Filtered appointments for today:', filtered.length);
        
        if (filtered.length > 0) {
          console.log('First appointment:', filtered[0]);
          console.log('First appointment fields:', Object.keys(filtered[0]));
          console.log('First appointment arrived:', filtered[0].arrived);
          console.log('First appointment no_show:', filtered[0].no_show);
        } else if (res.data.length > 0) {
          console.log('Sample appointment from all data:', res.data[0]);
          console.log('Sample appointment fields:', Object.keys(res.data[0]));
          console.log('Sample appointment arrived:', res.data[0].arrived);
          console.log('Sample appointment no_show:', res.data[0].no_show);
        }

        setTodaysAppointments(filtered);
      } catch (err) {
        console.error('Failed to fetch today\'s appointments:', err);
        setTodaysAppointments([]);
      }
    };
    
    fetchTodaysAppointments();
  }, [token, tab]);

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

  // Handle status update for arrived/no_show
  const handleStatusUpdate = async (appointmentId, field, value) => {
    try {
      const updateData = {};
      updateData[field] = value;
      
      // If marking as no_show, automatically uncheck arrived
      if (field === 'no_show' && value) {
        updateData.arrived = false;
      }
      // If marking as arrived, automatically uncheck no_show
      if (field === 'arrived' && value) {
        updateData.no_show = false;
      }

      await axios.patch(`http://127.0.0.1:8000/api/appointments/${appointmentId}/status/`, updateData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Refresh today's appointments to reflect the change
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await axios.get(`http://127.0.0.1:8000/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const filtered = res.data.filter((appt) => {
        if (!appt.appointment_datetime) return false;
        const apptDate = new Date(appt.appointment_datetime);
        return apptDate >= today && apptDate < tomorrow;
      });

      setTodaysAppointments(filtered);
      toast.success(`Appointment status updated successfully`);
    } catch (err) {
      console.error('Failed to update appointment status:', err);
      toast.error('Failed to update appointment status.');
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

  // Helper function to fetch report data from backend
  const fetchReportData = async (reportType) => {
    try {
      const params = new URLSearchParams({
        report_type: reportType
      });
      
      if (reportStartDate) {
        params.append('start_date', reportStartDate.toISOString().split('T')[0]);
      }
      if (reportEndDate) {
        params.append('end_date', reportEndDate.toISOString().split('T')[0]);
      }
      if (reportProvider && reportProvider !== 'all') {
        params.append('provider_id', reportProvider);
      }      const response = await axios.get(
        `http://127.0.0.1:8000/api/analytics/reports/?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch report data:', error);
      toast.error('Failed to fetch report data');
      return null;
    }
  };

  // Helper function to generate printable table HTML
  const generatePrintableTable = (reportType, data) => {
    if (!data || data.length === 0) return '<p>No data available for this report.</p>';

    if (reportType === 'Upcoming Appointments Report' || reportType === 'Past Appointments Report') {
      return `
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Provider</th>
              <th>Title</th>
              <th>Date & Time</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                <td>${item.patient_name}</td>
                <td>${item.provider_name}</td>
                <td>${item.title}</td>
                <td>${item.datetime}</td>
                <td>${item.duration} min</td>
                <td>${item.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Provider Schedule Report') {
      let html = '';
      Object.entries(data).forEach(([provider, appointments]) => {
        html += `
          <h3>${provider}</h3>
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Title</th>
                <th>Date & Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${appointments.map(apt => `
                <tr>
                  <td>${apt.patient_name}</td>
                  <td>${apt.title}</td>
                  <td>${apt.datetime}</td>
                  <td>${apt.duration} min</td>
                  <td>${apt.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      });
      return html;
    }
    
    if (reportType === 'Appointment Status Report') {
      return `
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${data.summary.map(item => `
              <tr>
                <td>${item.status}</td>
                <td>${item.count}</td>
                <td>${item.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p><strong>Total Appointments: ${data.total}</strong></p>
      `;
    }
    
    if (reportType === 'New Patient Registrations') {
      return `
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Email</th>
              <th>Registration Date</th>
              <th>Appointment Count</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.email}</td>
                <td>${item.registration_date}</td>
                <td>${item.appointment_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Blocked Time Slots') {
      return `
        <table>
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Duration (hours)</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                <td>${item.doctor_name}</td>
                <td>${item.start_time}</td>
                <td>${item.end_time}</td>
                <td>${item.duration_hours}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Appointment Recurrence Report') {
      return `
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Provider</th>
              <th>Title</th>
              <th>Recurrence</th>
              <th>Start Date</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                <td>${item.patient_name}</td>
                <td>${item.provider_name}</td>
                <td>${item.title}</td>
                <td>${item.recurrence}</td>
                <td>${item.start_date}</td>
                <td>${item.end_date}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Appointment Duration Summary') {
      const stats = data.statistics;
      return `
        <h3>Statistics Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Average Duration</td><td>${stats.average_duration} minutes</td></tr>
            <tr><td>Total Duration</td><td>${stats.total_duration_hours} hours</td></tr>
            <tr><td>Min Duration</td><td>${stats.min_duration} minutes</td></tr>
            <tr><td>Max Duration</td><td>${stats.max_duration} minutes</td></tr>
            <tr><td>Total Appointments</td><td>${stats.total_appointments}</td></tr>
          </tbody>
        </table>
        
        <h3>Duration Distribution</h3>
        <table>
          <thead>
            <tr>
              <th>Duration Range</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(data.distribution).map(([range, count]) => `
              <tr>
                <td>${range}</td>
                <td>${count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    return '<p>Report type not supported for printing.</p>';
  };
  const handlePrintReport = async (report) => {
    try {
      const reportData = await fetchReportData(report);
      if (reportData) {
        // Create a printable version
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html>
            <head>
              <title>${report}</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #1976d2; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; font-weight: bold; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .filters { margin-bottom: 20px; font-size: 14px; color: #666; }
                @media print { .no-print { display: none; } }
              </style>
            </head>
            <body>
              <h1>${report}</h1>
              <div class="filters">
                ${reportStartDate ? `Start Date: ${reportStartDate.toLocaleDateString()} ` : ''}
                ${reportEndDate ? `End Date: ${reportEndDate.toLocaleDateString()} ` : ''}
                ${reportProvider !== 'all' ? `Provider: ${providers.find(p => p.id == reportProvider)?.first_name || 'All'}` : 'Provider: All'}
              </div>
              ${generatePrintableTable(report, reportData)}
              <script>window.print(); window.onafterprint = () => window.close();</script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Failed to generate printable report');
    }
  };
  const handleExportCsvReport = async (report) => {
    try {
      const reportData = await fetchReportData(report);
      if (reportData) {
        const response = await axios.post(
          'http://127.0.0.1:8000/api/analytics/export/',
          {
            format: 'csv',
            report_type: report,
            data: reportData
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          }
        );
        
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${report.replace(/ /g, '_').toLowerCase()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('CSV report downloaded successfully');
      }
    } catch (error) {
      console.error('CSV export failed:', error);
      toast.error('Failed to export CSV report');
    }
  };
  const handleExportPdfReport = async (report) => {
    try {
      const reportData = await fetchReportData(report);
      if (reportData) {
        const response = await axios.post(
          'http://127.0.0.1:8000/api/analytics/export/',
          {
            format: 'pdf',
            report_type: report,
            data: reportData
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          }
        );
        
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${report.replace(/ /g, '_').toLowerCase()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('PDF report downloaded successfully');
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      toast.error('Failed to export PDF report');
    }  };

  // --- Helper Functions for Summary Panel ---
  const getUserFirstName = () => {
    try {
      if (!token) return '';
      const decoded = jwtDecode(token);
      return decoded.first_name || decoded.username || '';
    } catch {
      return '';
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
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
      )}      {tab === 'appointments' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Two Panel Layout */}
          <Box sx={{ display: 'flex', gap: 2, minHeight: '300px' }}>            {/* Left Panel - 20% - Summary and Today's Appointments */}
            <Box 
              sx={{ 
                flex: '0 0 20%', 
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minHeight: 600
              }}
            >
              {/* Summary Panel */}
              <Paper 
                sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  boxShadow: 2, 
                  bgcolor: '#f8f9fa',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 200
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TodayIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight={600}>Summary</Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 1 }}>
                  <Typography variant="h6" fontWeight={700} color="primary.main" gutterBottom>
                    {getGreeting()}{getUserFirstName() ? `, ${getUserFirstName()}` : ''}! 🌞
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                    Wishing you a wonderful day at POWER Scheduling!
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1 }}>
                    Total Appointments Today: {todaysAppointments.length}
                  </Typography>
                  <Box sx={{ mt: 2, width: '100%' }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                      Patients per Doctor:
                    </Typography>
                    {(() => {
                      const doctorPatientMap = {};
                      todaysAppointments.forEach(appt => {
                        let doctor = appt.provider_name || (appt.provider ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim() : 'Unknown');
                        if (!doctorPatientMap[doctor]) doctorPatientMap[doctor] = 0;
                        doctorPatientMap[doctor] += 1;
                      });
                      
                      return Object.keys(doctorPatientMap).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No appointments scheduled for today.</Typography>
                      ) : (
                        <Box component="ul" sx={{ margin: 0, paddingLeft: 2, fontSize: '0.875rem' }}>
                          {Object.entries(doctorPatientMap).map(([doctor, count]) => (
                            <Box component="li" key={doctor} sx={{ mb: 0.5 }}>
                              <Typography variant="body2" color="text.primary">
                                {doctor}: {count} patient{count > 1 ? 's' : ''}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      );
                    })()}
                  </Box>
                </Box>
              </Paper>

              {/* Today's Appointments Panel */}
              <Paper 
                sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  boxShadow: 2, 
                  bgcolor: '#f8f9fa',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 380,
                  flex: 1
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TodayIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight={600}>Today's Appointments</Typography>
                </Box>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>                    <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>Patient</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>Provider</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', textAlign: 'center' }}>Arrived</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', textAlign: 'center' }}>No Show</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>                      {todaysAppointments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 2, fontSize: '0.75rem' }}>
                            No appointments today.
                          </TableCell>
                        </TableRow>
                      ) : (
                        todaysAppointments
                          .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime))
                          .map((appt) => (                            <TableRow
                              key={appt.id}
                              hover
                              sx={{
                                '&:hover': {
                                  backgroundColor: '#f0f7ff',
                                }
                              }}
                            >
                              <TableCell 
                                sx={{ fontSize: '0.75rem', py: 1, cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedAppointment(appt);
                                  setDetailsOpen(true);
                                }}
                              >
                                {appt.appointment_datetime ? new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </TableCell>
                              <TableCell 
                                sx={{ fontSize: '0.75rem', py: 1, cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedAppointment(appt);
                                  setDetailsOpen(true);
                                }}
                              >
                                {appt.patient_name || (appt.patient && `${appt.patient.first_name} ${appt.patient.last_name}`) || '-'}
                              </TableCell>
                              <TableCell 
                                sx={{ fontSize: '0.75rem', py: 1, cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedAppointment(appt);
                                  setDetailsOpen(true);
                                }}
                              >
                                {appt.provider_name || (appt.provider && (appt.provider.first_name || appt.provider.last_name)
                                  ? `Dr. ${appt.provider.first_name || ''} ${appt.provider.last_name || ''}`.trim()
                                  : '-')
                                }
                              </TableCell>
                              <TableCell sx={{ textAlign: 'center', py: 1 }}>
                                <Checkbox
                                  checked={appt.arrived || false}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleStatusUpdate(appt.id, 'arrived', e.target.checked);
                                  }}
                                  color="primary"
                                  size="small"
                                />
                              </TableCell>
                              <TableCell sx={{ textAlign: 'center', py: 1 }}>
                                <Checkbox
                                  checked={appt.no_show || false}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleStatusUpdate(appt.id, 'no_show', e.target.checked);
                                  }}
                                  color="error"
                                  size="small"
                                />
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>            {/* Right Panel - 80% */}
            <Paper 
              sx={{ 
                flex: '0 0 80%', 
                p: 3, 
                borderRadius: 2, 
                boxShadow: 2, 
                bgcolor: '#f0f7ff',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 600
              }}
            >
              <Typography variant="h5" fontWeight={600} gutterBottom>
                Appointments
              </Typography>
              <Box
                component="form"
                onSubmit={handleAppointmentsSearch}
                sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}
              >
                <TextField
                  type="text"
                  label="Search by patient, provider, date or description"
                  value={appointmentsQuery}
                  onChange={(e) => setAppointmentsQuery(e.target.value)}
                  fullWidth
                  size="small"
                />
                <Button variant="contained" color="primary" type="submit">
                  Search
                </Button>
              </Box>
              <TableContainer sx={{ borderRadius: 2, boxShadow: 2, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0, width: '100%', bgcolor: 'white' }}>
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
                    {(() => {
                      // Sort results by appointment_datetime descending (latest first)
                      const sortedResults = [...appointmentsResults].sort((a, b) => {
                        const dateA = new Date(a.appointment_datetime);
                        const dateB = new Date(b.appointment_datetime);
                        return dateB - dateA;
                      });
                      const appointmentsRowsPerPage = 10;
                      const paginatedResults = sortedResults.slice((appointmentsPage - 1) * appointmentsRowsPerPage, appointmentsPage * appointmentsRowsPerPage);
                      
                      return paginatedResults.length === 0 ? (
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
                                        fetchAppointments(appointmentsQuery);

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
                      );
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>
              {appointmentsResults.length > 10 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Pagination
                    count={Math.ceil(appointmentsResults.length / 10)}
                    page={appointmentsPage}
                    onChange={(_, value) => setAppointmentsPage(value)}
                    color="primary"
                    shape="rounded"
                  />
                </Box>
              )}            </Paper>
          </Box>

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

          {/* Remove the existing AppointmentsPage component */}
        </Box>
      )}{/* Email Modal */}
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
