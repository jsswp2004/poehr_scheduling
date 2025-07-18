import React from 'react';
import { Box } from '@mui/material';
import { useSMSSettings, useSMSExecution } from '../hooks/auto-sms';
import { SMSSettingsPanel, SMSLogsPanel } from '../components/auto-sms';

/**
 * AutoSMSSetUpPage Component (Refactored)
 * Administrative page for configuring and managing automated SMS messaging
 * 
 * Features:
 * - SMS automation settings configuration (frequency, day, start date)
 * - Manual SMS execution with "Run Now" functionality
 * - Monthly SMS analytics and total tracking
 * - Real-time SMS logs display in table format
 * - Two-panel layout for settings and logs
 * - Loading states and error handling
 */
function AutoSMSSetUpPage() {
    // SMS settings management
    const {
        frequency,
        setFrequency,
        dayOfWeek,
        setDayOfWeek,
        startDate,
        setStartDate,
        saving,
        status,
        loading,
        handleSave,
        getAuthToken
    } = useSMSSettings();

    // SMS execution and analytics
    const {
        runNowStatus,
        monthlySMSTotal,
        handleRunNow,
        getCurrentMonthName
    } = useSMSExecution(getAuthToken);

    return (
        <Box
            sx={{
                boxShadow: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
                p: 3,
                height: '100%',
            }}
        >
            <Box sx={{ display: 'flex', gap: 3, height: '100%' }}>
                {/* Left Pane - SMS Settings */}
                <SMSSettingsPanel
                    frequency={frequency}
                    onFrequencyChange={setFrequency}
                    dayOfWeek={dayOfWeek}
                    onDayOfWeekChange={setDayOfWeek}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    onSave={handleSave}
                    onRunNow={handleRunNow}
                    saving={saving}
                    loading={loading}
                    status={status}
                    runNowStatus={runNowStatus}
                    monthlySMSTotal={monthlySMSTotal}
                    currentMonthName={getCurrentMonthName()}
                />

                {/* Right Pane - SMS Logs */}
                <SMSLogsPanel />
            </Box>
        </Box>
    );
}

export default AutoSMSSetUpPage;
