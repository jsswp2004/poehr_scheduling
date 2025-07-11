import React from 'react';
import {
    Button,
    Alert,
    CircularProgress,
    Stack
} from '@mui/material';

/**
 * SMSActionButtons Component
 * Handles save and run now buttons with status feedback
 */
const SMSActionButtons = ({
    onSave,
    onRunNow,
    saving,
    loading,
    status,
    runNowStatus
}) => {
    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            <Button
                variant="contained"
                onClick={onSave}
                disabled={saving || loading}
            >
                {saving ? <CircularProgress size={24} /> : 'Save Settings'}
            </Button>

            <Button
                variant="outlined"
                color="secondary"
                onClick={onRunNow}
                disabled={loading}
            >
                Run Now
            </Button>

            {status && (
                <Alert
                    severity={status === 'Settings Saved!' ? 'success' : 'error'}
                >
                    {status}
                </Alert>
            )}

            {runNowStatus && (
                <Alert
                    severity={
                        runNowStatus === 'SMS messages are being sent!'
                            ? 'success'
                            : 'info'
                    }
                >
                    {runNowStatus}
                </Alert>
            )}
        </Stack>
    );
};

export default SMSActionButtons;
