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
import OnlineIndicator from '../components/OnlineIndicator';
import ChatModal from '../components/ChatModal';
import useOnlineStatus from '../hooks/useOnlineStatus';
import useChat from '../hooks/useChat';
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
  const [teamPage, setTeamPage] = useState(1);
  const [teamTotalSize, setTeamTotalSize] = useState(0);
  const [provider, setProvider] = useState('');

  const { 
    getUserOnlineStatus, 
    isConnected: onlineStatusConnected, 
    websocketConnection, 
    sendMessage, 
    lastMessage: lastMessageFromOnlineStatus 
  } = useOnlineStatus();
  
  console.log('🔍 PatientsPage - websocketConnection from useOnlineStatus:', websocketConnection);
  console.log('📨 PatientsPage - lastMessageFromOnlineStatus:', lastMessageFromOnlineStatus);

  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const user = {
          id: decoded.user_id,
          username: decoded.username,
          first_name: decoded.first_name || '',
          last_name: decoded.last_name || ''
        };
        setCurrentUser(user);
      } catch (error) {
        console.error('❌ Error decoding token:', error);
      }
    } else {
      console.error('❌ No token found in localStorage');
    }
  }, []);

  const chat = useChat(currentUser, websocketConnection, sendMessage, lastMessageFromOnlineStatus);

  // ✅ Debug online status
  useEffect(() => {
    console.log('🔍 Current online users state:', { getUserOnlineStatus, isConnected: onlineStatusConnected });
    if (team.length > 0) {
      console.log('👥 Team members and their online status:');
      team.forEach(member => {
        const status = getUserOnlineStatus(member.id);
        console.log(`👤 ${member.full_name} (ID: ${member.id}):`, status);
      });
    }
  }, [team, getUserOnlineStatus, onlineStatusConnected]);
  
  // ✅ Additional debug - check initial state
  useEffect(() => {
    console.log('🚀 PatientsPage initialized, WebSocket connected:', onlineStatusConnected);
  }, []);
  
  const [tab, setTab] = useState('patients');
  const [page, setPage] = useState(1);
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
  const rowsPerPage = 10;
  const totalPages = Math.ceil(totalSize / rowsPerPage); // Use backend totalSize instead of patients.length
  const teamTotalPages = Math.ceil(teamTotalSize / rowsPerPage);

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

  const token = localStorage.getItem('token') || localStorage.getItem('access_token');
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
        headers: { Authorization: `Bearer ${token}` },        params: {
          search,
          provider,
          page,
          page_size: rowsPerPage, // Use rowsPerPage instead of sizePerPage for consistency
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

  const fetchTeam = async (pageParam = teamPage, searchParam = teamSearch) => {
    setLoadingTeam(true);
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/users/team/', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          search: searchParam,
          page: pageParam,
          page_size: rowsPerPage,
        },
      });

      const teamWithFullName = res.data.results.map((u) => ({
        ...u,
        full_name: `${u.first_name} ${u.last_name}`,
      }));
      setTeam(teamWithFullName);
      setTeamTotalSize(res.data.count);
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
  }, [page, rowsPerPage, teamPage, tab]);

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

        setTodaysAppointments(filtered);
      } catch (err) {
        console.error('Failed to fetch today\'s appointments:', err);
        setTodaysAppointments([]);
      }
    };
    
    fetchTodaysAppointments();
  }, [token, tab]);

  // Handle search changes for patients
  useEffect(() => {
    if (tab === 'patients') {
      fetchPatients();
    }
    // eslint-disable-next-line
  }, [search, provider]);

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
      toast.success('Email sent successfully!');
      setShowEmailModal(false);
      setEmailForm({ subject: 'Message from your provider', message: '' });
    } catch (err) {
      console.error('Email failed:', err);
      toast.error('Failed to send email');
    }
  };

  // Handle appointment status updates (arrived/no_show)
  const handleStatusUpdate = async (appointmentId, field, value) => {
    try {
      const updateData = {};
      
      // Implement mutual exclusion logic
      if (field === 'arrived' && value) {
        updateData.arrived = true;
        updateData.no_show = false;
      } else if (field === 'no_show' && value) {
        updateData.arrived = false;
        updateData.no_show = true;
      } else {
        // If unchecking, just set that field to false
        updateData[field] = false;
      }

      await axios.patch(
        `http://127.0.0.1:8000/api/appointments/${appointmentId}/status/`,
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update the local state to reflect the changes
      setTodaysAppointments(prev => 
        prev.map(appt => 
          appt.id === appointmentId 
            ? { ...appt, ...updateData }
            : appt
        )
      );

      toast.success(`Appointment status updated successfully`);
    } catch (err) {
      console.error('Failed to update appointment status:', err);
      toast.error('Failed to update appointment status');
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
            <tr><th>Patient Name</th><th>Provider</th><th>Title</th><th>Date & Time</th><th>Duration</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${data.map(item => `<tr><td>${item.patient_name}</td><td>${item.provider_name}</td><td>${item.title}</td><td>${item.datetime}</td><td>${item.duration} min</td><td>${item.status}</td></tr>`).join('')}
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
              <tr><th>Patient</th><th>Title</th><th>Date & Time</th><th>Duration</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${appointments.map(apt => `<tr><td>${apt.patient_name}</td><td>${apt.title}</td><td>${apt.datetime}</td><td>${apt.duration} min</td><td>${apt.status}</td></tr>`).join('')}
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
            <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
          </thead>
          <tbody>
            ${data.summary.map(item => `<tr><td>${item.status}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`).join('')}
          </tbody>
        </table>
        <p><strong>Total Appointments: ${data.total}</strong></p>
      `;
    }
    
    if (reportType === 'New Patient Registrations') {
      return `
        <table>
          <thead>
            <tr><th>Patient Name</th><th>Email</th><th>Registration Date</th><th>Appointment Count</th></tr>
          </thead>
          <tbody>
            ${data.map(item => `<tr><td>${item.name}</td><td>${item.email}</td><td>${item.registration_date}</td><td>${item.appointment_count}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Blocked Time Slots') {
      return `
        <table>
          <thead>
            <tr><th>Doctor</th><th>Start Time</th><th>End Time</th><th>Duration (hours)</th></tr>
          </thead>
          <tbody>
            ${data.map(item => `<tr><td>${item.doctor_name}</td><td>${item.start_time}</td><td>${item.end_time}</td><td>${item.duration_hours}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    }
    
    if (reportType === 'Appointment Recurrence Report') {
      return `
        <table>
          <thead>
            <tr><th>Patient</th><th>Provider</th><th>Title</th><th>Recurrence</th><th>Start Date</th><th>End Date</th></tr>
          </thead>
          <tbody>
            ${data.map(item => `<tr><td>${item.patient_name}</td><td>${item.provider_name}</td><td>${item.title}</td><td>${item.recurrence}</td><td>${item.start_date}</td><td>${item.end_date}</td></tr>`).join('')}
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
            <tr><th>Metric</th><th>Value</th></tr>
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
            <tr><th>Duration Range</th><th>Count</th></tr>
          </thead>
          <tbody>
            ${Object.entries(data.distribution).map(([range, count]) => `<tr><td>${range}</td><td>${count}</td></tr>`).join('')}
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
            <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 140 }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Status</TableCell> {/* Added Status Column */}
                <TableCell sx={{ fontWeight: 'bold', width: 180 }}>Organization</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: 140 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
              <TableBody>
                {team.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 3 }}> {/* Updated colSpan */}
                    No team members found.
                    </TableCell>
                  </TableRow>
                ) : (team.map((member) => {
                  const onlineStatus = getUserOnlineStatus(member.id);
                  console.log(`Rendering OnlineIndicator for ${member.full_name} (ID: ${member.id}):`, onlineStatus);
                  return (
                  <TableRow key={member.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.phone_number || 'N/A'}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>
                      <OnlineIndicator 
                        isOnline={onlineStatus.isOnline}
                        lastSeen={onlineStatus.lastSeen}
                      />
                    </TableCell>
                    <TableCell>{member.organization_name || 'N/A'}</TableCell>
                    <TableCell align="center">                      <Tooltip title={!onlineStatusConnected ? "Chat unavailable - no connection" : !currentUser ? "Chat unavailable - user not loaded" : "Start Chat"} placement="top">
                        <IconButton
                          size="small"
                          color="primary"
                          sx={{
                            opacity: (!onlineStatusConnected || !currentUser) ? 0.5 : 1,
                            cursor: (!onlineStatusConnected || !currentUser) ? 'not-allowed' : 'pointer'
                          }}
                          onClick={async () => {
                            console.log('🎯 Chat button clicked for team member:', member);
                            console.log('🔍 Current state:', { 
                              currentUser, 
                              onlineStatusConnected, 
                              websocketConnection: websocketConnection?.readyState,
                              chatActiveRoom: chat.activeRoom 
                            });
                            
                            if (!onlineStatusConnected) {
                              toast.error('Chat is not available. WebSocket connection is not established.');
                              return;
                            }
                            
                            if (!currentUser) {
                              toast.error('Cannot start chat. User information is not loaded.');
                              return;
                            }
                            
                            if (!member || !member.id) {
                              toast.error('Cannot start chat. Team member information is invalid.');
                              return;
                            }

                            try {
                              setSelectedChatUser(member);
                              console.log('🚀 Starting chat room creation...');
                              
                              const roomId = await chat.createChatRoom(member.id);
                              console.log('✅ Chat room created with ID:', roomId);
                              
                              if (roomId) {
                                console.log('🎉 Opening chat modal...');
                                setChatModalOpen(true);
                              } else {
                                throw new Error('Chat room creation returned null/undefined room ID');
                              }
                            } catch (error) {
                              console.error('❌ Failed to create chat room:', error);
                              toast.error(`Failed to start chat: ${error.message || 'Unknown error'}`);
                              setSelectedChatUser(null);
                              setChatModalOpen(false);
                            }
                          }}
                          disabled={!onlineStatusConnected || !currentUser}
                        >
                          <FontAwesomeIcon icon={faCommentDots} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                }))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box display="flex" justifyContent="center" alignItems="center" py={2}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setTeamPage(teamPage - 1)}
              disabled={teamPage === 1}
              sx={{ mx: 1 }}
            >
              Prev
            </Button>
            <span>Page {teamPage} of {teamTotalPages}</span>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setTeamPage(teamPage + 1)}
              disabled={teamPage === teamTotalPages}
              sx={{ mx: 1 }}
            >
              Next
            </Button>
          </Box>
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

  const handleStartChat = async (userToChatWith) => {
    if (!currentUser) {
      toast.error("Current user not identified. Cannot start chat.");
      console.error("[PatientsPage] handleStartChat: currentUser is null");
      return;
    }
    if (!userToChatWith || !userToChatWith.id) {
      toast.error("Invalid user selected for chat.");
      console.error("[PatientsPage] handleStartChat: userToChatWith is invalid", userToChatWith);
      return;
    }
    if (currentUser.id === userToChatWith.id) {
      toast.info("You cannot chat with yourself.");
      return;
    }

    console.log(`[PatientsPage] handleStartChat: Attempting to chat with ${userToChatWith.full_name} (ID: ${userToChatWith.id})`);
    setSelectedChatUser(userToChatWith);

    try {
      const roomId = await chat.createChatRoom(userToChatWith.id); 
      if (roomId) {
        console.log(`[PatientsPage] handleStartChat: Room ${roomId} ready for user ${userToChatWith.id}. Modal should open via useEffect.`);
        // The useEffect below will handle opening the modal.
      } else {
        console.error(`[PatientsPage] handleStartChat: Failed to create/join chat room with ${userToChatWith.full_name}.`);
        toast.error(`Could not open chat with ${userToChatWith.full_name}.`);
        setSelectedChatUser(null);
      }
    } catch (error) {
      console.error(`[PatientsPage] handleStartChat: Error starting chat with ${userToChatWith.id}:`, error, error?.message, error?.stack);
      if (typeof error === 'object' && error !== null) {
        toast.error(`Failed to start chat: ${error.message || JSON.stringify(error)}`);
      } else {
        toast.error(`Failed to start chat: ${error}`);
      }
      setSelectedChatUser(null);
      setChatModalOpen(false); 
    }
  };
  // Effect to open chat modal when activeRoom changes and is valid
  useEffect(() => {
    console.log('[PatientsPage] useEffect: chat.activeRoom:', chat.activeRoom, 'selectedChatUser:', selectedChatUser, 'chatModalOpen:', chatModalOpen);
    console.log('[PatientsPage] useEffect: chat.chatRooms:', Object.keys(chat.chatRooms || {}));
    
    if (chat.activeRoom && selectedChatUser && !chatModalOpen) {
      // Check if the active room in chat hook corresponds to the selected user's potential room
      console.log(`[PatientsPage] useEffect: chat.activeRoom (${chat.activeRoom}) and selectedChatUser (${selectedChatUser.full_name}) are set. Opening chat modal.`);
      setChatModalOpen(true);
    } else if (!chat.activeRoom && chatModalOpen) {
      // If activeRoom becomes null (e.g., chat ended or error), consider closing the modal.
      console.log("[PatientsPage] useEffect: chat.activeRoom is null. Considering closing chat modal.");
      // setChatModalOpen(false); // This could be too aggressive. Modal close is handled by its own button.
    }
    
    // Debug additional conditions
    if (chat.activeRoom && !selectedChatUser) {
      console.log('[PatientsPage] useEffect: activeRoom exists but no selectedChatUser');
    }
    if (selectedChatUser && !chat.activeRoom) {
      console.log('[PatientsPage] useEffect: selectedChatUser exists but no activeRoom');
    }
  }, [chat.activeRoom, selectedChatUser, chatModalOpen, chat.chatRooms]);
  
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3, bgcolor: '#eef2f6', minHeight: '100vh' }}>
        <BackButton />
        <Typography variant="h4" gutterBottom sx={{ color: '#1976d2', fontWeight: 'bold' }}>
          {getGreeting()}, {getUserFirstName()}!
        </Typography>

        {/* Summary Panel */}
        {tab === 'appointments' && (
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2, boxShadow: 3, bgcolor: '#fff' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>Today's Appointments</Typography>
            {todaysAppointments.length > 0 ? (
              <TableContainer component={Paper} sx={{ maxHeight: 300, boxShadow: 'none', border: '1px solid #e0e0e0'}}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#e3f2fd'}}>
                      <TableCell sx={{ fontWeight: 'bold'}}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 'bold'}}>Patient</TableCell>
                      <TableCell sx={{ fontWeight: 'bold'}}>Provider</TableCell>
                      <TableCell sx={{ fontWeight: 'bold'}}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold'}}>Arrived</TableCell>
                      <TableCell sx={{ fontWeight: 'bold'}}>No Show</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {todaysAppointments.map(appt => (
                      <TableRow key={appt.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                        <TableCell>{new Date(appt.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                        <TableCell>{appt.patient_name}</TableCell>
                        <TableCell>{appt.provider_name}</TableCell>
                        <TableCell>{appt.status}</TableCell>
                        <TableCell>
                          <Checkbox 
                            size="small"
                            checked={!!appt.arrived}
                            onChange={(e) => handleStatusUpdate(appt.id, 'arrived', e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox 
                            size="small"
                            checked={!!appt.no_show}
                            onChange={(e) => handleStatusUpdate(appt.id, 'no_show', e.target.checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>No appointments scheduled for today.</Typography>
            )}
          </Paper>
        )}

        <Tabs value={tab} onChange={(e, newVal) => setTab(newVal)} indicatorColor="primary" textColor="primary" sx={{ mb: 3, bgcolor: '#fff', borderRadius: 1, boxShadow: 1 }}>
          <Tab label="Patients" value="patients" />
          <Tab label="Team" value="team" />
          <Tab label="Appointments" value="appointments" />
          <Tab label="Analytics" value="analytics" />
          {userRole === 'admin' || userRole === 'system_admin' ? (
            <Tab label="Register User" value="register" />
          ) : null}
        </Tabs>

        {tab === 'patients' && (
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Search Patients"
                variant="outlined"
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flexGrow: 1, bgcolor: '#fff' }}
              />
              <FormControl size="small" sx={{ minWidth: 180, bgcolor: '#fff' }}>
                <InputLabel id="provider-select-label">Provider</InputLabel>
                <MUISelect
                  labelId="provider-select-label"
                  value={provider}
                  label="Provider"
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {providers.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{`Dr. ${p.first_name} ${p.last_name}`}</MenuItem>
                  ))}
                </MUISelect>
              </FormControl>
              <Button variant="contained" startIcon={<FontAwesomeIcon icon={faDownload} />} onClick={exportCSV} sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}>
                Export CSV
              </Button>
            </Stack>
            {renderPatientTable()}
          </Box>
        )}

        {tab === 'team' && (
          <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Search Team Members"
              variant="outlined"
              size="small"
              value={teamSearch}
              onChange={(e) => {
                setTeamSearch(e.target.value);
                fetchTeam(1, e.target.value); // Reset to page 1 on new search
              }}
              sx={{ flexGrow: 1, bgcolor: '#fff' }}
            />
            </Stack>
            {renderTeamTable()}
          </Box>
        )}
        {tab === 'appointments' && (
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Search Appointments (Patient, Provider, Date, Status, etc.)"
                variant="outlined"
                size="small"
                value={appointmentsQuery}
                onChange={(e) => setAppointmentsQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAppointmentsSearch(e)}
                sx={{ flexGrow: 1, bgcolor: '#fff' }}
              />
              <Button variant="contained" onClick={handleAppointmentsSearch} sx={{ height: '40px' }}>Search</Button>
            </Stack>
            <CalendarView appointments={appointmentsResults} providers={providers} token={token} fetchAppointments={() => fetchAppointments(appointmentsQuery)} />
          </Box>
        )}

        {tab === 'analytics' && renderAnalyticsTable()}
        
        {tab === 'register' && <RegisterPage />}

        {/* Email Modal */}
        <Dialog open={showEmailModal} onClose={() => setShowEmailModal(false)} fullWidth maxWidth="sm">
          <DialogTitle sx={{ bgcolor: '#1976d2', color: 'white' }}>
            Send Email to {selectedPatient?.first_name}
            <IconButton onClick={() => setShowEmailModal(false)} sx={{ position: 'absolute', right: 8, top: 8, color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <TextField
              label="Subject"
              fullWidth
              value={emailForm.subject}
              onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Message"
              fullWidth
              multiline
              rows={6}
              value={emailForm.message}
              onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setShowEmailModal(false)} color="secondary">Cancel</Button>
            <Button onClick={handleSendEmail} variant="contained" color="primary">Send</Button>
          </DialogActions>
        </Dialog>        {/* Chat Modal */}
        {selectedChatUser && currentUser && (
          <ChatModal
            open={chatModalOpen && !!chat.activeRoom}
            fallbackOpen={chatModalOpen && !!chat.activeRoom}
            onClose={() => {
              console.log("[PatientsPage] Closing chat modal.");
              setChatModalOpen(false);
              if (chat.activeRoom && currentUser && chat.sendTypingIndicator) {
                chat.sendTypingIndicator(chat.activeRoom, false); 
              }
              if (chat.setActiveRoom) chat.setActiveRoom(null);
              setSelectedChatUser(null);
            }}
            chatPartner={selectedChatUser}
            currentUser={currentUser}
            messages={chat.activeRoom && chat.chatRooms[chat.activeRoom] ? chat.chatRooms[chat.activeRoom].messages : []}
            onSendMessage={(content) => {
              if (chat.activeRoom && chat.sendChatMessage) {
                chat.sendChatMessage(chat.activeRoom, content);
              }
            }}
            typingUsers={chat.activeRoom && chat.typingUsers[chat.activeRoom] ? Object.values(chat.typingUsers[chat.activeRoom]) : []}
            onSendTypingIndicator={(isTyping) => {
              if (chat.activeRoom && currentUser && chat.sendTypingIndicator) {
                chat.sendTypingIndicator(chat.activeRoom, isTyping);
              }
            }}
            isLoading={chat.isLoading || chat.operationStatus === 'creating_room'}
            connectionStatus={onlineStatusConnected ? 'connected' : 'disconnected'}
            operationStatus={chat.operationStatus}
            chatError={chat.lastError}
            onRetryConnection={() => {
              // Retry connection logic if needed
              console.log('Retrying chat connection...');
            }}
          />
        )}
      </Box>
    </LocalizationProvider>
  );
}

export default PatientsPage;
