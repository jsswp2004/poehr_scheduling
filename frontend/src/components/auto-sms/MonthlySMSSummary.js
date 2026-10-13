import React from 'react';
import {
    Box,
    Typography
} from '@mui/material';

/**
 * MonthlySMSSummary Component
 * Displays the monthly SMS total summary
 */
const MonthlySMSSummary = ({
    monthlySMSTotal,
    currentMonthName
}) => {
    return (
        <Box
            sx={{
                mt: 2,
                p: 2,
                bgcolor: '#f8fafc',
                borderRadius: 1,
                border: '1px solid #e2e8f0',
            }}
        >
            <Typography variant="body2" color="text.secondary">
                Total SMS sent for {currentMonthName}: <strong>{monthlySMSTotal}</strong>
            </Typography>
        </Box>
    );
};

export default MonthlySMSSummary;
