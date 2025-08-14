import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

/**
 * Custom hook for managing admin page functionality
 * Handles role verification and navigation logic
 */
export const useAdminPage = () => {
    const navigate = useNavigate();
    const [userRole, setUserRole] = useState('');
    const [loading, setLoading] = useState(true);

    // Admin navigation items configuration
    const adminNavItems = [
        {
            id: 'calendar',
            label: 'Calendar Dashboard',
            icon: 'FaCalendarCheck',
            path: '/patients',
            color: 'primary',
            requiredRoles: ['admin', 'system_admin', 'registrar']
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: 'FaTools',
            path: '/settings',
            color: 'success',
            requiredRoles: ['admin', 'system_admin']
        },
        {
            id: 'profile',
            label: 'Profile',
            icon: 'FaUserCog',
            path: '/profile',
            color: 'secondary',
            requiredRoles: ['admin', 'system_admin']
        },
        {
            id: 'search',
            label: 'Appointment Search',
            icon: 'FaSearch',
            path: '/admin-user-search',
            color: 'info',
            requiredRoles: ['admin', 'system_admin', 'registrar']
        },
        {
            id: 'messages',
            label: 'Messages',
            icon: 'FaEnvelope',
            path: '/messages',
            color: 'warning',
            requiredRoles: ['admin', 'system_admin', 'registrar']
        }
    ];

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
            item.requiredRoles.includes(userRole)
        );
    };

    // Handle navigation to different admin sections
    const handleNavigate = (path) => {
        console.log('🚀 AdminPage navigating to:', path);
        console.log('🔑 Current token exists:', !!localStorage.getItem('access_token'));
        console.log('👤 Current user role:', userRole);
        console.log('🌍 Current URL:', window.location.href);
        console.log('🔧 Environment:', process.env.NODE_ENV);
        console.log('📡 API Base URL:', process.env.REACT_APP_API_URL || 'default');
        
        // Try to decode and log token info (safely)
        try {
            const token = localStorage.getItem('access_token');
            if (token) {
                const decoded = jwtDecode(token);
                console.log('🔍 Token decoded:', {
                    role: decoded.role,
                    exp: new Date(decoded.exp * 1000),
                    user_id: decoded.user_id,
                    isExpired: decoded.exp * 1000 < Date.now()
                });
            }
        } catch (e) {
            console.error('❌ Error decoding token:', e);
        }
        
        navigate(path);
    };

    return {
        userRole,
        loading,
        visibleNavItems: getVisibleNavItems(),
        handleNavigate,
    };
};
