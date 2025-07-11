import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

/**
 * Custom hook for handling admin authentication and role management
 * Ensures only admin and system_admin users can access the page
 */
export const useAdminAuth = () => {
    const [userRole, setUserRole] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        // Role-based access control for admin and system_admin only
        const token = localStorage.getItem('access_token');
        if (!token) {
            navigate('/login');
            return;
        }
        try {
            const decoded = jwtDecode(token);
            const role = decoded.role || '';
            setUserRole(role);
            if (role !== 'admin' && role !== 'system_admin') {
                navigate('/');
            }
        } catch (err) {
            navigate('/login');
        }
    }, [navigate]);

    const getAuthToken = () => {
        return localStorage.getItem('access_token');
    };

    return {
        userRole,
        getAuthToken
    };
};
