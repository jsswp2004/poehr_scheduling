import React from 'react';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';

const HolidayActions = ({
    saving,
    loading,
    status,
    onSave
}) => {
    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    Make changes to holiday recognition status and click Save.
                </Typography>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={onSave}
                    disabled={saving || loading}
                    sx={{ minWidth: 120 }}
                >
                    {saving ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                    Save Changes
                </Button>
            </Box>

            {status && (
                <Alert
                    severity={status.includes('Failed') ? 'error' : 'success'}
                    sx={{ mb: 2 }}
                >
                    {status}
                </Alert>
            )}
        </>
    );
};

export default HolidayActions;
