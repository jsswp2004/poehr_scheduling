import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import logo from '../assets/POWER_Logo.png';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import axios from 'axios';

function Navbar() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState(''); // <-- ADDED for role detection
  const isAuthenticated = !!localStorage.getItem('access_token');
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
      const decoded = jwtDecode(token);
      console.log('Decoded JWT:', decoded); 
      const userId = decoded.user_id;
      const firstName = decoded.first_name || decoded.username || '';
      setUsername(firstName);
      setRole(decoded.role || ''); // <-- Store role in state

      axios.get(`http://127.0.0.1:8000/api/users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        const orgLogo = res.data.organization_logo;
        if (orgLogo) {
          setLogoUrl(`http://127.0.0.1:8000${orgLogo}`);
        }
      })
      .catch(err => {
        console.error('Failed to load organization logo:', err);
      });
    } catch (err) {
      console.error('Failed to decode JWT:', err);
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    toast.info('Logged out!');
    navigate('/login');
  };

  // --- System Admin flag for conditional rendering ---
  const isSystemAdmin = role === 'system_admin';

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary fixed-top">
      <div className="container-fluid">
        <Link to="/" className="navbar-brand d-flex align-items-center">
          <img
            src={logoUrl || logo}
            alt="Logo"
            style={{ height: '40px', marginRight: '10px', backgroundColor: 'white', padding: '2px', borderRadius: '4px' }}
          />
          POWER Scheduler
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarContent"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div className="collapse navbar-collapse" id="navbarContent">
          <ul className="navbar-nav ms-auto align-items-center">
            {isAuthenticated && (
              <li className="nav-item text-white me-3">
                👋 Hello, <strong>{username}</strong>
                {isSystemAdmin && (
                  <span style={{
                    background: '#fff',
                    color: '#0d6efd',
                    fontWeight: 700,
                    fontSize: '0.95em',
                    borderRadius: '7px',
                    padding: '2px 8px',
                    marginLeft: '9px',
                    border: '2px solid #0d6efd'
                  }}>
                    System Admin
                  </span>
                )}
              </li>
            )}
            {!isAuthenticated ? (
              <>
                {/*<li className="nav-item">
                  <Link to="/login" className="nav-link">Login</Link>
                </li>
                <li className="nav-item">
                  <Link to="/register" className="nav-link">Register</Link>
                </li>*/}
              </>
            ) : (
              <li className="nav-item">
                <button className="btn btn-outline-light ms-2" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            )}
            {/* --- EXAMPLE: If you want to show a menu item for System Admin only:
            {isSystemAdmin && (
              <li className="nav-item">
                <Link to="/system-admin" className="nav-link">SysAdmin Dashboard</Link>
              </li>
            )}
            */}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
