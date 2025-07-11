import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

/**
 * Custom hook for handling admin authentication and authorization
 * Ensures only authorized users can access the admin search page
 */
export const useAdminAuth = () => {
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

    const getAuthToken = () => {
        return localStorage.getItem('access_token');
    };

    return {
        getAuthToken
    };
};
