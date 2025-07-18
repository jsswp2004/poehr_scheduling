import React from 'react';
import { useAdminPage } from '../hooks/admin';
import { AdminContainer } from '../components/admin';

/**
 * AdminPage - Refactored
 * 
 * Main page component for admin management portal.
 * This refactored version separates role logic into a custom hook
 * and UI components for better maintainability.
 * 
 * Features:
 * - Role-based access control (admin, system_admin, registrar)
 * - Dynamic navigation based on user permissions
 * - Clean navigation grid with icons
 * - Loading states and authentication
 * 
 * Hooks Used:
 * - useAdminPage: Manages role verification and navigation logic
 * 
 * Components Used:
 * - AdminContainer: Main page layout and navigation grid
 */
function AdminPage() {
    // All admin logic handled by hook
    const adminLogic = useAdminPage();

    return <AdminContainer {...adminLogic} />;
}

export default AdminPage;
