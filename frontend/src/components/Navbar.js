import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import logo from '../assets/POWER_Logo.png';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import axios from 'axios';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import useForceUpdate from '../utils/useForceUpdate';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

function Navbar() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const isAuthenticated = !!localStorage.getItem('access_token');
  const [logoUrl, setLogoUrl] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const forceUpdate = useForceUpdate();
  // Function to fetch user data and update state
  const fetchUserData = () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUsername('');
      setRole('');
      setLogoUrl(null);
      setOrganizationName('');
      return;
    }

    try {
      const decoded = jwtDecode(token);
      const userId = decoded.user_id;
      const firstName = decoded.first_name || decoded.username || '';
      setUsername(firstName);
      setRole(decoded.role || '');

      axios.get(`http://127.0.0.1:8000/api/users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        const orgLogo = res.data.organization_logo;
        if (orgLogo) {
          setLogoUrl(`http://127.0.0.1:8000${orgLogo}`);
        } else {
          setLogoUrl(null);
        }
        setOrganizationName(res.data.organization_name || '');
        // Fix: Only set profilePic if the value is not empty/null and is a valid string
        if (res.data.profile_picture && typeof res.data.profile_picture === 'string' && res.data.profile_picture.trim() !== '') {
          setProfilePic(res.data.profile_picture.startsWith('http') ? res.data.profile_picture : `http://127.0.0.1:8000${res.data.profile_picture}`);
        } else {
          setProfilePic(null);
        }
      })
      .catch(err => {
        console.error('Failed to load organization logo:', err);
        setLogoUrl(null); // Reset logo on error
      });
    } catch (err) {
      console.error('Failed to decode JWT:', err);
      setLogoUrl(null); // Reset logo on error
    }
  };  // Run fetchUserData on component mount and when authentication changes
  useEffect(() => {
    fetchUserData();

    // Set up an event listener for storage changes (like tokens being updated)
    const handleStorageChange = (e) => {
      if (e.key === 'access_token') {
        fetchUserData();
      }
    };

    // Listen for custom profile update events
    const handleProfileUpdate = () => {
      fetchUserData();
      forceUpdate(); // Force the navbar to re-render
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('profile-updated', handleProfileUpdate);
    
    // Force a refresh when the component mounts and periodically
    const interval = setInterval(() => {
      fetchUserData();
    }, 30000); // Refresh every 30 seconds to catch any changes
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('profile-updated', handleProfileUpdate);
      clearInterval(interval);
    };
  }, [isAuthenticated]);
  
  const handleLogout = () => {
    // Store a flag indicating we just logged out
    sessionStorage.setItem('just_logged_out', 'true');
    
    // Remove tokens
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // Clear user data on logout
    setUsername('');
    setRole('');
    setLogoUrl(null);
    setOrganizationName('');
    
    toast.info('Logged out!');
    navigate('/login');
  };

  const isSystemAdmin = role === 'system_admin';

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <AppBar position="fixed" color="primary" sx={{ zIndex: 1201 }}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', minHeight: 64 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flex: 1 }} component={Link} to="/">
          <Avatar
            src={logoUrl || logo}
            alt="Logo"
            sx={{ height: 40, width: 40, bgcolor: 'white', mr: 1, borderRadius: 1, p: 0.5 }}
            variant="rounded"
          />
          <Typography variant="h6" noWrap sx={{ color: 'white', fontWeight: 700, letterSpacing: 1, fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
            POWER Scheduler
          </Typography>
          {organizationName && (
            <Typography variant="h6" noWrap sx={{ color: 'white', fontWeight: 700, ml: 2, flex: 1, textAlign: 'center', fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
              {organizationName}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isAuthenticated && (
            <>
              {/* Admin Icon Link - only for admin, registrar, receptionist, system_admin */}
              {(role === 'admin' || role === 'registrar' || role === 'receptionist' || role === 'system_admin') && (
                <Tooltip title="Management Portal">
                  <IconButton
                    color="inherit"
                    sx={{ mr: 1 }}
                    onClick={() => navigate('/admin/')}
                    aria-label="Admin Panel"
                  >
                    <AdminPanelSettingsIcon sx={{ color: 'white' }} />
                  </IconButton>
                </Tooltip>
              )}
              <Button
                color="inherit"
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  mr: 2,
                  pl: 1,
                  pr: 1,
                  color: 'white',
                  '& .MuiAvatar-root': { bgcolor: 'primary.light', color: 'primary.contrastText' },
                  '& .navbar-username': { color: 'white' },
                }}
                startIcon={
                  <Avatar
                    sx={{ width: 28, height: 28, bgcolor: 'primary.light', color: 'primary.contrastText' }}
                    src={profilePic || undefined}
                  >
                    {!profilePic && (username?.[0]?.toUpperCase() || '?')}
                  </Avatar>
                }
                disableRipple
                disabled
              >
                <span className="navbar-username">{username}</span>
                {isSystemAdmin && (
                  <Box component="span" sx={{
                    background: 'white',
                    color: '#1976d2',
                    fontWeight: 700,
                    fontSize: '0.95em',
                    borderRadius: '7px',
                    px: 1.5,
                    ml: 1.5,
                    border: '2px solid',
                    borderColor: '#1976d2',
                    display: 'inline-block',
                  }}>
                    System Admin
                  </Box>
                )}
              </Button>
              <IconButton
                onClick={handleLogout}
                color="inherit"
                sx={{
                  ml: 1,
                  color: 'white',
                  border: '2px solid #1976d2',
                  borderRadius: 1,
                  p: 1,
                  transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                  '&:hover': {
                    background: 'rgba(211, 47, 47, 0.10)', // red tint
                    color: '#d32f2f', // MUI error.main
                    borderColor: '#d32f2f',
                    boxShadow: '0 0 0 2px #d32f2f33',
                    cursor: 'pointer',
                  },
                }}
                title="Logout"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </IconButton>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
