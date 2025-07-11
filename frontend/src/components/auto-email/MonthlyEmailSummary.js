import React from 'react';
import {
    Box,
    Typography
} from '@mui/material';

/**
 * MonthlyEmailSummary Component
 * Displays the monthly Email total summary
 */
const MonthlyEmailSummary = ({
    monthlyEmailTotal,
    currentMonthName
}) => {
    return (
        <Box
            sx={{
                mt: 2,
                p: 2,
                bgcolor: '#f8f9fa',
                borderRadius: 1,
                border: '1px solid #e9ecef',
            }}
        >
            <Typography variant="body2" color="text.secondary">
                Total emails sent for {currentMonthName}: <strong>{monthlyEmailTotal}</strong>
            </Typography>
        </Box>
    );
};

export default MonthlyEmailSummary;
