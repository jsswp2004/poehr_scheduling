import React from 'react';
import { Box } from '@mui/material';
import {
    useAdminAuth,
    useOrganizations,
    useEnvironmentSettings,
    useTabNavigation
} from '../hooks/environment-profile';
import {
    EnvironmentTabs,
    TabContent
} from '../components/environment-profile';

/**
 * EnvironmentProfilePage Component (Refactored)
 * Administrative page for managing environment settings, holidays, and organizations
 * 
 * Features:
 * - Role-based access control (admin/system_admin only)
 * - Tab navigation between different settings sections
 * - Organization selection for system administrators
 * - Blocked days configuration with visual table
 * - Settings persistence with loading/saving states
 * - Integration with holidays and organization management
 */
function EnvironmentProfilePage() {
    // Authentication and role management
    const { userRole, getAuthToken } = useAdminAuth();

    // Tab navigation state
    const { tabKey, handleTabChange } = useTabNavigation('blocked-days');

    // Organization management for system admins
    const {
        organizations,
        selectedOrganization,
        setSelectedOrganization
    } = useOrganizations(userRole, getAuthToken);

    // Environment settings management
    const {
        blockedDays,
        saving,
        status,
        loading,
        handleCheckbox,
        handleSave
    } = useEnvironmentSettings(userRole, selectedOrganization, getAuthToken);

    return (
        <Box
            sx={{
                mt: 0,
                bgcolor: 'background.paper',
            }}
        >
            {/* Tab Navigation */}
            <EnvironmentTabs value={tabKey} onChange={handleTabChange} />

            {/* Tab Content */}
            <TabContent
                tabKey={tabKey}
                userRole={userRole}
                organizations={organizations}
                selectedOrganization={selectedOrganization}
                onOrganizationChange={setSelectedOrganization}
                blockedDays={blockedDays}
                onDayToggle={handleCheckbox}
                loading={loading}
                saving={saving}
                status={status}
                onSave={handleSave}
            />
        </Box>
    );
}

export default EnvironmentProfilePage;
