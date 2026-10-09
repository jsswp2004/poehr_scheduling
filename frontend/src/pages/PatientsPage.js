import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { toast } from "react-toastify";
import { getAccessToken } from "../utils/tokenManager";

// Components
import BackButton from "../components/BackButton";
import MessagesModal from "../components/MessagesModal";
import SMSModal from "../components/SMSModal";
import {
  PatientsTable,
  TeamTable,
  AppointmentsSection,
  AnalyticsSection,
  EmailModal,
} from "../components/patients";
import RegisterPage from "./RegisterPage";
import CareSettingSidebar from "../components/patients/CareSettingSidebar";
import useChartTabs from "../hooks/useChartTabs";
import MySchedulePanel from "../components/patients/MySchedulePanel";
import ReferralsPanel from "../components/referrals/ReferralsPanel";
import PrescriptionsPanel from "../components/prescriptions/PrescriptionsPanel";
import ClinicalSummary from "../components/clinicalSummary/ClinicalSummary";
import PatientMessages from "../components/secureMessages/PatientMessages";
import TasksPanel from "../components/tasks/TasksPanel";
import PatientChartHeader from "../components/patientHeader/PatientChartHeader";
import { AdmitDialog, TransferDialog, DischargeDialog, AttendingDialog } from "../components/patients/AdmissionDialogs";
import BedBoard from "../components/patients/BedBoard";
import { useLocationTree } from "../components/locations/LocationPicker";
import { unitOptionsFrom } from "../components/patients/unitOptions";
import AcuteViewTabs from "../components/patients/AcuteViewTabs";
import EDBoard from "../components/edBoard/EDBoard";
import {
  PatientChartTabs,
  ComingSoonPanel,
  SelectPatientPrompt,
  COMING_SOON,
  visibleChartTabs,
} from "../components/patients/PatientChartTabs";
import OrdersPanel from "../components/OrdersPanel";
import ClinicalNotesPanel from "../components/ClinicalNotesPanel";
import { PatientRecord } from "./PatientDetailPage";
import VitalSignsFlowsheetPanel from "../components/VitalSignsFlowsheetPanel";

// Hooks
import useOnlineStatus from "../hooks/useOnlineStatus";
import useChat from "../hooks/useChat";
import { usePatients } from "../hooks/usePatients";
import { useTeam } from "../hooks/useTeam";
import { usePatientsAppointments } from "../hooks/usePatientsAppointments";
import { useAnalytics } from "../hooks/useAnalytics";
import { useSubscriptionAccess, SubscriptionGate } from "../hooks/useSubscriptionAccess";
// import { useAuth } from "../hooks/useAuth"; // Commented out since not used

// Utils
import { getValidToken, clearAuthData } from "../utils/auth";
import { API_BASE_URL } from "../config/api";

// Team, Appointments, Analytics and Register are opened from the icons in the top header (?tab=...).
// Chart tab content sits right under the tab strip: panels bring their own top margin
// (a Paper with mt: 3), which left a big empty band, so it is cancelled here.
const TIGHT_PANEL = { p: 0.5, "& > .MuiPaper-root": { mt: 0, pt: 2 } };

// Team, Appointments, Analytics and Register sit right next to the side bar, so their title and
// content get a small gap on both sides (the chart tabs bring their own spacing).
const SIDE_GAP = { pl: 2, pr: 2 };

const VIEW_TITLES = {
  team: "Team",
  appointments: "Appointments",
  analytics: "Analytics",
  register: "Register",
};

