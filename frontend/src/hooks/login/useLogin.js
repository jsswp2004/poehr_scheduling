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
        if (redirectTo === 'communicator') {
            // Check if user has admin privileges for communicator
            if (userRole === 'admin' || userRole === 'system_admin' || userRole === 'registrar') {
                navigate('/communicator');
            } else {
                toast.error('Access denied. Communicator requires admin privileges.');
                navigate('/dashboard');
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

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API_BASE_URL}/auth/login/`, formData);
            const { access, refresh } = response.data;

            // Store tokens using centralized token manager
            storeTokens(access, refresh);
            axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

            // Decode token to get role
            const decoded = jwtDecode(access);
            const userRole = decoded.role;

            // Notify navbar to refresh with new user data
            notifyProfileUpdated();
            refreshAuthState();

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
