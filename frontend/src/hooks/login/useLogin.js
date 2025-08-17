import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from '../../components/SimpleToast';
import { notifyProfileUpdated, refreshAuthState } from '../../utils/events';
import { storeTokens } from '../../utils/tokenManager';
import { API_BASE_URL } from '../../config/api';

/**
 * Custom hook for managing login functionality
 * Handles form state, authentication, and role-based navigation
 */
export const useLogin = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const redirectTo = searchParams.get('redirect');

    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });

    const [loading, setLoading] = useState(false);

    // Check if user just logged out
    useEffect(() => {
        const justLoggedOut = sessionStorage.getItem('just_logged_out');
        if (justLoggedOut) {
            sessionStorage.removeItem('just_logged_out');
        }

        // Check for cancellation message in URL params
        const urlParams = new URLSearchParams(window.location.search);
        const cancelled = urlParams.get('cancelled');
        const message = urlParams.get('message');

        if (cancelled === 'true' && message) {
            toast.error(decodeURIComponent(message));
            // Clean up the URL
            window.history.replaceState(null, null, window.location.pathname);
        }
    }, []);

    // Handle form input changes
    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    // Role-based navigation logic
    const handleRoleBasedNavigation = (userRole) => {
        console.log('Login Debug - User role:', userRole);
        console.log('Login Debug - Redirect parameter:', redirectTo);

        if (redirectTo === 'communicator') {
            console.log('Login Debug - Redirecting to communicator path');
            // Check if user has admin privileges for communicator
            if (userRole === 'admin' || userRole === 'system_admin' || userRole === 'registrar') {
                navigate('/communicator');
            } else {
                toast.error('Access denied. Communicator requires admin privileges.');
                navigate('/dashboard');
            }
        } else if (redirectTo === 'portal') {
            console.log('Login Debug - Portal redirect requested, but checking role first');
            // For portal redirect, still respect admin/system_admin roles
            if (userRole === 'admin' || userRole === 'system_admin') {
                console.log('Login Debug - Admin/System Admin detected, overriding portal redirect to go to /admin');
                navigate('/admin');
            } else {
                console.log('Login Debug - Non-admin user, going to dashboard as requested');
                navigate('/dashboard');
            }
        } else {
            console.log('Login Debug - Using default role-based redirect');
            // Default role-based redirect
            if (userRole === 'admin' || userRole === 'system_admin') {
                console.log('Login Debug - Admin/System Admin detected, going to /admin');
                navigate('/admin');
            } else if (userRole === 'doctor') {
                console.log('Login Debug - Doctor detected, going to /patients');
                navigate('/patients');
            } else if (userRole === 'registrar') {
                console.log('Login Debug - Registrar detected, going to /patients');
                navigate('/patients');
            } else {
                console.log('Login Debug - Default case, going to /dashboard');
                navigate('/dashboard'); // Default for patients
            }
        }
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/users/login/`, formData);
            const { access, refresh } = response.data;

            // Store tokens using centralized token manager
            storeTokens(access, refresh);
            axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

            // Decode token to get role
            const decoded = jwtDecode(access);
            console.log('Login Debug - Decoded JWT token:', decoded);
            const userRole = decoded.role;
            console.log('Login Debug - User role from token:', userRole);

            // Notify navbar to refresh with new user data
            notifyProfileUpdated();
            refreshAuthState();

            // Manually trigger storage event for immediate Navbar update
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'access_token',
                newValue: JSON.stringify({ token: access })
            }));

            toast.success('Login successful!');

            // Navigate based on role and redirect parameters
            handleRoleBasedNavigation(userRole);

        } catch (error) {
            console.error(error.response?.data || error.message);
            toast.error('Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return {
        formData,
        loading,
        handleChange,
        handleSubmit,
    };
};
