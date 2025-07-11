import React from 'react';
import { Box } from '@mui/material';
import SMSConfigForm from './SMSConfigForm';
import SMSActionButtons from './SMSActionButtons';
import MonthlySMSSummary from './MonthlySMSSummary';

/**
 * SMSSettingsPanel Component
 * Left panel container for all SMS configuration components
 */
const SMSSettingsPanel = ({
    frequency,
    onFrequencyChange,
    dayOfWeek,
    onDayOfWeekChange,
    startDate,
    onStartDateChange,
    onSave,
    onRunNow,
    saving,
    loading,
    status,
    runNowStatus,
    monthlySMSTotal,
    currentMonthName
}) => {
    return (
        <Box
            sx={{
                flex: '0 0 400px',
            }}
        >
            <SMSConfigForm
                frequency={frequency}
                onFrequencyChange={onFrequencyChange}
                dayOfWeek={dayOfWeek}
                onDayOfWeekChange={onDayOfWeekChange}
                startDate={startDate}
                onStartDateChange={onStartDateChange}
            />

            <SMSActionButtons
                onSave={onSave}
                onRunNow={onRunNow}
                saving={saving}
                loading={loading}
                status={status}
                runNowStatus={runNowStatus}
            />

            <MonthlySMSSummary
                monthlySMSTotal={monthlySMSTotal}
                currentMonthName={currentMonthName}
            />
        </Box>
    );
};

export default SMSSettingsPanel;
