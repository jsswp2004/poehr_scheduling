import React from 'react';
import { Box } from '@mui/material';
import EmailConfigForm from './EmailConfigForm';
import EmailActionButtons from './EmailActionButtons';
import MonthlyEmailSummary from './MonthlyEmailSummary';

/**
 * EmailSettingsPanel Component
 * Left panel container for all Email configuration components
 */
const EmailSettingsPanel = ({ emailSettings, emailExecution }) => {
    return (
        <Box
            sx={{
                flex: '0 0 400px',
            }}
        >
            <EmailConfigForm
                frequency={emailSettings.frequency}
                onFrequencyChange={emailSettings.setFrequency}
                dayOfWeek={emailSettings.dayOfWeek}
                onDayOfWeekChange={emailSettings.setDayOfWeek}
                startDate={emailSettings.startDate}
                onStartDateChange={emailSettings.setStartDate}
            />

            <EmailActionButtons
                onSave={emailSettings.handleSave}
                onRunNow={emailExecution.handleRunNow}
                saving={emailSettings.saving}
                loading={emailSettings.loading}
                status={emailSettings.status}
                runNowStatus={emailExecution.runNowStatus}
            />

            <MonthlyEmailSummary
                monthlyEmailTotal={emailExecution.monthlyEmailTotal}
                currentMonthName={emailExecution.currentMonthName}
            />
        </Box>
    );
};

export default EmailSettingsPanel;
