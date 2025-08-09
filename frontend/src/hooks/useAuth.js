import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { getAccessToken, storeTokens, clearTokens } from '../utils/tokenManager';

/**
 * Custom hook for authentication state and user info
 */
export const useAuth = () => {
    const [token, setToken] = useState(() =>
        getAccessToken()
    );
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const currentUserData = {
                    id: decoded.user_id,
                    role: decoded.role,
                    username: decoded.username || '',
                    first_name: decoded.first_name || '',
                    last_name: decoded.last_name || '',
                    email: decoded.email || '',
                    organization: decoded.organization || '',
                    profile_picture: decoded.profile_picture || '',
                    phone_number: decoded.phone_number || '',
                    sms_consent: decoded.sms_consent || false,
                    is_active: decoded.is_active !== undefined ? decoded.is_active : true,
                    roles: decoded.roles || [decoded.role], // Handle both single role and roles array
                };
                setCurrentUser(currentUserData);
            } catch (error) {
                console.error('Failed to decode token:', error);
                // Invalid token, remove it
                clearTokens();
                setToken(null);
                setCurrentUser(null);
            }
        } else {
            setCurrentUser(null);
        }
    }, [token]);

    // Listen for profile updates
    useEffect(() => {
        const handleProfileUpdated = (event) => {
            if (event.detail && currentUser) {
                setCurrentUser(prev => ({
                    ...prev,
                    ...event.detail
                }));
            }
        };

        window.addEventListener('profile-updated', handleProfileUpdated);
        return () => window.removeEventListener('profile-updated', handleProfileUpdated);
    }, [currentUser]);

    const updateToken = (newToken) => {
        if (newToken) {
            storeTokens(newToken, null); // Store access token, keep existing refresh token
            setToken(newToken);
        } else {
            clearTokens();
            setToken(null);
        }
    };

    const logout = () => {
        updateToken(null);
    };

    const isSystemAdmin = currentUser?.role === 'system_admin' ||
        currentUser?.role === 'admin' ||
        (currentUser?.roles && (currentUser.roles.includes('system_admin') || currentUser.roles.includes('admin')));

    return {
        token,
        currentUser,
        updateToken,
        logout,
        isAuthenticated: !!token,
        isSystemAdmin,
    };
};
