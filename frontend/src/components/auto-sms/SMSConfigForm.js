import React from 'react';
import {
    Stack,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';

/**
 * SMSConfigForm Component
 * Form for configuring SMS automation settings
 */
const SMSConfigForm = ({
    frequency,
    onFrequencyChange,
    dayOfWeek,
    onDayOfWeekChange,
    startDate,
    onStartDateChange
}) => {
    return (
        <>
            <Typography variant="h6" sx={{ mb: 2 }}>
                Automatic Text Messaging Setup
            </Typography>
            <Stack spacing={2} sx={{ maxWidth: 300 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                        label="Start Date"
                        value={startDate}
                        onChange={(newDate) => onStartDateChange(newDate)}
                        slotProps={{
                            textField: {
                                fullWidth: true,
                                size: 'medium',
                                helperText: 'Select when to start sending automated SMS',
                            },
                        }}
                        disablePast
                        minDate={new Date()}
                    />
                </LocalizationProvider>

                <FormControl fullWidth>
                    <InputLabel id="frequency-label">Frequency</InputLabel>
                    <Select
                        labelId="frequency-label"
                        value={frequency}
                        label="Frequency"
                        onChange={(e) => onFrequencyChange(e.target.value)}
                    >
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="bi-weekly">Bi-weekly</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                    </Select>
                </FormControl>

                <FormControl fullWidth>
                    <InputLabel id="day-label">Day of Week</InputLabel>
                    <Select
                        labelId="day-label"
                        value={dayOfWeek}
                        label="Day of Week"
                        onChange={(e) => onDayOfWeekChange(Number(e.target.value))}
                        disabled={frequency === 'daily'}
                    >
                        <MenuItem value={1}>Monday</MenuItem>
                        <MenuItem value={2}>Tuesday</MenuItem>
                        <MenuItem value={3}>Wednesday</MenuItem>
                        <MenuItem value={4}>Thursday</MenuItem>
                        <MenuItem value={5}>Friday</MenuItem>
                        <MenuItem value={6}>Saturday</MenuItem>
                        <MenuItem value={0}>Sunday</MenuItem>
                    </Select>
                </FormControl>
            </Stack>
        </>
    );
};

export default SMSConfigForm;
