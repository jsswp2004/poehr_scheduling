// src/pages/AdminPage.js
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Button, Box, Typography, Divider } from '@mui/material';
import { FaTools, FaCalendarCheck, FaUserCog, FaSearch, FaEnvelope } from 'react-icons/fa';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';

function AdminPage() {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState('');

  // Role check for admin/system_admin/registrar
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin' && role !== 'registrar') {
        navigate('/');
      }
      // Store the user role
      setUserRole(role);
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', mt: 8 }}>
      <Card elevation={6} sx={{ textAlign: 'center', borderRadius: 3 }}>        <CardContent>
          <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
            Management Portal
          </Typography>
          <Divider sx={{ mb: 4 }} />
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 3
          }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={() => navigate('/patients')}
              sx={{
                width: 120,
                height: 120,
                flexDirection: 'column',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <FaCalendarCheck size={24} style={{ marginBottom: 8 }} />
              Calendar Dashboard
            </Button>            {(userRole === 'admin' || userRole === 'system_admin') && (
              <Button
                variant="contained"
                color="success"
                size="large"
                onClick={() => navigate('/settings')}
                sx={{
                  width: 120,
                  height: 120,
                  flexDirection: 'column',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}
              >
                <FaTools size={24} style={{ marginBottom: 8 }} />
                Settings
              </Button>
            )}            {(userRole === 'admin' || userRole === 'system_admin') && (
              <Button
                variant="contained"
                color="secondary"
                size="large"
                onClick={() => navigate('/profile')}
                sx={{
                  width: 120,
                  height: 120,
                  flexDirection: 'column',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}
              >
                <FaUserCog size={24} style={{ marginBottom: 8 }} />
                Profile
              </Button>
            )}
            <Button
              variant="contained"
              color="info"
              size="large"
              onClick={() => navigate('/admin-user-search')}
              sx={{
                width: 120,
                height: 120,
                flexDirection: 'column',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <FaSearch size={24} style={{ marginBottom: 8 }} />
              Appointment Search
            </Button>
            <Button
              variant="contained"
              color="warning"
              size="large"
              onClick={() => navigate('/messages')}
              sx={{
                width: 120,
                height: 120,
                flexDirection: 'column',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}            >
              <FaEnvelope size={24} style={{ marginBottom: 8 }} />
              Messages
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default AdminPage;
