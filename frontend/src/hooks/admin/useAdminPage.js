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

    // Admin navigation items configuration. `group` and `description` drive the portal layout.
    const adminNavItems = [
        { id: 'calendar', label: 'Calendar Dashboard', description: "Today's schedule and patient charts", group: 'daily', icon: 'FaCalendarCheck', path: '/patients', requiredRoles: ['admin', 'system_admin', 'registrar'] },
        { id: 'search', label: 'Appointment Search', description: 'Find any appointment', group: 'daily', icon: 'FaSearch', path: '/admin-user-search', requiredRoles: ['admin', 'system_admin', 'registrar'] },
        { id: 'messages', label: 'Messages', description: 'Staff and patient messages', group: 'daily', icon: 'FaEnvelope', path: '/messages', requiredRoles: ['admin', 'system_admin', 'registrar'] },
        { id: 'check-in', label: 'Check-in', description: 'Mark arriving patients as arrived', group: 'daily', icon: 'FaUserCheck', path: '/check-in', isNew: true, requiredRoles: ['admin', 'system_admin', 'registrar'] },
        { id: 'note-builder', label: 'Note Builder', description: 'Clinical note templates', group: 'build', icon: 'FaClipboardList', path: '/note-builder', requiredRoles: ['admin', 'system_admin'] },
        { id: 'flowsheet-builder', label: 'Flowsheet Builder', description: 'Flowsheet rows and rules', group: 'build', icon: 'FaTable', path: '/flowsheet-builder', requiredRoles: ['admin', 'system_admin'] },
        { id: 'status-board-builder', label: 'Status Board Builder', description: 'Status boards for your units', group: 'build', icon: 'FaColumns', path: '/status-board-builder', requiredRoles: ['admin', 'system_admin'] },
        { id: 'order-builder', label: 'Order Builder', description: 'Orders and order sets', group: 'build', icon: 'FaClipboardCheck', path: '/order-builder', requiredRoles: ['admin', 'system_admin'] },
        { id: 'triage-settings', label: 'Triage Settings', description: 'Triage scales and prompts', group: 'build', icon: 'FaHeartbeat', path: '/triage-settings', requiredRoles: ['admin', 'system_admin'] },
        { id: 'location-manager', label: 'Location Manager', description: 'Facilities, units and rooms', group: 'facility', icon: 'FaHospital', path: '/location-manager', requiredRoles: ['admin', 'system_admin'] },
        { id: 'settings', label: 'Settings', description: 'Clinic settings', group: 'facility', icon: 'FaTools', path: '/settings', requiredRoles: ['admin', 'system_admin'] },
        { id: 'profile', label: 'Profile', description: 'Your account', group: 'facility', icon: 'FaUserCog', path: '/profile', requiredRoles: ['admin', 'system_admin'] },
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
        navigate(path);
    };

    return {
        userRole,
        loading,
        visibleNavItems: getVisibleNavItems(),
        handleNavigate,
    };
};
