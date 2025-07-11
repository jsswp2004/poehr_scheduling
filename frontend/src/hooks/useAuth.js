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
                setCurrentUser({
                    id: decoded.user_id,
                    role: decoded.role,
                    // Add other decoded fields as needed
                });
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

    return {
        token,
        currentUser,
        updateToken,
        logout,
        isAuthenticated: !!token,
    };
};
