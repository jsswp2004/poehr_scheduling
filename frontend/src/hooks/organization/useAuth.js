import { useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';

/**
 * Custom hook for handling user authentication and permissions
 * Manages current user state and role-based access control
 */
export const useAuth = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Permission checks
    const canEdit = currentUser && ['admin', 'system_admin'].includes(currentUser.role);
    const canSearch = currentUser && currentUser.role === 'system_admin';

    const fetchCurrentUser = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setLoading(false);
                return;
            }

            const decodedToken = jwtDecode(token);
            const response = await axios.get(`http://127.0.0.1:8000/api/users/${decodedToken.user_id}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setCurrentUser(response.data);
        } catch (error) {
            console.error('Failed to fetch current user:', error);
            toast.error('Failed to fetch user information');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    return {
        currentUser,
        loading,
        canEdit,
        canSearch,
        fetchCurrentUser
    };
};
