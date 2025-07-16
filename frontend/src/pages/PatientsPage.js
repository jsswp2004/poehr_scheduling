import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Tabs,
    Tab,
    CircularProgress,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';

// Components
import BackButton from '../components/BackButton';
import ChatModal from '../components/ChatModal';
import {
    PatientsTable,
    TeamTable,
    AppointmentsSection,
    AnalyticsSection,
    EmailModal,
} from '../components/patients';
import RegisterPage from './RegisterPage';

// Hooks
import useOnlineStatus from '../hooks/useOnlineStatus';
import useChat from '../hooks/useChat';
import { usePatients } from '../hooks/usePatients';
import { useTeam } from '../hooks/useTeam';
import { usePatientsAppointments } from '../hooks/usePatientsAppointments';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../hooks/useAuth';

// Utils
import { getValidToken, clearAuthData } from '../utils/auth';

function PatientsPage() {
    const navigate = useNavigate();

    // Main tab state
    const [tab, setTab] = useState('patients');
    const [token, setToken] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);

    // Chat and online status
    const {
        getUserOnlineStatus,
        isConnected: onlineStatusConnected,
        websocketConnection,
        sendMessage,
        lastMessage: lastMessageFromOnlineStatus,
    } = useOnlineStatus();

    const [chatModalOpen, setChatModalOpen] = useState(false);
    const [selectedChatUser, setSelectedChatUser] = useState(null);

    // Authentication
    const { isSystemAdmin } = useAuth();

    // Custom hooks for each section
    const patients = usePatients(navigate);
    const team = useTeam(navigate);
    const appointments = usePatientsAppointments();
    const analytics = useAnalytics();

    // Initialize chat
    const chat = useChat(
        currentUser,
        websocketConnection,
        sendMessage,
        lastMessageFromOnlineStatus
    );

    // Get current user from token
    useEffect(() => {
        const token = localStorage.getItem('token') || localStorage.getItem('access_token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const user = {
                    id: decoded.user_id,
                    username: decoded.username,
                    first_name: decoded.first_name || '',
                    last_name: decoded.last_name || '',
                };
                setCurrentUser(user);
            } catch (error) {
                console.error('❌ Error decoding token:', error);
            }
        }
    }, []);

    // Initialize authentication
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const validToken = await getValidToken();
                if (!validToken) {
                    console.error('No valid token available');
                    clearAuthData();
                    navigate('/login');
                    return;
                }

                setToken(validToken);

                // Validate user role
                const decoded = jwtDecode(validToken);
                const role = decoded.role || '';
                setUserRole(role);

                if (
                    role !== 'admin' &&
                    role !== 'system_admin' &&
                    role !== 'doctor' &&
                    role !== 'registrar' &&
                    role !== 'receptionist'
                ) {
                    navigate('/');
                }

                // Fetch organization data after successful token validation
                await analytics.fetchOrganizationData();
            } catch (err) {
                console.error('Authentication initialization failed:', err);
                clearAuthData();
                navigate('/login');
            }
        };

        initializeAuth();
    }, [navigate]);  // Removed analytics from dependencies

    // Toast notifications for new chat messages
    useEffect(() => {
        if (
            lastMessageFromOnlineStatus &&
            lastMessageFromOnlineStatus.type === 'new_message'
        ) {
            const message = lastMessageFromOnlineStatus.message;

            if (message && message.sender_id !== currentUser?.id && !chatModalOpen) {
                toast.info(
                    `💬 ${message.sender_name}: ${message.content.length > 50
                        ? message.content.substring(0, 50) + '...'
                        : message.content
                    }`,
                    {
                        position: 'top-right',
                        autoClose: 4000,
                        hideProgressBar: false,
                        closeOnClick: true,
                        pauseOnHover: true,
                        draggable: true,
                    }
                );
            }
        }
    }, [lastMessageFromOnlineStatus, currentUser, chatModalOpen]);

    // Fetch data based on active tab
    useEffect(() => {
        if (!token) return;

        if (tab === 'patients' && token) {
            analytics.fetchProviders(token);
            patients.fetchPatients();
        } else if (tab === 'team') {
            team.fetchTeam();
        } else if (tab === 'analytics') {
            analytics.fetchProviders(token);
        } else if (tab === 'appointments') {
            analytics.fetchProviders(token);
            appointments.fetchTodaysAppointments(token);
            appointments.fetchAppointments(appointments.appointmentsQuery, token);
        }
    }, [tab, token, patients.page, patients.search, patients.provider, team.teamPage, team.teamSearch]);

    // Handle appointments search
    useEffect(() => {
        if (tab === 'appointments' && token) {
            appointments.fetchAppointments(appointments.appointmentsQuery, token);
        }
    }, [appointments.appointmentsQuery, tab, token]);

    // Utility functions
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const getUserFirstName = () => {
        if (!currentUser) return 'User';
        return currentUser.first_name || currentUser.username || 'User';
    };

    // Chat handlers
    const handleOpenChat = (user) => {
        setSelectedChatUser(user);
        setChatModalOpen(true);
    };

    const handleCloseChat = () => {
        setChatModalOpen(false);
        setSelectedChatUser(null);
    };

    // Email handlers
    const handleOpenEmailModal = (patient) => {
        patients.handleOpenEmailModal(patient, token);
    };

    const handleSendEmail = () => {
        patients.handleSendEmail(token);
    };

    // Patient handlers
    const handleSendText = (patient) => {
        patients.handleSendText(patient, token);
    };

    const handleDeletePatient = (patientId) => {
        patients.handleDelete(patientId, token);
    };

    // Team handlers (similar to patients)
    const handleTeamSendText = (teamMember) => {
        // Use the same SMS logic as patients since team members are also users
        patients.handleSendText(teamMember, token);
    };

    const handleTeamOpenEmailModal = (teamMember) => {
        // Use the same email modal logic as patients
        patients.handleOpenEmailModal(teamMember, token);
    };

    // Appointment handlers
    const handleStatusUpdate = (appointmentId, field, value) => {
        appointments.handleStatusUpdate(appointmentId, field, value, token);
    };

    const handleViewAppointmentDetails = (appointment) => {
        appointments.setSelectedAppointment(appointment);
        appointments.setDetailsOpen(true);
    };

    // Analytics handlers
    const handleDownloadReport = (reportName) => {
        analytics.downloadCSVReport(reportName, token);
    };

    if (!token || !currentUser) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading...</Typography>
            </Box>
        );
    }

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box
                sx={{
                    mt: 0,
                    boxShadow: 2,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    p: 3,
                    height: '100%',
                }}
            >
                {/* Chat system loading indicator */}
                {chat.chatSystemLoading && (
                    <Box
                        sx={{
                            position: 'fixed',
                            top: 10,
                            right: 10,
                            background: '#007bff',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                        }}
                    >
                        <CircularProgress size={16} sx={{ color: 'white' }} />
                        Initializing chat system...
                    </Box>
                )}

                {/* Main Navigation Tabs */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, bgcolor:'#f5faff' }}>
                    <Tabs
                        value={tab}
                        onChange={(e, newVal) => setTab(newVal)}
                        sx={{
                            flex: 1,
                            minHeight: 40,
                            '& .MuiTabs-indicator': {
                                height: 4,
                                borderRadius: 2,
                                bgcolor: 'primary.main',
                            },
                            '& .MuiTab-root': {
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
                        <Tab label="Patients" value="patients" />

                        <Tab
                            label={
                                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    Team
                                    {(() => {
                                        const hasUnread = chat.getTotalUnreadCount ? chat.getTotalUnreadCount() > 0 : false;
                                        return hasUnread ? (
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    top: -8,
                                                    right: -12,
                                                    width: 8,
                                                    height: 8,
                                                    backgroundColor: '#ff4444',
                                                    borderRadius: '50%',
                                                }}
                                            />
                                        ) : null;
                                    })()}
                                </Box>
                            }
                            value="team"
                        />

                        <Tab label="Appointments" value="appointments" />
                        <Tab label="Analytics" value="analytics" />

                        {(userRole === 'admin' || userRole === 'system_admin' || userRole === 'registrar') && (
                            <Tab label="Register" value="register" />
                        )}
                    </Tabs>
                    <BackButton />
                </Box>

                {/* Tab Content */}
                {tab === 'patients' && (
                    <PatientsTable
                        patients={patients.patients}
                        loading={patients.loading}
                        search={patients.search}
                        setSearch={patients.setSearch}
                        provider={patients.provider}
                        setProvider={patients.setProvider}
                        providers={analytics.providers}
                        page={patients.page}
                        setPage={patients.setPage}
                        totalPages={patients.totalPages}
                        onSendText={handleSendText}
                        onOpenEmailModal={handleOpenEmailModal}
                        onDelete={handleDeletePatient}
                    />
                )}

                {tab === 'team' && (
                    <TeamTable
                        team={team.team}
                        loadingTeam={team.loadingTeam}
                        teamSearch={team.teamSearch}
                        setTeamSearch={team.setTeamSearch}
                        teamPage={team.teamPage}
                        setTeamPage={team.setTeamPage}
                        teamTotalPages={team.teamTotalPages}
                        onOpenChat={handleOpenChat}
                        getUserOnlineStatus={getUserOnlineStatus}
                        getTotalUnreadCount={chat.getTotalUnreadCount}
                        onSendText={handleTeamSendText}
                        onOpenEmailModal={handleTeamOpenEmailModal}
                    />
                )}

                {tab === 'appointments' && (
                    <AppointmentsSection
                        appointmentsTab={appointments.appointmentsTab}
                        setAppointmentsTab={appointments.setAppointmentsTab}
                        appointmentsQuery={appointments.appointmentsQuery}
                        setAppointmentsQuery={appointments.setAppointmentsQuery}
                        todaysAppointments={appointments.todaysAppointments}
                        appointmentsResults={appointments.appointmentsResults}
                        onStatusUpdate={handleStatusUpdate}
                        onViewDetails={handleViewAppointmentDetails}
                    />
                )}

                {tab === 'analytics' && (
                    <AnalyticsSection
                        analyticsTab={analytics.analyticsTab}
                        setAnalyticsTab={analytics.setAnalyticsTab}
                        reportStartDate={analytics.reportStartDate}
                        setReportStartDate={analytics.setReportStartDate}
                        reportEndDate={analytics.reportEndDate}
                        setReportEndDate={analytics.setReportEndDate}
                        reportProvider={analytics.reportProvider}
                        setReportProvider={analytics.setReportProvider}
                        providers={analytics.providers}
                        analyticsReports={analytics.analyticsReports}
                        advancedAnalyticsReports={analytics.advancedAnalyticsReports}
                        onDownloadReport={handleDownloadReport}
                        organizationData={analytics.organizationData}
                        organizationLogo={analytics.organizationLogo}
                    />
                )}

                {tab === 'register' && (
                    <Box sx={{ mt: 2 }}>
                        <RegisterPage />
                    </Box>
                )}

                {/* Email Modal */}
                <EmailModal
                    open={patients.showEmailModal}
                    onClose={() => patients.setShowEmailModal(false)}
                    selectedPatient={patients.selectedPatient}
                    emailForm={patients.emailForm}
                    setEmailForm={patients.setEmailForm}
                    onSend={handleSendEmail}
                />

                {/* Chat Modal */}
                <ChatModal
                    open={chatModalOpen}
                    onClose={handleCloseChat}
                    selectedUser={selectedChatUser}
                    currentUser={currentUser}
                    chat={chat}
                />
            </Box>
        </LocalizationProvider>
    );
}

export default PatientsPage;
