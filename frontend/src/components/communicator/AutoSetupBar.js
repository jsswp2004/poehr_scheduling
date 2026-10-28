import React from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    Typography
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import ToolbarPortal from './CommunicatorToolbarSlot';

const DAYS = [
    [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']
];

/**
 * The automatic Email / SMS settings as one frozen row (Enabled, Frequency, Day, Start date, Save, Run now) plus a
 * line with this month's total, the schedule and the last result. Used by the Email and SMS tabs of the Communicator.
 */
const AutoSetupBar = ({
    noun, // "emails" | "texts"
    enabled, onEnabled,
    frequency, onFrequency,
    dayOfWeek, onDayOfWeek,
    startDate, onStartDate,
    saving, loading,
    onSave, onRunNow,
    monthlyTotal,
    result // { text, ok } | null
}) => {
    const dayName = (DAYS.find(([n]) => n === dayOfWeek) || [])[1];
    const next = !enabled ? 'Paused' : frequency === 'daily' ? 'Every day' : `${frequency === 'bi-weekly' ? 'Every other' : 'Every'} ${frequency === 'monthly' ? 'month' : dayName || 'week'}`;

    return (
        <ToolbarPortal>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1.25, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Switch checked={enabled} onChange={(e) => onEnabled(e.target.checked)} inputProps={{ 'aria-label': 'Enabled' }} />
                    <Typography variant="body2">{enabled ? 'On' : 'Off'}</Typography>
                </Stack>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel id="auto-frequency-label">Frequency</InputLabel>
                    <Select labelId="auto-frequency-label" value={frequency} label="Frequency" onChange={(e) => onFrequency(e.target.value)}>
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="bi-weekly">Bi-weekly</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }} disabled={frequency === 'daily'}>
                    <InputLabel id="auto-day-label">Day of week</InputLabel>
                    <Select labelId="auto-day-label" value={dayOfWeek} label="Day of week" onChange={(e) => onDayOfWeek(Number(e.target.value))}>
                        {DAYS.map(([n, name]) => <MenuItem key={n} value={n}>{name}</MenuItem>)}
                    </Select>
                </FormControl>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                        label="Start date"
                        value={startDate}
                        onChange={onStartDate}
                        disablePast
                        minDate={new Date()}
                        slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
                    />
                </LocalizationProvider>
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" size="small" onClick={onRunNow} disabled={loading}>Run now</Button>
                <Button variant="contained" size="small" onClick={onSave} disabled={saving || loading}>
                    {saving ? <CircularProgress size={18} /> : 'Save settings'}
                </Button>
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, pb: 1 }}>
                <Chip size="small" color="primary" label={`${monthlyTotal} ${noun} sent in ${new Date().toLocaleDateString('en-US', { month: 'long' })}`} />
                <Typography variant="body2" color="text.secondary">Schedule: {next}</Typography>
                {result && (
                    <Chip size="small" role="status" color={result.ok ? 'success' : 'error'} variant={result.ok ? 'filled' : 'outlined'} label={result.text} />
                )}
            </Stack>
        </ToolbarPortal>
    );
};

export default AutoSetupBar;
