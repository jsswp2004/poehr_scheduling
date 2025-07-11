import React from 'react';
import { Box, CircularProgress } from '@mui/material';

/**
 * LoadingSpinner Component
 * Displays a centered loading spinner
 */
const LoadingSpinner = () => {
    return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
        </Box>
    );
};

export default LoadingSpinner;
