import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import logo from '../assets/POEHR_Logo.png';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';

function Navbar() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const isAuthenticated = !!localStorage.getItem('access_token');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        console.log('Decoded JWT:', decoded);
  
        // ✅ Use `first_name` directly if it's present
        const firstName = decoded.first_name || decoded.username || '';
        setUsername(firstName);
      } catch (err) {
        console.error('Failed to decode JWT:', err);
      }
    }
}, [isAuthenticated]); // ✅ Add this dependency
  

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    toast.info('Logged out!');
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
      <div className="container-fluid">
        <Link to="/" className="navbar-brand d-flex align-items-center">
          <img
            src={logo}
            alt="POEHR Logo"
            style={{ height: '40px', marginRight: '10px', backgroundColor: 'white', padding: '2px', borderRadius: '4px' }}
          />
          POEHR Scheduler
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
              </li>
            )}
            {!isAuthenticated ? (
              <>
                <li className="nav-item">
                  <Link to="/login" className="nav-link">Login</Link>
                </li>
                <li className="nav-item">
                  <Link to="/register" className="nav-link">Register</Link>
                </li>
              </>
            ) : (
              <li className="nav-item">
                <button className="btn btn-outline-light ms-2" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
