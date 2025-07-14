import React from 'react';
import { Box } from '@mui/material';
import { useEmailSettings, useEmailExecution } from '../hooks/auto-email';
import { EmailSettingsPanel, EmailLogsPanel } from '../components/auto-email';

/**
 * AutoEmailSetUpPage - Refactored
 * 
 * Main page component for managing automatic email settings and viewing email logs.
 * This refactored version separates concerns into custom hooks and reusable components.
 * 
 * Features:
 * - Email automation configuration (frequency, day of week, start date)
 * - Manual email execution trigger
 * - Monthly email summary statistics
 * - Email logs viewing with filtering
 * 
 * Hooks Used:
 * - useEmailSettings: Manages email automation settings
 * - useEmailExecution: Handles manual email execution and monthly statistics
 * 
 * Components Used:
 * - EmailSettingsPanel: Left panel with configuration form and actions
 * - EmailLogsPanel: Right panel with email logs table
 */
function AutoEmailSetUpPage() {
    // Email settings management
    const emailSettings = useEmailSettings();
    const { getAuthToken } = emailSettings;

    // Email execution and statistics
    const emailExecution = useEmailExecution(getAuthToken);

    return (
        <Box
            sx={{
                boxShadow: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
                p: 3,
                height: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
            }}
        >
            <Box sx={{ display: 'flex', gap: 3, height: '100%' }}>
                {/* Left Panel - Email Settings */}
                <EmailSettingsPanel
                    emailSettings={emailSettings}
                    emailExecution={emailExecution}
                />

                {/* Right Panel - Email Logs */}
                <EmailLogsPanel />
            </Box>
        </Box>
    );
}

export default AutoEmailSetUpPage;
