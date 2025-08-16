import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '../components/SimpleToast';
import logo from '../assets/POWER_Logo.png';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { getValidToken, clearAuthData } from '../utils/auth';
import { getAccessToken } from '../utils/tokenManager';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import useForceUpdate from '../utils/useForceUpdate';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChatIcon from '@mui/icons-material/Chat';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Make it stateful
  const [logoUrl, setLogoUrl] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const forceUpdate = useForceUpdate();
  
  // Update authentication state when tokens change
  useEffect(() => {
    const updateAuthState = () => {
      const token = getAccessToken();
      setIsAuthenticated(!!token);
    };
    
    // Set initial state
    updateAuthState();
    
    // Listen for storage changes
    const handleStorageChange = (e) => {
      if (e.key === 'access_token') {
        updateAuthState();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  // Function to fetch user data and update state
  const fetchUserData = async () => {
    try {
      const token = await getValidToken();
      if (!token) {
        setUsername('');
        setRole('');
        setLogoUrl(null);
        setOrganizationName('');
        return;
      }

      const decoded = jwtDecode(token);
      const userId = decoded.user_id;
      const firstName = decoded.first_name || decoded.username || '';
      setUsername(firstName);
      setRole(decoded.role || '');

      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Get organization logo directly from the organization data
      const orgLogo = response.data.organization_logo;
      if (orgLogo) {
        // The organization_logo field from UserSerializer already includes the full URL
        setLogoUrl(orgLogo.startsWith('http') ? orgLogo : `${API_BASE_URL}${orgLogo}`);
      } else {
        setLogoUrl(null);
      }
      setOrganizationName(response.data.organization_name || '');
      // Fix: Only set profilePic if the value is not empty/null and is a valid string
      if (response.data.profile_picture && typeof response.data.profile_picture === 'string' && response.data.profile_picture.trim() !== '') {
        setProfilePic(response.data.profile_picture.startsWith('http') ? response.data.profile_picture : `${API_BASE_URL}${response.data.profile_picture}`);
      } else {
        setProfilePic(null);
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
      // If there's an authentication error, clear the auth data
      if (err.response?.status === 401) {
        clearAuthData();
        setUsername('');
        setRole('');
        setLogoUrl(null);
        setOrganizationName('');
      }
    }
  };  // Run fetchUserData on component mount and when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserData();
    } else {
      // Clear user data when not authenticated
      setUsername('');
      setRole('');
      setLogoUrl(null);
      setOrganizationName('');
      setProfilePic(null);
    }

    // Listen for custom profile update events
    const handleProfileUpdate = () => {
      fetchUserData();
      forceUpdate(); // Force the navbar to re-render
    };

    window.addEventListener('profile-updated', handleProfileUpdate);

    // Force a refresh when authenticated and periodically
    let interval = null;
    if (isAuthenticated) {
      interval = setInterval(() => {
        fetchUserData();
      }, 300000); // Refresh every 5 minutes (300000ms) to reduce API calls
    }

    return () => {
      window.removeEventListener('profile-updated', handleProfileUpdate);
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, forceUpdate]); const handleLogoClick = (e) => {
    e.preventDefault(); // Prevent default link behavior

    // Show confirmation toast instead of browser alert
    toast.warning(
      <div>
        <p><strong>Are you sure you want to log out?</strong></p>
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => performLogout()}
            style={{
              marginRight: '10px',
              padding: '5px 15px',
              backgroundColor: '#d32f2f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Yes, Log Out
          </button>
          <button
            onClick={() => toast.dismiss()}
            style={{
              padding: '5px 15px',
              backgroundColor: '#757575',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>,
      { duration: 0 } // Keep toast open until user decides
    );
  };

  const performLogout = () => {
    // Dismiss any open toasts
    toast.dismiss();

    // Clear all authentication data using the centralized function
    clearAuthData();

    // Also clear any legacy token storage that might exist
    localStorage.removeItem('access_token');  // Old format key
    localStorage.removeItem('refresh_token'); // Old format key
    localStorage.removeItem('user_data');
    sessionStorage.clear();

    // Clear user data
    setUsername('');
    setRole('');
    setLogoUrl(null);
    setOrganizationName('');

    toast.success('Logged out successfully! 👋');

    // Navigate to solutions page and replace history to prevent back button issues
    navigate('/solutions', { replace: true });

    // Clear browser history to ensure no traces
    window.history.replaceState(null, null, '/solutions');
  }; const handleLogout = () => {
    // Show confirmation toast instead of browser alert
    toast.warning(
      <div>
        <p><strong>Are you sure you want to log out?</strong></p>
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => performLogout()}
            style={{
              marginRight: '10px',
              padding: '5px 15px',
              backgroundColor: '#d32f2f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Yes, Log Out
          </button>
          <button
            onClick={() => toast.dismiss()}
            style={{
              padding: '5px 15px',
              backgroundColor: '#757575',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>,
      { duration: 0 } // Keep toast open until user decides
    );
  };

  const isSystemAdmin = role === 'system_admin';

  // Add greeting function
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <AppBar position="fixed" color="primary" sx={{ zIndex: 1201 }}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', minHeight: 64 }}>        <Box
        sx={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}
        onClick={handleLogoClick}
      >
        <Avatar
          src={logoUrl || logo}
          alt="Logo"
          sx={{ height: 40, width: 40, bgcolor: 'white', mr: 1, borderRadius: 1, p: 0.5 }}
          variant="rounded"
          onError={(e) => {
            console.warn('Failed to load organization logo, falling back to default logo');
            e.target.src = logo;
          }}
        />          <Typography variant="h6" noWrap sx={{ color: 'white', fontWeight: 450, letterSpacing: 1, fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
          {location.pathname === '/communicator' ? 'POWER Communicator' :
            location.pathname === '/dashboard' ? 'POWER Portal' : 'POWER Scheduler'}
        </Typography>
        {organizationName && (
          <Typography variant="h6" noWrap sx={{ color: 'white', fontWeight: 450, ml: 2, flex: 1, textAlign: 'center', fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif' }}>
            {organizationName}
          </Typography>
        )}
      </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isAuthenticated && (
            <>
              {/* Communicator Icon Link - for all authenticated users except patients and not on communicator or dashboard page */}
              {role !== 'patient' && location.pathname !== '/communicator' && location.pathname !== '/dashboard' && (
                <Tooltip title="POWER Communicator">
                  <IconButton
                    color="inherit"
                    sx={{ mr: 1 }}
                    onClick={() => navigate('/communicator')}
                    aria-label="Communicator"
                  >
                    <ChatIcon sx={{ color: 'white' }} />
                  </IconButton>
                </Tooltip>
              )}

              {/* Admin Icon Link - only for admin, registrar, receptionist, system_admin and not on dashboard page */}
              {(role === 'admin' || role === 'registrar' || role === 'receptionist' || role === 'system_admin') &&
                location.pathname !== '/dashboard' && (
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

              {/* Account Icon Link - only for admin and system_admin */}
              {(role === 'admin' || role === 'system_admin') && (
                <Tooltip title="Account Settings">
                  <IconButton
                    color="inherit"
                    sx={{ mr: 1 }}
                    onClick={() => navigate('/account')}
                    aria-label="Account Settings"
                  >
                    <AccountCircleIcon sx={{ color: 'white' }} />
                  </IconButton>
                </Tooltip>
              )}
              <Button
                color="inherit"
                sx={{
                  textTransform: 'none',
                  fontWeight: 450,
                  fontSize: '1rem',
                  mr: 2,
                  pl: 1,
                  pr: 1,
                  color: 'white',
                  '& .MuiAvatar-root': { bgcolor: 'primary.light', color: 'primary.contrastText' },
                  '& .navbar-username': { color: 'white' },
                }}
                endIcon={
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
                <span className="navbar-username">{getGreeting()}, {username}</span>
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
                <FontAwesomeIcon icon={faSignOutAlt} size="lg" />
              </IconButton>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
