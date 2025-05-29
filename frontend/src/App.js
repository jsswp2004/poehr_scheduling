import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import AdminPage from './pages/AdminPage'; 
import ProfilePage from './pages/ProfilePage'; 
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import MaintenancePage from './pages/MaintenancePage'; 
import CreateProfilePage from './pages/CreateProfilePage';
import SettingsPage from './pages/SettingsPage'; // adjust path if needed
import HolidaysTab from './pages/HolidaysPage';
import EnvironmentProfilePage from './pages/EnvironmentProfilePage';
import AdminUserSearchPage from './pages/AdminUserSearchPage';
import EditAppointmentPage from './pages/EditAppointmentPage';



function App() {
  return (
    <Router>
      <Navbar />
      <ToastContainer position="top-center" />
      <Routes>
        <Route path="/" element={ <PrivateRoute> <DashboardPage /> </PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} /> {/* ✅ Added */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} /> {/* ✅ Added */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/maintenance" element={<PrivateRoute><MaintenancePage /></PrivateRoute>} />
        <Route path="/create-profile" element={<PrivateRoute><CreateProfilePage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="/holidays" element={<PrivateRoute><HolidaysTab /></PrivateRoute>} />
        <Route path="/environment" element={<PrivateRoute><EnvironmentProfilePage /></PrivateRoute>} />
        <Route path="/admin-user-search" element={<PrivateRoute><AdminUserSearchPage /></PrivateRoute>} />
        <Route path="/appointments/:id/edit" element={<EditAppointmentPage />} />
        {/* Add more routes as needed */}







      </Routes>
    </Router>
  );
}

export default App;
