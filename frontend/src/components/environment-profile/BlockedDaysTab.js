import React from 'react';
import { Box } from '@mui/material';
import OrganizationSelector from './OrganizationSelector';
import BlockedDaysTable from './BlockedDaysTable';
import SaveSection from './SaveSection';

/**
 * BlockedDaysTab Component
 * Main component for the blocked days configuration tab
 */
const BlockedDaysTab = ({
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
    return (
        <Box sx={{ p: 2 }}>
            <OrganizationSelector
                userRole={userRole}
                organizations={organizations}
                selectedOrganization={selectedOrganization}
                onOrganizationChange={onOrganizationChange}
                loading={loading}
                saving={saving}
            />

            <BlockedDaysTable
                blockedDays={blockedDays}
                onDayToggle={onDayToggle}
                loading={loading}
                saving={saving}
            />

            <SaveSection
                onSave={onSave}
                saving={saving}
                loading={loading}
                status={status}
                userRole={userRole}
                selectedOrganization={selectedOrganization}
                organizations={organizations}
            />
        </Box>
    );
};

export default BlockedDaysTab;
