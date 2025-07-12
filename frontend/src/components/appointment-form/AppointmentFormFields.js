/**
 * Appointment form fields component
 */
import React from 'react';
import { Box, TextField, MenuItem, Typography, Stack } from '@mui/material';
import Select from 'react-select';

export const AppointmentFormFields = ({
    formData,
    handleChange,
    clinicEvents,
    selectedClinicEvent,
    handleClinicEventChange,
    doctors,
    selectedDoctor,
    handleDoctorChange,
    editMode
}) => {
    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Clinic Event</Typography>
                <Select
                    options={clinicEvents.map(event => ({ value: event.id, label: event.name }))}
                    value={selectedClinicEvent}
                    onChange={handleClinicEventChange}
                    placeholder="Select clinic event..."
                    isClearable
                    styles={{
                        control: (base) => ({ ...base, minHeight: 40 }),
                        menu: (base) => ({ ...base, zIndex: 9999 })
                    }}
                />
            </Box>

            <TextField
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                multiline
                minRows={2}
                fullWidth
            />

            <TextField
                label="Date & Time"
                name="appointment_datetime"
                type="datetime-local"
                value={formData.appointment_datetime}
                onChange={handleChange}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
            />

            <TextField
                label="Duration (minutes)"
                name="duration_minutes"
                type="number"
                value={formData.duration_minutes}
                onChange={handleChange}
                required
                fullWidth
                inputProps={{ min: 1 }}
            />

            <TextField
                label="Recurrence"
                name="recurrence"
                select
                value={formData.recurrence}
                onChange={handleChange}
                fullWidth
            >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
            </TextField>

            {formData.recurrence !== 'none' && (
                <TextField
                    label="Recurrence End Date"
                    name="recurrence_end_date"
                    type="date"
                    value={formData.recurrence_end_date}
                    onChange={handleChange}
                    required
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Required for recurring appointments"
                    inputProps={{
                        min: formData.appointment_datetime ? formData.appointment_datetime.split('T')[0] : undefined
                    }}
                />
            )}

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Select Doctor</Typography>
                <Select
                    options={doctors.map(doc => ({ value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }))}
                    value={selectedDoctor}
                    onChange={handleDoctorChange}
                    placeholder="Search or select doctor..."
                    isClearable
                    isDisabled={false}
                    styles={{
                        control: (base) => ({ ...base, minHeight: 40 }),
                        menu: (base) => ({ ...base, zIndex: 9999 })
                    }}
                />
            </Box>

            {editMode && (
                <TextField
                    label="Status"
                    name="status"
                    select
                    value={formData.status || ''}
                    onChange={handleChange}
                    required
                    fullWidth
                >
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                    <MenuItem value="completed">Completed</MenuItem>
                    <MenuItem value="cancelled">Cancelled</MenuItem>
                    <MenuItem value="no_show">No Show</MenuItem>
                    <MenuItem value="rescheduled">Rescheduled</MenuItem>
                    <MenuItem value="pending">Pending</MenuItem>
                    <MenuItem value="in_progress">In Progress</MenuItem>
                </TextField>
            )}
        </Stack>
    );
};