function PatientsPage() {
  const navigate = useNavigate();

  // Main tab state -- honors ?tab=appointments (etc.) on initial load, e.g.
  // from the Scheduler solutions-page button, which sends users straight to
  // the Appointments tab (whose own sub-tab already defaults to "today").
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam || "patients";
  const [tab, setTab] = useState(initialTab);

  // Header module links (Documentation / Scheduler) change ?tab= while this
  // page is already mounted, so follow the URL after the first render.
  const lastTabParam = useRef(tabParam);
  useEffect(() => {
    if (lastTabParam.current === tabParam) return;
    lastTabParam.current = tabParam;
    setTab(tabParam || "patients");
  }, [tabParam]);

  // Keep the URL in step with the tab the user picks so the header can show
  // which module (Documentation vs Scheduler) is current.
  const handleTabChange = (e, newVal) => {
    setTab(newVal);
    setSearchParams(newVal === "patients" ? {} : { tab: newVal }, {
      replace: true,
    });
  };
  const [token, setToken] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // The patient whose chart is open. The header above the tabs and every chart tab follow it.
  // It is remembered for this browser tab only, and per user, so a shared computer never shows
  // the previous user's patient.
  const [selectedPatient, setSelectedPatient] = useState(null); // { id, name }
  const [chartTab, setChartTab] = useState("patient_list");
  // What the patient header is showing: the visit that Orders, Documents and Flowsheets chart on.
  const [headerData, setHeaderData] = useState(null);
  const showPatientContext = tab === "patients" || !!selectedPatient;
  const selectionKey = currentUser ? `powerSelectedPatient:${currentUser.id}` : null;
  useEffect(() => {
    if (!selectionKey) return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(selectionKey) || "null");
      if (saved && saved.id) setSelectedPatient(saved);
    } catch (err) {
      // remembering the selection is only a convenience
    }
  }, [selectionKey]);
  const selectPatient = useCallback(
    (patient) => {
      const next = patient ? { id: patient.user_id, name: patient.full_name || "" } : null;
      setSelectedPatient(next);
      if (!selectionKey) return;
      try {
        if (next) window.sessionStorage.setItem(selectionKey, JSON.stringify(next));
        else window.sessionStorage.removeItem(selectionKey);
      } catch (err) {
        // ignore
      }
    },
    [selectionKey]
  );
  const openChart = useCallback(
    (patient, nextTab) => {
      selectPatient(patient);
      setChartTab(nextTab);
    },
    [selectPatient]
  );

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
  const patients = usePatients(navigate, userRole);
  // Units for the Unit column filter on the Acute Care list (inpatient units; the open list adds the facility when there are several, the closed filter does not)
  const locationTree = useLocationTree();
  const unitOptions = React.useMemo(() => unitOptionsFrom(locationTree), [locationTree]);

  // Which chart tabs show for this module, in what order, and which opens first: the clinic's
  // default, then the person's own arrangement (Settings > Tab Management).
  const careKey = patients.careSetting || "ambulatory";
  const chartLayout = useChartTabs(careKey, !!currentUser);
  const landedFor = useRef(null);
  useEffect(() => {
    if (!chartLayout.loaded) return;
    if (landedFor.current === null) {
      // first load: open on the person's tab, unless they have already picked one
      landedFor.current = careKey;
      if (chartTab === "patient_list") setChartTab(chartLayout.defaultTab);
    } else if (landedFor.current !== careKey) {
      // moved to another module: start on that module's tab
      landedFor.current = careKey;
      setChartTab(chartLayout.defaultTab);
    }
  }, [chartLayout.loaded, chartLayout.defaultTab, careKey, chartTab]);
  const team = useTeam(navigate);
  const appointments = usePatientsAppointments();
  const analytics = useAnalytics();
  // Admit / transfer / discharge dialog: { mode: "admit" | "transfer" | "discharge", patient }
  const [admission, setAdmission] = useState(null);
  // Acute Care shows the patient list or the bed board; the board reloads when `boardKey` changes
  const [acuteView, setAcuteView] = useState("list");
  // Emergency Care opens on the ED Board; its Patient List button shows the plain list
  const [boardKey, setBoardKey] = useState(0);
  const afterAdmissionChange = useCallback(async () => {
    setBoardKey((k) => k + 1);
    await patients.fetchPatients();
  }, [patients]);

  // Subscription access control
  const { userTier, permissions } = useSubscriptionAccess();

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

        // Registrars live on the Register tab -- default them there unless
        // a link already pointed at a specific tab (e.g. ?tab=appointments).
        if (role === "registrar" && !searchParams.get("tab")) {
          setTab("register");
        }

        if (
          role !== "admin" &&
          role !== "system_admin" &&
          role !== "doctor" &&
          role !== "registrar" &&
          role !== "receptionist" &&
          role !== "nurse"
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

  // The Team icon in the top header shows unread messages.
  const teamUnread = chat.getTotalUnreadCount ? chat.getTotalUnreadCount() : 0;
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("team-unread-changed", { detail: teamUnread }));
    } catch (err) {
      // the badge is only a convenience
    }
  }, [teamUnread]);

  const handleDeletePatient = (patientId) => {
    const doomed = (patients.patients || []).find((p) => p.id === patientId);
    if (doomed && selectedPatient && String(doomed.user_id) === String(selectedPatient.id)) {
      selectPatient(null);
    }
    patients.handleDelete(patientId, token);
  };

  // Team handlers (similar to patients)
  const handleTeamSendText = (teamMember) => {
    // Use the team-specific SMS handler
    patients.handleTeamSendText(teamMember, token);
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
          flexDirection: "row",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        {/* Care setting sidebar: full height, far left, outside the tabs */}
        {showPatientContext && (
          <CareSettingSidebar
            value={patients.careSetting}
            onBack={() => navigate(-1)}
            onChange={(value) => {
              // Moving to another module (Ambulatory, Emergency, Inpatient) starts clean: the
              // header must not keep showing a patient from the module the user just left.
              if (value !== patients.careSetting) {
                selectPatient(null);
                setHeaderData(null);
                setChartTab("patient_list");
              }
              patients.setCareSetting(value);
              if (tab !== "patients") handleTabChange(null, "patients");
            }}
          />
        )}

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
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

        {/* Patient header: only on the Patient List view, where it follows the selected patient
            (and reads "No patient selected" until one is chosen). */}
        {tab === "patients" && (
          <PatientChartHeader persistent patientId={selectedPatient ? selectedPatient.id : null} onLoaded={setHeaderData} />
        )}

        {/* Chart tabs for the selected patient */}
        {tab === "patients" ? (
          <PatientChartTabs
            value={chartTab}
            onChange={setChartTab}
            role={userRole}
            keys={chartLayout.tabs}
            listLabel={patients.careSetting === "emergency" ? "ED Board" : null}
          />
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, flexShrink: 0, ...SIDE_GAP }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} data-testid="view-title">
              {VIEW_TITLES[tab] || ""}
            </Typography>
            {/* With a patient selected the sidebar's Back button is the only one. */}
            {!selectedPatient && <BackButton />}
          </Box>
        )}

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0, ...(tab === "patients" ? {} : SIDE_GAP) }}>
          {tab === "patients" && (() => {
            const allowed = visibleChartTabs(userRole, chartLayout.tabs).map((t) => t.value);
            const current = allowed.includes(chartTab) ? chartTab : "patient_list";
            if (current === "patient_list") {
              const acute = patients.careSetting === "acute";
              const emergency = patients.careSetting === "emergency";
              if (emergency) {
                return (
                  <EDBoard
                    userRole={userRole}
                    currentUserId={currentUser?.id ?? null}
                    refreshKey={boardKey}
                    selectedUserId={selectedPatient ? selectedPatient.id : null}
                    onSelectPatient={selectPatient}
                    onOpenPatient={(p) => openChart(p, "orders")}
                    onTransfer={(p) => setAdmission({ mode: "transfer", patient: p })}
                    onDischarge={(p) => setAdmission({ mode: "discharge", patient: p })}
                    onAdmit={(p) => setAdmission({ mode: "admit", patient: p })}
                  />
                );
              }
              return (
            <>
            {acute && <AcuteViewTabs value={acuteView} onChange={setAcuteView} />}
            {acute && acuteView === "beds" ? (
              <BedBoard
                userRole={userRole}
                refreshKey={boardKey}
                onOpenPatient={(p) => openChart(p, "orders")}
                onTransfer={(p) => setAdmission({ mode: "transfer", patient: p })}
                onDischarge={(p) => setAdmission({ mode: "discharge", patient: p })}
                onChangeAttending={(p) => setAdmission({ mode: "attending", patient: p })}
              />
            ) : (
            <PatientsTable
              patients={patients.patients}
              loading={patients.loading}
              search={patients.search}
              setSearch={patients.setSearch}
              provider={patients.provider}
              setProvider={patients.setProvider}
              providers={analytics.providers}
              unit={patients.unit}
              setUnit={patients.setUnit}
              units={unitOptions}
              page={patients.page}
              setPage={patients.setPage}
              totalPages={patients.totalPages}
              onSendText={handleSendText}
              onOpenEmailModal={handleOpenEmailModal}
              onDelete={handleDeletePatient}
              userRole={userRole}
              selectedId={selectedPatient ? selectedPatient.id : null}
              onSelect={selectPatient}
              onOpenChart={openChart}
              careSetting={patients.careSetting}
              onAdmit={(p) => setAdmission({ mode: "admit", patient: p })}
              onTransfer={(p) => setAdmission({ mode: "transfer", patient: p })}
              onDischarge={(p) => setAdmission({ mode: "discharge", patient: p })}
              onChangeAttending={(p) => setAdmission({ mode: "attending", patient: p })}
            />
            )}
            </>
              );
            }
            if (current === "my_schedule") {
              return (
                <MySchedulePanel
                  userRole={userRole}
                  providers={analytics.providers}
                  selectedId={selectedPatient ? selectedPatient.id : null}
                  onSelect={selectPatient}
                  onOpenChart={openChart}
                  onSendText={handleSendText}
                  onOpenEmailModal={handleOpenEmailModal}
                />
              );
            }
            if (current === "referral_list") {
              if (!selectedPatient) return <SelectPatientPrompt />;
              return <ReferralsPanel patient={selectedPatient} />;
            }
            if (current === "task_list") {
              if (!selectedPatient) return <SelectPatientPrompt />;
              return <TasksPanel patient={selectedPatient} />;
            }
            if (current === "prescriptions") {
              if (!selectedPatient) return <SelectPatientPrompt />;
              return <PrescriptionsPanel key={selectedPatient.id} patient={selectedPatient} />;
            }
            if (current === "messages") {
              if (!selectedPatient) return <SelectPatientPrompt />;
              return <PatientMessages key={selectedPatient.id} patient={selectedPatient} />;
            }
            if (current === "clinical_summary") {
              if (!selectedPatient) return <SelectPatientPrompt />;
              return <ClinicalSummary key={selectedPatient.id} patient={selectedPatient} onOpenTab={setChartTab} />;
            }
            if (COMING_SOON[current]) {
              return (
                <ComingSoonPanel
                  title={COMING_SOON[current]}
                  patient={selectedPatient}
                />
              );
            }
            if (!selectedPatient) return <SelectPatientPrompt />;
            // the visit in the patient header is the visit being charted on
            const headerReady = !!headerData && headerData.patient === selectedPatient.id;
            const chartVisit = {
              loading: !headerReady,
              appointmentId: headerReady ? headerData.appointment || null : null,
              visitId: headerReady ? headerData.visit || null : null,
            };
            if (current === "patient_info") {
              return (
                <Box sx={TIGHT_PANEL}>
                  <PatientRecord
                    key={selectedPatient.id}
                    id={selectedPatient.id}
                    embedded
                    onOpenNotes={() => setChartTab("documents")}
                  />
                </Box>
              );
            }
            if (current === "orders" || current === "results") {
              return (
                <Box sx={TIGHT_PANEL}>
                  <OrdersPanel
                    key={selectedPatient.id}
                    patientId={selectedPatient.id}
                    forcedSection={current === "results" ? "labs" : "orders"}
                    chartVisit={chartVisit}
                    onShowLabs={() => setChartTab("results")}
                  />
                </Box>
              );
            }
            if (current === "documents") {
              return (
                <Box sx={TIGHT_PANEL}>
                  <ClinicalNotesPanel
                    key={selectedPatient.id}
                    patientId={selectedPatient.id}
                    patientName={selectedPatient.name}
                    chartVisit={chartVisit}
                  />
                </Box>
              );
            }
            if (current === "flowsheets") {
              return (
                <Box sx={TIGHT_PANEL}>
                  <VitalSignsFlowsheetPanel
                    key={selectedPatient.id}
                    patientId={selectedPatient.id}
                    patientName={selectedPatient.name}
                    chartVisit={chartVisit}
                  />
                </Box>
              );
            }
            return <SelectPatientPrompt />;
          })()}

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
              onApproveRequest={(appointmentId) =>
                appointments.handleApproveRequest(appointmentId, token)
              }
              onDenyRequest={(appointmentId, reason) =>
                appointments.handleDenyRequest(appointmentId, token, reason)
              }
            />
          )}

          {tab === "analytics" && (
            <SubscriptionGate
              feature="analyticsSection"
              userTier={userTier}
              permissions={permissions}
              showUpgradePrompt={true}
            >
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
            </SubscriptionGate>
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

        {/* Admit / transfer / discharge */}
        {admission && admission.mode === "admit" && (
          <AdmitDialog
            patient={admission.patient}
            providers={analytics.providers}
            onClose={() => setAdmission(null)}
            onDone={afterAdmissionChange}
          />
        )}
        {admission && admission.mode === "transfer" && (
          <TransferDialog patient={admission.patient} onClose={() => setAdmission(null)} onDone={afterAdmissionChange} />
        )}
        {admission && admission.mode === "attending" && (
          <AttendingDialog
            patient={admission.patient}
            providers={analytics.providers}
            onClose={() => setAdmission(null)}
            onDone={afterAdmissionChange}
          />
        )}
        {admission && admission.mode === "discharge" && (
          <DischargeDialog patient={admission.patient} onClose={() => setAdmission(null)} onDone={afterAdmissionChange} />
        )}
        {/* SMS Modal */}
        <SMSModal
          open={patients.showSMSModal}
          onClose={patients.handleCloseSMSModal}
          recipient={patients.selectedPatient}
          recipientType={patients.smsRecipientType}
          onSend={patients.handleSendSMS}
          loading={patients.sendingSMS}
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
      </Box>
    </LocalizationProvider>
  );
}

export default PatientsPage;
