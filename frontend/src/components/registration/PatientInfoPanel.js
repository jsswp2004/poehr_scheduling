import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Stack,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    IconButton,
    Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CancelIcon from '@mui/icons-material/Cancel';

/**
 * Patient information display and editing component
 * Shows patient details with edit/delete functionality in admin mode
 */
const PatientInfoPanel = ({
    registeredPatient,
    patientEditData,
    editMode,
    doctors,
    organizations,
    loading,
    onEditStart,
    onEditSave,
    onEditCancel,
    onDelete,
    onPatientEditChange,
    onPhoneChange,
    formatPhoneNumber
}) => {
    if (!registeredPatient) {
        return (
            <Box sx={{ flex: '0 0 70%', pl: 2 }}>
                <Typography
                    variant="h5"
                    fontWeight={700}
                    color="text.secondary"
                    sx={{ mb: 3 }}
                >
                    Patient Information
                </Typography>

                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '40vh',
                        textAlign: 'center',
                    }}
                >
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        Patient information will appear here after registration
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Complete the registration form on the left to see patient details and management options.
                    </Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ flex: '0 0 70%', pl: 2 }}>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3,
                }}
            >
                <Typography
                    variant="h5"
                    fontWeight={700}
                    color="primary.main"
                >
                    Patient Information
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    {editMode ? (
                        <>
                            <Tooltip title="Save Changes">
                                <IconButton
                                    onClick={onEditSave}
                                    color="primary"
                                    size="small"
                                    disabled={loading}
                                >
                                    <SaveIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Cancel">
                                <IconButton
                                    onClick={onEditCancel}
                                    color="secondary"
                                    size="small"
                                    disabled={loading}
                                >
                                    <CancelIcon />
                                </IconButton>
                            </Tooltip>
                        </>
                    ) : (
                        <Tooltip title="Edit Patient">
                            <IconButton
                                onClick={onEditStart}
                                color="primary"
                                size="small"
                                disabled={loading}
                            >
                                <EditIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="Delete Patient">
                        <IconButton
                            onClick={onDelete}
                            color="error"
                            size="small"
                            disabled={loading}
                        >
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            <Stack spacing={3}>
                {/* Name Fields */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="First Name"
                        name="first_name"
                        value={patientEditData.first_name || ''}
                        onChange={onPatientEditChange}
                        fullWidth
                        disabled={!editMode}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                    <TextField
                        label="Last Name"
                        name="last_name"
                        value={patientEditData.last_name || ''}
                        onChange={onPatientEditChange}
                        fullWidth
                        disabled={!editMode}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                </Box>

                {/* Username and Email */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="Username"
                        name="username"
                        value={patientEditData.username || ''}
                        onChange={onPatientEditChange}
                        fullWidth
                        disabled={!editMode}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                    <TextField
                        label="Email"
                        name="email"
                        type="email"
                        value={patientEditData.email || ''}
                        onChange={onPatientEditChange}
                        fullWidth
                        disabled={!editMode}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                </Box>

                {/* Provider and Organization */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Provider</InputLabel>
                        <MUISelect
                            name="provider"
                            value={patientEditData.provider || ''}
                            onChange={onPatientEditChange}
                            label="Provider"
                            sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                        >
                            <MenuItem value="">Select a provider</MenuItem>
                            {doctors.map((doc) => (
                                <MenuItem key={doc.id} value={doc.id}>
                                    Dr. {doc.first_name} {doc.last_name}
                                </MenuItem>
                            ))}
                        </MUISelect>
                    </FormControl>

                    <FormControl fullWidth disabled={!editMode}>
                        <InputLabel>Organization</InputLabel>
                        <MUISelect
                            name="organization"
                            value={patientEditData.organization || ''}
                            onChange={onPatientEditChange}
                            label="Organization"
                            sx={!editMode ? { color: '#333', background: '#f5f5f5' } : {}}
                        >
                            <MenuItem value="">Select an organization</MenuItem>
                            {organizations.map((org) => (
                                <MenuItem key={org.id} value={org.id}>
                                    {org.name}
                                </MenuItem>
                            ))}
                        </MUISelect>
                    </FormControl>
                </Box>

                {/* Phone and Date of Birth */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="Phone Number"
                        name="phone_number"
                        value={
                            editMode
                                ? formatPhoneNumber(patientEditData.phone_number || '')
                                : patientEditData.phone_number || ''
                        }
                        onChange={(e) => onPhoneChange(e.target.value)}
                        fullWidth
                        disabled={!editMode}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                    <TextField
                        label="Date of Birth"
                        name="date_of_birth"
                        type="date"
                        value={patientEditData.date_of_birth || ''}
                        onChange={onPatientEditChange}
                        fullWidth
                        disabled={!editMode}
                        InputLabelProps={{ shrink: true }}
                        InputProps={
                            !editMode
                                ? { style: { color: '#333', background: '#f5f5f5' } }
                                : {}
                        }
                    />
                </Box>

                {/* Address */}
                <TextField
                    label="Address"
                    name="address"
                    value={patientEditData.address || ''}
                    onChange={onPatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    InputProps={
                        !editMode
                            ? { style: { color: '#333', background: '#f5f5f5' } }
                            : {}
                    }
                />

                {/* Medical History */}
                <TextField
                    label="Notes / Medical History"
                    name="medical_history"
                    value={patientEditData.medical_history || ''}
                    onChange={onPatientEditChange}
                    fullWidth
                    disabled={!editMode}
                    multiline
                    rows={4}
                    InputProps={
                        !editMode
                            ? { style: { color: '#333', background: '#f5f5f5' } }
                            : {}
                    }
                />
            </Stack>
        </Box>
    );
};

export default PatientInfoPanel;
