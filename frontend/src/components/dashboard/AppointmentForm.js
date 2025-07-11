import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    Paper,
    CircularProgress,
} from '@mui/material';
import Select from 'react-select';

/**
 * Appointment booking form component
 */
const AppointmentForm = ({
    formData,
    doctors,
    availableSlots,
    selectedSlot,
    editMode,
    loading,
    onFormChange,
    onDoctorChange,
    onSlotSelect,
    onSubmit,
    onCancel,
}) => {
    const doctorOptions = doctors.map(doctor => ({
        value: doctor.id,
        label: `Dr. ${doctor.first_name} ${doctor.last_name}`,
    }));

    const slotOptions = availableSlots.map(slot => ({
        value: slot.datetime,
        label: `${new Date(slot.datetime).toLocaleDateString()} at ${new Date(slot.datetime).toLocaleTimeString()}`,
    }));

    return (
        <Paper elevation={2} sx={{ padding: 3, marginBottom: 3 }}>
            <Typography variant="h6" gutterBottom>
                {editMode ? 'Edit Appointment' : 'Book New Appointment'}
            </Typography>

            <Stack spacing={3}>
                {/* Title */}
                <TextField
                    fullWidth
                    label="Appointment Title"
                    value={formData.title}
                    onChange={(e) => onFormChange('title', e.target.value)}
                    variant="outlined"
                />

                {/* Description */}
                <TextField
                    fullWidth
                    label="Description"
                    value={formData.description}
                    onChange={(e) => onFormChange('description', e.target.value)}
                    multiline
                    rows={3}
                    variant="outlined"
                />

                {/* Doctor Selection */}
                <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Select Provider
                    </Typography>
                    <Select
                        value={doctorOptions.find(opt => opt.value === formData.provider?.id)}
                        onChange={(option) => onDoctorChange(option ? doctors.find(d => d.id === option.value) : null)}
                        options={doctorOptions}
                        placeholder="Choose a doctor..."
                        isClearable
                        isSearchable
                    />
                </Box>

                {/* Available Slots */}
                {availableSlots.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Available Time Slots
                        </Typography>
                        <Select
                            value={selectedSlot}
                            onChange={onSlotSelect}
                            options={slotOptions}
                            placeholder="Choose a time slot..."
                            isClearable
                        />
                    </Box>
                )}

                {/* Duration */}
                <FormControl fullWidth>
                    <InputLabel>Duration (minutes)</InputLabel>
                    <MUISelect
                        value={formData.duration_minutes}
                        onChange={(e) => onFormChange('duration_minutes', e.target.value)}
                        label="Duration (minutes)"
                    >
                        <MenuItem value={15}>15 minutes</MenuItem>
                        <MenuItem value={30}>30 minutes</MenuItem>
                        <MenuItem value={45}>45 minutes</MenuItem>
                        <MenuItem value={60}>1 hour</MenuItem>
                        <MenuItem value={90}>1.5 hours</MenuItem>
                        <MenuItem value={120}>2 hours</MenuItem>
                    </MUISelect>
                </FormControl>

                {/* Recurrence */}
                <FormControl fullWidth>
                    <InputLabel>Recurrence</InputLabel>
                    <MUISelect
                        value={formData.recurrence}
                        onChange={(e) => onFormChange('recurrence', e.target.value)}
                        label="Recurrence"
                    >
                        <MenuItem value="none">No Recurrence</MenuItem>
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="weekly">Weekly</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                    </MUISelect>
                </FormControl>

                {/* Action Buttons */}
                <Stack direction="row" spacing={2} justifyContent="flex-end">
                    {editMode && (
                        <Button
                            variant="outlined"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        variant="contained"
                        onClick={onSubmit}
                        disabled={loading || !formData.provider || !selectedSlot}
                        startIcon={loading && <CircularProgress size={20} />}
                    >
                        {loading ? 'Processing...' : editMode ? 'Update' : 'Book'} Appointment
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    );
};

export default AppointmentForm;
