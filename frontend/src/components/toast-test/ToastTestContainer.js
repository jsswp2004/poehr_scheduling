import React from 'react';
import {
    Box,
    Grid,
} from '@mui/material';
import ToastTestHeader from './ToastTestHeader';
import ToastTestSection from './ToastTestSection';

/**
 * ToastTestContainer Component
 * Main container for the toast test page layout
 */
const ToastTestContainer = ({ toastTestSections }) => {
    return (
        <Box sx={{ padding: 4 }}>
            <ToastTestHeader />

            <Grid container spacing={2}>
                {toastTestSections.map((section) => (
                    <Grid item xs={12} sm={6} key={section.id}>
                        <ToastTestSection
                            title={section.title}
                            tests={section.tests}
                        />
                    </Grid>
                ))}
            </Grid>

            {/* We don't need ToastContainer here since it's already in App.js */}
        </Box>
    );
};

export default ToastTestContainer;
