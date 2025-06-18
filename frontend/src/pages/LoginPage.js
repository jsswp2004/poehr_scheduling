import { toast } from '../components/SimpleToast'; 
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jwtDecode } from "jwt-decode";
import { Link } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { notifyProfileUpdated, refreshAuthState } from '../utils/events';
import { storeTokens } from '../utils/tokenManager';
import FirstLoginPasswordModal from '../components/FirstLoginPasswordModal';


function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect'); // Get redirect parameter from URL
    const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  const [showFirstLoginModal, setShowFirstLoginModal] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  
  // Check if we just logged out
  useEffect(() => {
    const justLoggedOut = sessionStorage.getItem('just_logged_out');
    if (justLoggedOut) {
      // Clear the flag
      sessionStorage.removeItem('just_logged_out');
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/auth/login/', formData);
      const { access, refresh } = response.data;

      // Store tokens using centralized token manager
      storeTokens(access, refresh);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

      // Decode token to get role
      const decoded = jwtDecode(access);
      const userRole = decoded.role;

      // Fetch user details to check first login status
      const userResponse = await axios.get('http://127.0.0.1:8000/api/users/me/', {
        headers: { Authorization: `Bearer ${access}` }
      });
      
      const userData = userResponse.data;
      setUserInfo(userData);

      // Check if this is a first-time login
      if (!userData.first_login_completed) {
        setShowFirstLoginModal(true);
        return; // Don't navigate yet, wait for password change
      }

      // If first login is completed, proceed with normal navigation
      proceedAfterLogin(userRole);

    } catch (error) {
      console.error(error.response?.data || error.message);
      toast.error('Login failed. Please check your credentials.');
    }
  };

  const proceedAfterLogin = (userRole) => {
    // Notify navbar to refresh with new user data
    notifyProfileUpdated();
    refreshAuthState();

    toast.success('Login successful!');

    // Check if there's a specific redirect parameter
    if (redirectTo === 'communicator') {
      // Check if user has admin privileges for communicator
      if (userRole === 'admin' || userRole === 'system_admin' || userRole === 'registrar') {
        navigate('/communicator');
      } else {
        toast.error('Access denied. Communicator requires admin privileges.');
        navigate('/dashboard'); // Redirect to default page for non-admin users
      }
    } else if (redirectTo === 'portal') {
      // Always redirect to dashboard for portal access
      navigate('/dashboard');
    } else {
      // Default role-based redirect
      if (userRole === 'admin' || userRole === 'system_admin') {
        navigate('/admin');
      } else if (userRole === 'doctor') {
        navigate('/patients');
      } else if (userRole === 'registrar') {
        navigate('/patients');
      } else {
        navigate('/dashboard'); // Default for patients
      }
    }
  };
  const handleFirstLoginComplete = () => {
    setShowFirstLoginModal(false);
    // Get user role from stored user info
    const userRole = userInfo?.role;
    proceedAfterLogin(userRole);
  };

  return (
    <>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f5f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card sx={{ maxWidth: 400, width: '100%', boxShadow: 6, borderRadius: 3, p: 1 }}>
          <CardContent>
            <Typography variant="h5" align="center" sx={{ mb: 2, fontWeight: 700, color: 'primary.main' }}>
              Login
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                fullWidth
                label="User"
                name="username"
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                required
                size="medium"
              />
              <TextField
                margin="normal"
                fullWidth
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                required
                size="medium"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="primary"
                size="large"
                sx={{ mt: 2, mb: 1, fontWeight: 700 }}
              >
                Login
              </Button>
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Link to="/forgot-password" style={{ display: 'block', marginBottom: 8, color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>
                  Forgot Password?
                </Link>
                <Typography variant="body2" component="span">
                  Don't have an account?{' '}
                  <Link to="/register" style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>
                    Sign up
                  </Link>
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* First Login Password Change Modal */}
      <FirstLoginPasswordModal
        open={showFirstLoginModal}
        onPasswordChanged={handleFirstLoginComplete}
      />
    </>
  );
}

export default LoginPage;
