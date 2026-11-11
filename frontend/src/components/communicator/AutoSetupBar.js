import React, { useState } from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Typography
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import ConfirmDialog from './ConfirmDialog';

const DAYS = [
    [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']
];

const formatDate = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';

/**
 * The automatic Email / SMS settings as one card: an On/Paused switch, a plain sentence that says what will happen,
 * the three schedule fields, this month's total, and Save / Run now. Run now asks first because it sends immediately.
 * Used by the Email and SMS tabs of the Communicator (props unchanged from the old frozen bar).
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
    const [confirmRun, setConfirmRun] = useState(false);
    const dayName = (DAYS.find(([n]) => n === dayOfWeek) || [])[1] || 'week';
    const when =
        frequency === 'daily' ? 'every day'
        : frequency === 'monthly' ? 'every month'
        : frequency === 'bi-weekly' ? `every other ${dayName}`
        : `every ${dayName}`;
    const start = formatDate(startDate);
    const sentence = enabled
        ? `Sends ${noun} ${when}${start ? `, starting ${start}` : ''}, to contacts who can receive them.`
        : `Paused. When turned on, sends ${noun} ${when}${start ? `, starting ${start}` : ''}.`;
    const title = `Automatic ${noun}`;
    const month = new Date().toLocaleDateString('en-US', { month: 'long' });

    return (
        <Paper variant="outlined" sx={{ p: 3, mb: 2, maxWidth: 760 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{title}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: enabled ? 'success.dark' : 'text.secondary' }}>
                    {enabled ? 'On' : 'Paused'}
                </Typography>
                <Switch checked={enabled} onChange={(e) => onEnabled(e.target.checked)} inputProps={{ 'aria-label': `${title} on or paused` }} />
            </Stack>

            <Box role="status" sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {sentence}
            </Box>

            <Stack direction="row" spacing={2} sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 160, flex: '1 1 160px' }}>
                    <InputLabel id={`auto-frequency-${noun}`}>Frequency</InputLabel>
                    <Select labelId={`auto-frequency-${noun}`} value={frequency} label="Frequency" onChange={(e) => onFrequency(e.target.value)}>
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="bi-weekly">Every other week</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160, flex: '1 1 160px' }} disabled={frequency === 'daily'}>
                    <InputLabel id={`auto-day-${noun}`}>Day</InputLabel>
                    <Select labelId={`auto-day-${noun}`} value={dayOfWeek} label="Day" onChange={(e) => onDayOfWeek(Number(e.target.value))}>
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
                        slotProps={{ textField: { size: 'small', sx: { minWidth: 170, flex: '1 1 170px' } } }}
                    />
                </LocalizationProvider>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}>
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Sent in {month}</Typography>
                    <Typography variant="h6" component="p" sx={{ lineHeight: 1.2 }}>{monthlyTotal}</Typography>
                </Box>
                {result && (
                    <Chip size="small" role="status" color={result.ok ? 'success' : 'error'} variant={result.ok ? 'filled' : 'outlined'} label={result.text} />
                )}
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5, flexWrap: 'wrap', rowGap: 1 }}>
                <Button variant="contained" onClick={onSave} disabled={saving || loading}>
                    {saving ? <CircularProgress size={20} /> : 'Save settings'}
                </Button>
                <Button variant="outlined" onClick={() => setConfirmRun(true)} disabled={loading}>Run now</Button>
                <Typography variant="caption" color="text.secondary" sx={{ flex: '1 1 180px' }}>
                    Run now sends right away to everyone eligible. You'll be asked to confirm.
                </Typography>
            </Stack>

            <ConfirmDialog
                open={confirmRun}
                title={`Send ${noun} now?`}
                confirmLabel="Send now"
                onConfirm={() => { setConfirmRun(false); onRunNow(); }}
                onClose={() => setConfirmRun(false)}
            >
                This sends {noun} right away, outside the schedule, to every contact who can receive them.
            </ConfirmDialog>
        </Paper>
    );
};

export default AutoSetupBar;
