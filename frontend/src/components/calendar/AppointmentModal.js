/**
 * AppointmentModal component for creating and editing appointments
 */
import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    FormControl,
    InputLabel,
    Select as MUISelect,
    Alert,
    Stack,
} from "@mui/material";

const AppointmentModal = ({
    open,
    onClose,
    isEditing,
    isPast,
    formData,
    onFormChange,
    doctors,
    selectedDoctor,
    onDoctorChange,
    onSubmit,
    onDelete,
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isEditing ? "Edit Appointment" : "Create New Appointment"}
            </DialogTitle>

            <DialogContent>
                {isPast && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This is a past appointment. Some fields may not be editable.
                    </Alert>
                )}

                <Stack spacing={2} sx={{ mt: 1 }}>
                    {/* Patient Name Display - Only show in edit mode when patient name exists */}
                    {isEditing && formData.patient_name && (
                        <TextField
                            label="Patient Name"
                            value={formData.patient_name}
                            fullWidth
                            variant="outlined"
                            disabled={true}
                            sx={{
                                '& .MuiInputBase-input.Mui-disabled': {
                                    WebkitTextFillColor: 'rgba(0, 0, 0, 0.87)',
                                    backgroundColor: '#f5f5f5',
                                },
                                '& .MuiInputLabel-root.Mui-disabled': {
                                    color: 'rgba(0, 0, 0, 0.6)',
                                },
                            }}
                        />
                    )}

                    <TextField
                        autoFocus
                        label="Appointment Title"
                        value={formData.title}
                        onChange={(e) => onFormChange({ ...formData, title: e.target.value })}
                        fullWidth
                        variant="outlined"
                        disabled={isPast}
                    />

                    <TextField
                        label="Description"
                        value={formData.description}
                        onChange={(e) => onFormChange({ ...formData, description: e.target.value })}
                        fullWidth
                        variant="outlined"
                        multiline
                        rows={3}
                        disabled={isPast}
                    />

                    <TextField
                        label="Duration (minutes)"
                        type="number"
                        value={formData.duration_minutes}
                        onChange={(e) => onFormChange({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                        fullWidth
                        variant="outlined"
                        disabled={isPast}
                    />

                    <TextField
                        label="Appointment Date & Time"
                        type="datetime-local"
                        value={formData.appointment_datetime}
                        onChange={(e) => onFormChange({ ...formData, appointment_datetime: e.target.value })}
                        fullWidth
                        variant="outlined"
                        InputLabelProps={{ shrink: true }}
                        disabled={isPast}
                    />

                    <FormControl fullWidth disabled={isPast}>
                        <InputLabel>Provider</InputLabel>
                        <MUISelect
                            value={selectedDoctor?.id || formData.provider || ""}
                            onChange={onDoctorChange}
                            label="Provider"
                        >
                            <MenuItem value="">
                                <em>Select a provider</em>
                            </MenuItem>
                            {doctors.map((doctor) => (
                                <MenuItem key={doctor.id} value={doctor.id}>
                                    Dr. {doctor.first_name} {doctor.last_name}
                                </MenuItem>
                            ))}
                        </MUISelect>
                    </FormControl>

                    <FormControl fullWidth disabled={isPast}>
                        <InputLabel>Recurrence</InputLabel>
                        <MUISelect
                            value={formData.recurrence}
                            onChange={(e) => onFormChange({ ...formData, recurrence: e.target.value })}
                            label="Recurrence"
                        >
                            <MenuItem value="none">No Recurrence</MenuItem>
                            <MenuItem value="daily">Daily</MenuItem>
                            <MenuItem value="weekly">Weekly</MenuItem>
                            <MenuItem value="monthly">Monthly</MenuItem>
                        </MUISelect>
                    </FormControl>

                    {/* Recurrence End Date - Only show when recurrence is not "none" */}
                    {formData.recurrence && formData.recurrence !== "none" && (
                        <TextField
                            label="Recurrence End Date"
                            type="date"
                            value={formData.recurrence_end_date || ""}
                            onChange={(e) => onFormChange({ ...formData, recurrence_end_date: e.target.value })}
                            fullWidth
                            variant="outlined"
                            InputLabelProps={{ shrink: true }}
                            disabled={isPast}
                            helperText="Select when this recurring appointment should end"
                        />
                    )}
                </Stack>
            </DialogContent>

            <DialogActions>
                {isEditing && !isPast && (
                    <Button onClick={onDelete} color="error">
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                {!isPast && (
                    <Button onClick={onSubmit} variant="contained" color="primary">
                        {isEditing ? "Update" : "Create"}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AppointmentModal;
