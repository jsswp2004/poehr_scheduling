import React from 'react';
import {
    Typography,
    Card,
    CardContent,
} from '@mui/material';

/**
 * ToastTestHeader Component
 * Header section with title and description for toast test page
 */
const ToastTestHeader = () => {
    return (
        <>
            <Typography variant="h4" gutterBottom>
                Toast Notification Test Page
            </Typography>
            <Card sx={{ mb: 4 }}>
                <CardContent>
                    <Typography variant="body1" paragraph>
                        This page is for testing toast notifications. Each button will trigger a different type of toast
                        that should remain visible for 5 seconds.
                    </Typography>
                </CardContent>
            </Card>
        </>
    );
};

export default ToastTestHeader;
