/**
 * AppointmentModal component for creating and editing appointments
 */
import React, { useState, useEffect } from "react";
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
    Box,
    Autocomplete,
    Typography,
} from "@mui/material";
import { PersonAdd } from "@mui/icons-material";
import PatientRegistrationModal from "./RegisterModal";

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
    patients = [], // Add patients prop
}) => {
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientSearchValue, setPatientSearchValue] = useState("");
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);

    // Initialize patient search when editing
    useEffect(() => {
        if (isEditing && formData.patient_name) {
            setPatientSearchValue(formData.patient_name);
        }
    }, [isEditing, formData.patient_name]);

    const handlePatientSelect = (event, newValue) => {
        setSelectedPatient(newValue);
        if (newValue) {
            onFormChange({
                ...formData,
                patient: newValue.user_id, // Use user_id instead of id for the CustomUser reference
                patient_name: `${newValue.first_name} ${newValue.last_name}`
            });
        } else {
            onFormChange({
                ...formData,
                patient: null,
                patient_name: ""
            });
        }
    };

    const handleCreateNewPatient = () => {
        setShowRegistrationModal(true);
    };

    const handlePatientCreated = (newPatient) => {
        if (newPatient) {
            // Select the newly created patient
            setSelectedPatient(newPatient);
            onFormChange({
                ...formData,
                patient: newPatient.user_id,
                patient_name: `${newPatient.first_name} ${newPatient.last_name}`
            });
            setPatientSearchValue(`${newPatient.first_name} ${newPatient.last_name}`);
        }
        // Refresh the patients list if there's a way to do it
        // This would require the patients hook to be passed down or have a refresh method
    };
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" component="div">
                        {isEditing ? "Edit Appointment" : "Create New Appointment"}
                    </Typography>
                    {/* Show Create New Patient button only when creating new appointments */}
                    {!isEditing && (
                        <Button
                            variant="outlined"
                            startIcon={<PersonAdd />}
                            onClick={handleCreateNewPatient}
                            size="small"
                            sx={{ whiteSpace: 'nowrap' }}
                            disabled={isPast}
                        >
                            Create New Patient
                        </Button>
                    )}
                </Box>
            </DialogTitle>

            <DialogContent>
                {isPast && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This is a past appointment. Some fields may not be editable.
                    </Alert>
                )}

                <Stack spacing={2} sx={{ mt: 1 }}>
                    {/* Patient Search Field - Only show in create mode or if no patient name in edit mode */}
                    {(!isEditing || !formData.patient_name) && (
                        <Autocomplete
                            options={patients}
                            getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                            value={selectedPatient}
                            onChange={handlePatientSelect}
                            inputValue={patientSearchValue}
                            onInputChange={(event, newInputValue) => {
                                setPatientSearchValue(newInputValue);
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Search Patient"
                                    placeholder="Start typing to search for a patient..."
                                    fullWidth
                                    variant="outlined"
                                    disabled={isPast}
                                />
                            )}
                            renderOption={(props, option) => {
                                const { key, ...otherProps } = props;
                                return (
                                    <Box component="li" key={key} {...otherProps}>
                                        <div>
                                            <Typography variant="body1">
                                                {option.first_name} {option.last_name}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {option.email} | {option.phone}
                                            </Typography>
                                        </div>
                                    </Box>
                                );
                            }}
                            noOptionsText="No patients found"
                        />
                    )}

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

                    {/* Appointment Title */}
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

            {/* Patient Registration Modal */}
            <PatientRegistrationModal
                open={showRegistrationModal}
                onClose={() => setShowRegistrationModal(false)}
                onPatientCreated={handlePatientCreated}
            />
        </Dialog>
    );
};

export default AppointmentModal;
