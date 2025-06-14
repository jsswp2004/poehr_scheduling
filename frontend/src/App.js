import { ToastContainer } from './components/SimpleToast';
import 'react-toastify/dist/ReactToastify.css';
import './toastify-custom.css';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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
import HolidaysTab from './pages/HolidaysPage';
import EnvironmentProfilePage from './pages/EnvironmentProfilePage';
import AdminUserSearchPage from './pages/AdminUserSearchPage';
import EditAppointmentPage from './pages/EditAppointmentPage';
import AppointmentsPage from './pages/AppointmentsPage';
import PricingPage from './pages/PricingPage';
import FeaturesPage from './pages/FeaturesPage';
import OverviewPage from './pages/OverviewPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import EnrollmentPage from './pages/EnrollmentPage';
import DataSecurityPage from './pages/DataSecurityPage';
import SupportPage from './pages/SupportPage';
import ToastTestPage from './pages/ToastTestPage';
import MessagesPage from './pages/MessagesPage';
import CommunicatorPage from './pages/CommunicatorPage';
import { SolutionsPage } from './pages/SolutionsPage';
import ToastDebugButton from './components/ToastDebugButton';
import WebSocketTest from './components/WebSocketTest';
import ChatTestPage from './pages/ChatTestPage';
import { AnnouncementProvider } from './contexts/AnnouncementContext';

function AppContent() {
  const location = useLocation();
  const showNavbar = !['/', '/login', '/register', '/forgot-password', '/pricing', '/features', '/overview', '/about', '/contact', '/enroll', '/security', '/support', '/solutions'].includes(location.pathname);

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
  }, [location.pathname]);  return (
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
      <ToastDebugButton />
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
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
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
        <Route path="/chat-test" element={<ChatTestPage />} />
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
