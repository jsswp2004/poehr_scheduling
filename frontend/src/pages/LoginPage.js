import { toast } from '../components/SimpleToast'; 
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from "jwt-decode";
import { Link } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { notifyProfileUpdated, refreshAuthState } from '../utils/events';


function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  
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

      // Store tokens
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;      // Decode token to get role
      const decoded = jwtDecode(access);
      const userRole = decoded.role;      // Notify navbar to refresh with new user data
      notifyProfileUpdated();
      refreshAuthState();

      toast.success('Login successful!');

      // Redirect based on role
      if (userRole === 'admin' || userRole === 'system_admin') {
        navigate('/admin');
      } else if (userRole === 'doctor') {
        navigate('/patients');
      } else if (userRole === 'registrar') {
        navigate('/patients');
      } else {
        navigate('/dashboard'); // Default for patients
      }    } catch (error) {
      console.error(error.response?.data || error.message);
      toast.error('Login failed. Please check your credentials.');
    }
  };

  return (
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
  );
}

export default LoginPage;
