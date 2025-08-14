import { useState, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { getValidToken, clearAuthData } from '../utils/auth';

export const useRoleValidation = (navigate) => {
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const validateRole = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const token = await getValidToken();
            if (!token) {
                console.log("❌ No token available, redirecting to login");
                clearAuthData();
                navigate('/login');
                return null;
            }

            // Role-based access control check
            try {
                const decoded = jwtDecode(token);
                const role = decoded.role || "";

                if (
                    role !== "admin" &&
                    role !== "system_admin" &&
                    role !== "doctor" &&
                    role !== "registrar" &&
                    role !== "receptionist"
                ) {
                    console.log(`❌ Access denied for role: ${role}`);
                    navigate('/');
                    return null;
                }

                console.log(`✅ Access granted for role: ${role}`);
                setUserRole(role);
                return { token, role };
            } catch (err) {
                console.error("❌ Token decode failed:", err);
                setError(err);
                navigate('/login');
                return null;
            }
        } catch (err) {
            console.error('❌ Role validation failed:', err);
            setError(err);
            clearAuthData();
            navigate('/login');
            return null;
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    const validateRoleWithToken = useCallback(async (token) => {
        setLoading(true);
        setError(null);

        try {
            if (!token) {
                throw new Error('No token provided');
            }

            // Ensure we're working with a string token
            const tokenString = typeof token === 'string' ? token : token.access_token;

            if (!tokenString || typeof tokenString !== 'string') {
                throw new Error('Invalid token format: must be a string');
            }

            // Role-based access control check using provided token
            try {
                const decoded = jwtDecode(tokenString);
                const role = decoded.role || "";

                if (
                    role !== "admin" &&
                    role !== "system_admin" &&
                    role !== "doctor" &&
                    role !== "registrar" &&
                    role !== "receptionist"
                ) {
                    console.log(`❌ Access denied for role: ${role}`);
                    navigate('/');
                    return null;
                }

                console.log(`✅ Access granted for role: ${role} (with provided token)`);
                setUserRole(role);
                return { token: tokenString, role };
            } catch (err) {
                console.error("❌ Token decode failed:", err);
                setError(err);
                throw err;
            }
        } catch (err) {
            console.error('❌ Role validation with token failed:', err);
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    return {
        userRole,
        setUserRole,
        loading,
        error,
        validateRole,
        validateRoleWithToken
    };
};
