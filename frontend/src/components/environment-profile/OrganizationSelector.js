import React from 'react';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography
} from '@mui/material';

/**
 * OrganizationSelector Component
 * Handles organization selection for system admins
 */
const OrganizationSelector = ({
    userRole,
    organizations,
    selectedOrganization,
    onOrganizationChange,
    loading,
    saving
}) => {
    if (userRole !== 'system_admin') {
        return (
            <Typography variant="h6" sx={{ mb: 2 }}>
                Organization Default Blocked Days
            </Typography>
        );
    }

    return (
        <>
            <Typography variant="h6" sx={{ mb: 2 }}>
                Organization Default Blocked Days
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Select Organization</InputLabel>
                <Select
                    value={selectedOrganization}
                    label="Select Organization"
                    onChange={(e) => onOrganizationChange(e.target.value)}
                    disabled={loading || saving || organizations.length === 0}
                >
                    {organizations.length === 0 ? (
                        <MenuItem disabled>
                            {loading ? 'Loading organizations...' : 'No organizations found'}
                        </MenuItem>
                    ) : (
                        organizations.map((org) => (
                            <MenuItem key={org.id} value={org.id}>
                                {org.name}
                            </MenuItem>
                        ))
                    )}
                </Select>
            </FormControl>
        </>
    );
};

export default OrganizationSelector;
