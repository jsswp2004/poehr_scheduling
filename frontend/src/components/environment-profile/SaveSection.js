import React from 'react';
import {
    Stack,
    Button,
    Alert,
    CircularProgress,
    Typography
} from '@mui/material';

/**
 * SaveSection Component
 * Handles save button, status alerts, and help text
 */
const SaveSection = ({
    onSave,
    saving,
    loading,
    status,
    userRole,
    selectedOrganization,
    organizations
}) => {
    const getOrganizationName = () => {
        if (userRole === 'system_admin' && selectedOrganization && organizations.length > 0) {
            const org = organizations.find(org => org.id === selectedOrganization);
            return ` ${org?.name || 'this organization'}'s`;
        }
        return " your organization's";
    };

    return (
        <>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
                <Button
                    variant="contained"
                    onClick={onSave}
                    disabled={saving || loading}
                >
                    {saving ? <CircularProgress size={24} /> : 'Save Settings'}
                </Button>
                {status && (
                    <Alert
                        severity={status === 'Saved!' ? 'success' : 'error'}
                        sx={{ flex: 1 }}
                    >
                        {status}
                    </Alert>
                )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                <b>Organization-wide setting:</b> Select which days are blocked by default for
                {getOrganizationName()} scheduling.
                This affects all clinic appointments and is separate from individual provider availability.
            </Typography>
        </>
    );
};

export default SaveSection;
