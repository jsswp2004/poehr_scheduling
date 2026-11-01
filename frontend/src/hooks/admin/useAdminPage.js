import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { moduleEnabled } from '../../utils/orgModules';
import { ADMIN_TOOLS } from './adminTools';

/**
 * Custom hook for managing admin page functionality
 * Handles role verification and navigation logic
 */
export const useAdminPage = () => {
    const navigate = useNavigate();
    const [userRole, setUserRole] = useState('');
    const [loading, setLoading] = useState(true);

    // Admin navigation items configuration. `group` and `description` drive the portal layout.
    const adminNavItems = ADMIN_TOOLS;

    // Role check and authentication
    useEffect(() => {
        const checkUserRole = () => {
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
                    return;
                }

                setUserRole(role);
            } catch (err) {
                navigate('/login');
            } finally {
                setLoading(false);
            }
        };

        checkUserRole();
    }, [navigate]);

    // Filter navigation items based on user role
    const getVisibleNavItems = () => {
        return adminNavItems.filter(item =>
            item.requiredRoles.includes(userRole) && moduleEnabled(item.module)
        );
    };

    // Handle navigation to different admin sections
    const handleNavigate = (path) => {
        navigate(path);
    };

    return {
        userRole,
        loading,
        visibleNavItems: getVisibleNavItems(),
        handleNavigate,
    };
};
