import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import BackButton from '../components/BackButton';

function MessagesPage() {
  const [tab, setTab] = useState('email');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || '';
      if (role !== 'admin' && role !== 'system_admin' && role !== 'registrar') {
        navigate('/');
      }
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <Box sx={{ mt: 4, p: 3, bgcolor: 'background.paper', boxShadow: 2, borderRadius: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Communications
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mb: 2,
          borderRadius: 2,
          bgcolor: '#f5faff',
          boxShadow: 1,
          minHeight: 48,
          p: 1,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, val) => setTab(val)}
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
          <Tab label="Email" value="email" />
          <Tab label="SMS" value="sms" />
        </Tabs>
        <Box sx={{ ml: 1 }}>
          <BackButton to="/admin" />
        </Box>
      </Box>
      {tab === 'email' && (
        <Typography variant="body1" sx={{ p: 2 }}>
          Email messaging coming soon.
        </Typography>
      )}
      {tab === 'sms' && (
        <Typography variant="body1" sx={{ p: 2 }}>
          SMS messaging coming soon.
        </Typography>
      )}
    </Box>
  );
}

export default MessagesPage;
