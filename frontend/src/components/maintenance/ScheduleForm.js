import React from 'react';
import {
    Box,
    Stack,
    TextField,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    Checkbox,
    FormControlLabel,
    Button,
} from '@mui/material';

const ScheduleForm = ({
    formData,
    editingId,
    doctors,
    selectedDoctor,
    onDoctorChange,
    onFormChange,
    onUpdateFormData,
    onSubmit,
    onCancel,
}) => {
    return (
        <Box sx={{ p: 3, minWidth: 400, width: '100%', textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Stack spacing={2} sx={{ textAlign: 'left' }}>
                    <FormControl fullWidth>
                        <InputLabel shrink>Select Clinician</InputLabel>
                        <MUISelect
                            value={selectedDoctor?.value || ''}
                            label="Select Clinician"
                            displayEmpty
                            onChange={(e) => onDoctorChange(e.target.value)}
                        >
                            {doctors.map(doc => (
                                <MenuItem key={doc.id} value={doc.id}>
                                    {`Dr. ${doc.first_name} ${doc.last_name}`}
                                </MenuItem>
                            ))}
                        </MUISelect>
                    </FormControl>

                    <TextField
                        fullWidth
                        label="Start Time"
                        type="datetime-local"
                        name="start_time"
                        value={formData.start_time}
                        onChange={onFormChange}
                        InputLabelProps={{ shrink: true }}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                    />

                    <TextField
                        fullWidth
                        label="End Time"
                        type="datetime-local"
                        name="end_time"
                        value={formData.end_time}
                        onChange={onFormChange}
                        InputLabelProps={{ shrink: true }}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                    />

                    <FormControl fullWidth>
                        <InputLabel shrink>Recurrence</InputLabel>
                        <MUISelect
                            value={formData.recurrence}
                            label="Recurrence"
                            onChange={(e) => onUpdateFormData('recurrence', e.target.value)}
                            displayEmpty
                        >
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="daily">Daily</MenuItem>
                            <MenuItem value="weekly">Weekly</MenuItem>
                            <MenuItem value="monthly">Monthly</MenuItem>
                        </MUISelect>
                    </FormControl>

                    <TextField
                        fullWidth
                        type="date"
                        label="Recurrence End Date"
                        value={formData.recurrence_end_date || ''}
                        onChange={(e) => onUpdateFormData('recurrence_end_date', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                    />

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={formData.is_blocked}
                                onChange={(e) => onUpdateFormData('is_blocked', e.target.checked)}
                            />
                        }
                        label="Block this schedule"
                    />

                    {formData.is_blocked && (
                        <FormControl fullWidth>
                            <InputLabel shrink>Block Type</InputLabel>
                            <MUISelect
                                value={formData.block_type}
                                label="Block Type"
                                displayEmpty
                                onChange={(e) => onUpdateFormData('block_type', e.target.value)}
                            >
                                <MenuItem value="Lunch">Lunch</MenuItem>
                                <MenuItem value="Meeting">Meeting</MenuItem>
                                <MenuItem value="Vacation">Vacation</MenuItem>
                                <MenuItem value="On Leave">On Leave</MenuItem>
                            </MUISelect>
                        </FormControl>
                    )}

                    <Box sx={{ mt: 'auto', pt: 2 }}>
                        <Button type="submit" variant="contained" fullWidth sx={{ mb: 1 }}>
                            {editingId ? 'Update' : 'Save'}
                        </Button>
                        {editingId && (
                            <Button variant="outlined" onClick={onCancel} fullWidth>
                                Cancel
                            </Button>
                        )}
                    </Box>
                </Stack>
            </form>
        </Box>
    );
};

export default ScheduleForm;
