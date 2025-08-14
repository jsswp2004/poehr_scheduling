import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Tabs, Tab, CircularProgress } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { toast } from "react-toastify";
import { getAccessToken } from "../utils/tokenManager";

// Components
import BackButton from "../components/BackButton";
import MessagesModal from "../components/MessagesModal";
import {
  PatientsTable,
  TeamTable,
  AppointmentsSection,
  AnalyticsSection,
  EmailModal,
} from "../components/patients";
import RegisterPage from "./RegisterPage";

// Hooks
import useOnlineStatus from "../hooks/useOnlineStatus";
import useChat from "../hooks/useChat";
import { usePatients } from "../hooks/usePatients";
import { useTeam } from "../hooks/useTeam";
import { usePatientsAppointments } from "../hooks/usePatientsAppointments";
import { useAnalytics } from "../hooks/useAnalytics";
// import { useAuth } from "../hooks/useAuth"; // Commented out since not used

// Utils
import { getValidToken, clearAuthData } from "../utils/auth";
import { API_BASE_URL } from "../config/api";

function PatientsPage() {
  const navigate = useNavigate();

  // Main tab state
  const [tab, setTab] = useState("patients");
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

  const [messagesModalOpen, setMessagesModalOpen] = useState(false);

  // Authentication
  // const { isSystemAdmin } = useAuth(); // Commented out since not used

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
    const token = getAccessToken();
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const user = {
          id: decoded.user_id,
          user_id: decoded.user_id, // Add this for chat system compatibility
          username: decoded.username,
          first_name: decoded.first_name || "",
          last_name: decoded.last_name || "",
        };
        setCurrentUser(user);
      } catch (error) {
        console.error("❌ Error decoding token:", error);
      }
    }
  }, []);

  // Initialize authentication
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('🔍 PatientsPage: Starting authentication check...');
      console.log('🌍 Current URL:', window.location.href);
      console.log('🔧 Environment:', process.env.NODE_ENV);
      console.log('📡 API Base URL:', process.env.REACT_APP_API_URL || 'relative');

      try {
        const validToken = await getValidToken();
        if (!validToken) {
          console.error("❌ PatientsPage: No valid token available");
          console.log('🔧 LocalStorage contents:', Object.keys(localStorage));
          clearAuthData();
          navigate("/login");
          return;
        }

        console.log("✅ PatientsPage: Valid token obtained");
        setToken(validToken);

        // Validate user role
        const decoded = jwtDecode(validToken);
        const role = decoded.role || "";
        console.log("👤 PatientsPage: User role:", role);
        console.log("⏰ Token expiry:", new Date(decoded.exp * 1000));
        setUserRole(role);

        if (
          role !== "admin" &&
          role !== "system_admin" &&
          role !== "doctor" &&
          role !== "registrar" &&
          role !== "receptionist"
        ) {
          console.error("❌ PatientsPage: Unauthorized role:", role);
          navigate("/");
          return;
        }

        console.log("✅ PatientsPage: Role authorized, fetching organization data...");
        // Fetch organization data after successful token validation
        await analytics.fetchOrganizationData();
        console.log("✅ PatientsPage: Initialization complete");
      } catch (err) {
        console.error("❌ PatientsPage: Authentication initialization failed:", err);
        console.log('🔧 Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack,
          response: err.response?.data,
          status: err.response?.status
        });
        clearAuthData();
        navigate("/login");
      }
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]); // analytics.fetchOrganizationData is stable

  // Toast notifications for new chat messages
  useEffect(() => {
    if (
      lastMessageFromOnlineStatus &&
      lastMessageFromOnlineStatus.type === "new_message"
    ) {
      const message = lastMessageFromOnlineStatus.message;

      if (
        message &&
        message.sender_id !== currentUser?.id &&
        !messagesModalOpen
      ) {
        toast.info(
          `💬 ${message.sender_name}: ${message.content.length > 50
            ? message.content.substring(0, 50) + "..."
            : message.content
          }`,
          {
            position: "top-right",
            autoClose: 4000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          }
        );
      }
    }
  }, [lastMessageFromOnlineStatus, currentUser, messagesModalOpen]);

  // Fetch data based on active tab
  useEffect(() => {
    if (!token) return;

    if (tab === "patients" && token) {
      analytics.fetchProviders(token);
      patients.fetchPatients();
    } else if (tab === "team") {
      team.fetchTeam();
    } else if (tab === "analytics") {
      analytics.fetchProviders(token);
    } else if (tab === "appointments") {
      analytics.fetchProviders(token);
      appointments.fetchTodaysAppointments(token);
      appointments.fetchAppointments(appointments.appointmentsQuery, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    token,
    patients.page,
    patients.search,
    patients.provider,
    team.teamPage,
    team.teamSearch,
    appointments.appointmentsQuery,
  ]);

  // Handle appointments search
  useEffect(() => {
    if (tab === "appointments" && token) {
      appointments.fetchAppointments(appointments.appointmentsQuery, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.appointmentsQuery, tab, token]);

  // Utility functions (commented out since not used)
  // const getGreeting = () => {
  //   const hour = new Date().getHours();
  //   if (hour < 12) return "Good Morning";
  //   if (hour < 18) return "Good Afternoon";
  //   return "Good Evening";
  // };

  // const getUserFirstName = () => {
  //   if (!currentUser) return "User";
  //   return currentUser.first_name || currentUser.username || "User";
  // };

  // Messages handlers
  const handleOpenMessages = () => {
    setMessagesModalOpen(true);
  };

  const handleCloseMessages = () => {
    setMessagesModalOpen(false);
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

  // Handle appointment status updates from dropdown
  const handleAppointmentStatusUpdate = useCallback(
    async (appointmentId, newStatus) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/appointments/${appointmentId}/`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: newStatus }),
          }
        );

        if (response.ok) {
          // Refresh today's appointments to reflect the change
          appointments.fetchTodaysAppointments(token);
          toast.success(`Appointment status updated to ${newStatus}`);
        } else {
          toast.error("Failed to update appointment status");
        }
      } catch (error) {
        console.error("Error updating appointment status:", error);
        toast.error("Error updating appointment status");
      }
    },
    [token, appointments]
  );

  // Analytics handlers
  const handleDownloadReport = (reportName) => {
    analytics.downloadCSVReport(reportName, token);
  };

  // Memoized chat handlers to prevent infinite loops
  // const handleStartChat = useCallback((targetUser) => {
  //   if (chat && chat.startChatWithUser) {
  //     // Transform targetUser to ensure it has user_id property for chat system compatibility
  //     const chatTargetUser = {
  //       ...targetUser,
  //       user_id: targetUser.id || targetUser.user_id // Use id if user_id doesn't exist
  //     };

  //     // Pass the transformed targetUser object to useChat
  //     chat.startChatWithUser(chatTargetUser);
  //   }
  // }, [chat]);

  const handleSendChatMessage = useCallback(
    (targetUser, content) => {
      if (chat && chat.sendMessage) {
        // Transform targetUser to ensure it has user_id property for chat system compatibility
        const chatTargetUser = {
          ...targetUser,
          user_id: targetUser.id || targetUser.user_id, // Use id if user_id doesn't exist
        };

        // Pass the transformed targetUser object to useChat
        chat.sendMessage(chatTargetUser, content);
      }
    },
    [chat]
  );

  if (!token || !currentUser) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
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
          //boxShadow: 2,
          borderRadius: 2,
          bgcolor: "background.paper",
          p: 0,
          height: "calc(100vh - 140px)", // Fixed: Changed from 120vh to 100vh
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Chat system loading indicator */}
        {chat.chatSystemLoading && (
          <Box
            sx={{
              position: "fixed",
              top: 10,
              right: 10,
              background: "#007bff",
              color: "white",
              padding: "8px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={16} sx={{ color: "white" }} />
            Initializing chat system...
          </Box>
        )}

        {/* Main Navigation Tabs */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 2,
            bgcolor: "#f5faff",
            flexShrink: 0,
          }}
        >
          <Tabs
            value={tab}
            onChange={(e, newVal) => setTab(newVal)}
            sx={{
              flex: 1,
              minHeight: 40,
              "& .MuiTabs-indicator": {
                height: 4,
                borderRadius: 2,
                bgcolor: "primary.main",
              },
              "& .MuiTab-root": {
                fontWeight: 500,
                fontSize: "1rem",
                color: "primary.main",
                minHeight: 40,
                textTransform: "none",
                borderRadius: 2,
                mx: 0.5,
                transition: "background 0.2s",
                "&.Mui-selected": {
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  boxShadow: 2,
                },
                "&:hover": {
                  bgcolor: "primary.lighter",
                  color: "primary.dark",
                },
              },
            }}
          >
            <Tab label="Patients" value="patients" />

            <Tab
              label={
                <Box
                  sx={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  Team
                  {(() => {
                    const hasUnread = chat.getTotalUnreadCount
                      ? chat.getTotalUnreadCount() > 0
                      : false;
                    return hasUnread ? (
                      <Box
                        sx={{
                          position: "absolute",
                          top: -8,
                          right: -12,
                          width: 8,
                          height: 8,
                          backgroundColor: "#ff4444",
                          borderRadius: "50%",
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

            {(userRole === "admin" ||
              userRole === "system_admin" ||
              userRole === "registrar") && (
                <Tab label="Register" value="register" />
              )}
          </Tabs>
          <BackButton />
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {tab === "patients" && (
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

          {tab === "team" && (
            <TeamTable
              team={team.team}
              loadingTeam={team.loadingTeam}
              teamSearch={team.teamSearch}
              setTeamSearch={team.setTeamSearch}
              teamPage={team.teamPage}
              setTeamPage={team.setTeamPage}
              teamTotalPages={team.teamTotalPages}
              onOpenMessages={handleOpenMessages}
              totalUnreadCount={
                chat.getTotalUnreadCount ? chat.getTotalUnreadCount() : 0
              }
              onSendText={handleTeamSendText}
              onOpenEmailModal={handleTeamOpenEmailModal}
            />
          )}

          {tab === "appointments" && (
            <AppointmentsSection
              appointmentsTab={appointments.appointmentsTab}
              setAppointmentsTab={appointments.setAppointmentsTab}
              appointmentsQuery={appointments.appointmentsQuery}
              setAppointmentsQuery={appointments.setAppointmentsQuery}
              todaysAppointments={appointments.todaysAppointments}
              appointmentsResults={appointments.appointmentsResults}
              onStatusUpdate={handleStatusUpdate}
              onViewDetails={handleViewAppointmentDetails}
              onAppointmentStatusUpdate={handleAppointmentStatusUpdate}
            />
          )}

          {tab === "analytics" && (
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

          {tab === "register" && (
            <Box sx={{ mt: 1 }}>
              <RegisterPage adminMode={true} />
            </Box>
          )}
        </Box>

        {/* Email Modal */}
        <EmailModal
          open={patients.showEmailModal}
          onClose={() => patients.setShowEmailModal(false)}
          selectedPatient={patients.selectedPatient}
          emailForm={patients.emailForm}
          setEmailForm={patients.setEmailForm}
          onSend={handleSendEmail}
        />

        {/* Messages Modal */}
        <MessagesModal
          open={messagesModalOpen}
          onClose={handleCloseMessages}
          currentUser={currentUser}
          teamMembers={team.team}
          onSendMessage={handleSendChatMessage}
          getRoomMessages={chat.getRoomMessages}
          getTypingUsersForRoom={chat.getTypingUsersForRoom}
          isLoading={chat.isLoading}
          connectionStatus={
            onlineStatusConnected ? "connected" : "disconnected"
          }
          operationStatus={chat.operationStatus}
          chatError={chat.lastError}
          onRetryConnection={() => window.location.reload()}
          getUserOnlineStatus={getUserOnlineStatus}
          getUnreadCountForUser={chat.getUnreadCountForUser}
          getAllUnreadCount={chat.getTotalUnreadCount}
          markRoomAsRead={chat.markRoomAsRead}
        />
      </Box>
    </LocalizationProvider>
  );
}

export default PatientsPage;
