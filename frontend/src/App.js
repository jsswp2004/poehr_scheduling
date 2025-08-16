import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './toastify-custom.css';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import axios from 'axios';
import { getAccessToken } from './utils/tokenManager';
import { autoMigrateTokens } from './utils/authMigration';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import { LandingPageV1Desktop1920Px as LandingPage } from './pages/LandingPage';
import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import MaintenancePage from './pages/MaintenancePage';
import CreateProfilePage from './pages/CreateProfilePage';
import SettingsPage from './pages/SettingsPage';
import { autoMigrate } from './utils/tokenMigration';
import HolidaysTab from './pages/HolidaysPage';
import EnvironmentProfilePage from './pages/EnvironmentProfilePage';
import AdminUserSearchPage from './pages/AdminUserSearchPage';
import AccountPage from './pages/AccountPage';
import EditAppointmentPage from './pages/EditAppointmentPage';
import AppointmentsPage from './pages/AppointmentsPage';
import PricingPage from './pages/PricingPage';
import FeaturesPage from './pages/FeaturesPage';
import OverviewPage from './pages/OverviewPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import EnrollmentPage from './pages/EnrollmentPage';
import { getValidToken, clearAuthData } from './utils/auth';
import DataSecurityPage from './pages/DataSecurityPage';
import SupportPage from './pages/SupportPage';
import ToastTestPage from './pages/ToastTestPage';
import MessagesPage from './pages/MessagesPage';
import CommunicatorPage from './pages/CommunicatorPage';
import { SolutionsPage } from './pages/SolutionsPage';
import WebSocketTest from './components/WebSocketTest';
import WebSocketDirectTest from './components/WebSocketDirectTest';
import ChatTestPage from './pages/ChatTestPage';
import DebugAvailability from './components/DebugAvailability';
import { AnnouncementProvider } from './contexts/AnnouncementContext';

function AppContent() {
  const location = useLocation();
  const showNavbar = !['/', '/login', '/register', '/forgot-password', '/pricing', '/features', '/overview', '/about', '/contact', '/enroll', '/security', '/support', '/solutions'].includes(location.pathname);

  // Run token migration on app startup
  useEffect(() => {
    // Run legacy token migration first
    autoMigrate();

    // Run new authentication migration to fix inconsistencies
    autoMigrateTokens();
  }, []);

  // Setup axios interceptor for automatic token refresh
  useEffect(() => {
    // Add request interceptor to sanitize/attach Authorization header and debug
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        // Ensure headers object exists
        config.headers = config.headers || {};

        // 1) Sanitize malformed headers like: Bearer {"token":"JWT"}
        const incomingAuth = config.headers.Authorization || '';
        if (incomingAuth && /^Bearer\s*\{/.test(incomingAuth.trim())) {
          try {
            const jsonPart = incomingAuth.replace(/^Bearer\s*/i, '').trim();
            const parsed = JSON.parse(jsonPart);
            if (parsed?.token) {
              config.headers.Authorization = `Bearer ${parsed.token}`;
              console.warn('🛠️ Fixed malformed Authorization header (JSON-wrapped token).');
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse JSON-wrapped Authorization header.');
          }
        }

        // 2) If Authorization still missing, attach from centralized store
        if (!config.headers.Authorization) {
          const token = getAccessToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }

        // 3) Debug log (after sanitization/attachment)
        const authHeader = config.headers.Authorization || '';
        const redactedAuth = authHeader.replace(/^Bearer\s+(.{0,12}).*(.{6})$/, 'Bearer $1…$2');
        console.log(
          '🌐 [axios:req]',
          config.method?.toUpperCase(),
          config.url,
          'Auth=',
          redactedAuth || 'None'
        );

        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Don't refresh for the refresh endpoint itself to prevent recursion
        if (originalRequest.url?.includes('/token/refresh/')) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          console.log('🔄 401 detected, attempting to get a valid token for:', originalRequest.url);

          try {
            // Prefer centralized getValidToken to leverage single-flight + expiringSoon logic
            const newToken = await getValidToken();
            if (newToken) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              console.log('✅ Retrying request with new token');
              return axios(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh/getValidToken failed:', refreshError);
            clearAuthData();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Add or remove body class based on whether navbar should be shown
  useEffect(() => {
    if (showNavbar) {
      document.body.classList.add('with-navbar');
    } else {
      document.body.classList.remove('with-navbar');
    }
  }, [showNavbar]);
  useEffect(() => {
    const body = document.body;
    if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forgot-password' || location.pathname === '/pricing' || location.pathname === '/features' || location.pathname === '/overview' || location.pathname === '/about' || location.pathname === '/contact' || location.pathname === '/enroll' || location.pathname === '/support' || location.pathname === '/solutions') {
      body.classList.add('bg-gray-100');
    } else {
      body.classList.remove('bg-gray-100');
    }
  }, [location.pathname]); return (
    <>      {showNavbar && <Navbar />}      <ToastContainer
      position="top-center"
      autoClose={2000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
    />
      <Routes>        <Route path="/" element={<LandingPage />} />
        <Route path="/solutions" element={<SolutionsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/enroll" element={<EnrollmentPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/security" element={<DataSecurityPage />} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/patients" element={<PrivateRoute><PatientsPage /></PrivateRoute>} />
        <Route path="/patients/:id" element={<PrivateRoute><PatientDetailPage /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
        <Route path="/account" element={<PrivateRoute><AccountPage /></PrivateRoute>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/maintenance" element={<PrivateRoute><MaintenancePage /></PrivateRoute>} />
        <Route path="/create-profile" element={<PrivateRoute><CreateProfilePage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="/holidays" element={<PrivateRoute><HolidaysTab /></PrivateRoute>} />
        <Route path="/environment" element={<PrivateRoute><EnvironmentProfilePage /></PrivateRoute>} />        <Route path="/admin-user-search" element={<PrivateRoute><AdminUserSearchPage /></PrivateRoute>} />
        <Route path="/messages" element={<PrivateRoute><MessagesPage /></PrivateRoute>} />
        <Route path="/appointments/:id/edit" element={<EditAppointmentPage />} />        <Route path="/appointments" element={<PrivateRoute><AppointmentsPage /></PrivateRoute>} />        <Route path="/toast-test" element={<ToastTestPage />} />
        <Route path="/websocket-test" element={<WebSocketTest />} />
        <Route path="/websocket-direct-test" element={<WebSocketDirectTest />} />
        <Route path="/chat-test" element={<ChatTestPage />} />
        <Route path="/debug-availability" element={<PrivateRoute><DebugAvailability /></PrivateRoute>} />
        <Route path="/communicator" element={<PrivateRoute><CommunicatorPage /></PrivateRoute>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AnnouncementProvider>
      <Router>
        <AppContent />
      </Router>
    </AnnouncementProvider>
  );
}

export default App;
