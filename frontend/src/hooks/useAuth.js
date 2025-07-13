import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { STORAGE_KEYS } from '../config/constants';

/**
 * Custom hook for authentication state and user info
 */
export const useAuth = () => {
    const [token, setToken] = useState(() =>
        localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    );
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                console.log('🔑 JWT decoded:', { role: decoded.role, roles: decoded.roles, user_id: decoded.user_id });
                const currentUserData = {
                    id: decoded.user_id,
                    role: decoded.role,
                    username: decoded.username || '',
                    first_name: decoded.first_name || '',
                    last_name: decoded.last_name || '',
                    email: decoded.email || '',
                    organization: decoded.organization || '',
                    profile_picture: decoded.profile_picture || '',
                    is_active: decoded.is_active !== undefined ? decoded.is_active : true,
                    roles: decoded.roles || [decoded.role], // Handle both single role and roles array
                };
                console.log('🔑 Setting currentUser:', currentUserData);
                setCurrentUser(currentUserData);
            } catch (error) {
                console.error('Failed to decode token:', error);
                // Invalid token, remove it
                localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
                setToken(null);
                setCurrentUser(null);
            }
        } else {
            setCurrentUser(null);
        }
    }, [token]);

    const updateToken = (newToken) => {
        if (newToken) {
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newToken);
            setToken(newToken);
        } else {
            localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
            setToken(null);
        }
    };

    const logout = () => {
        updateToken(null);
    };

    const isSystemAdmin = currentUser?.role === 'system_admin' ||
        currentUser?.role === 'admin' ||
        (currentUser?.roles && (currentUser.roles.includes('system_admin') || currentUser.roles.includes('admin')));

    // Debug logging for auth
    console.log('🔍 useAuth debug:', {
        currentUser: currentUser,
        role: currentUser?.role,
        roles: currentUser?.roles,
        isSystemAdmin
    });

    return {
        token,
        currentUser,
        updateToken,
        logout,
        isAuthenticated: !!token,
        isSystemAdmin,
    };
};
