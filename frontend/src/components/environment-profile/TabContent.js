import React from 'react';
import { Box, Typography } from '@mui/material';
import BlockedDaysTab from './BlockedDaysTab';
import HolidaysTab from '../../pages/HolidaysPage';
import OrganizationManagement from '../OrganizationManagement';

/**
 * TabContent Component
 * Renders the appropriate content based on the selected tab
 */
const TabContent = ({
    tabKey,
    userRole,
    organizations,
    selectedOrganization,
    onOrganizationChange,
    blockedDays,
    onDayToggle,
    loading,
    saving,
    status,
    onSave
}) => {
    if (tabKey === 'blocked-days') {
        return (
            <BlockedDaysTab
                userRole={userRole}
                organizations={organizations}
                selectedOrganization={selectedOrganization}
                onOrganizationChange={onOrganizationChange}
                blockedDays={blockedDays}
                onDayToggle={onDayToggle}
                loading={loading}
                saving={saving}
                status={status}
                onSave={onSave}
            />
        );
    }

    if (tabKey === 'holidays') {
        return <HolidaysTab />;
    }

    if (tabKey === 'organization') {
        return (
            <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Organization Management
                </Typography>
                <OrganizationManagement />
            </Box>
        );
    }

    return null;
};

export default TabContent;
