import React from 'react';
import {
    Box,
    CircularProgress,
    Typography,
} from '@mui/material';

/**
 * Reusable loading spinner component
 */
const LoadingSpinner = ({
    message = "Loading...",
    size = 40,
    showMessage = true,
}) => {
    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                gap: 2,
            }}
        >
            <CircularProgress size={size} />
            {showMessage && (
                <Typography variant="body1" color="text.secondary">
                    {message}
                </Typography>
            )}
        </Box>
    );
};

export default LoadingSpinner;
