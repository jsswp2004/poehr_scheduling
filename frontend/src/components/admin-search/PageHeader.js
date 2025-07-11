import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from '../BackButton';

/**
 * PageHeader Component
 * Displays the page title and back button
 */
const PageHeader = () => {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h5" fontWeight={600}>
                Search Appointments
            </Typography>
            <BackButton to="/admin" />
        </Box>
    );
};

export default PageHeader;
