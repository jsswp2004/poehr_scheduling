import React from 'react';
import {
    Box,
    Stack,
    Typography,
    Button,
    TextField,
    Paper,
    MenuItem,
    FormControl,
    InputLabel,
    Select as MUISelect,
    InputAdornment,
} from '@mui/material';
import SimpleAddressAutocomplete from './SimpleAddressAutocomplete';

// Helper functions
function formatPhoneNumber(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function formatEmail(value) {
    return value.replace(/\s+/g, '').toLowerCase();
}

function PatientInformationForm({
    formData,
    editMode,
    saving,
    doctors,
    organizations,
    onSubmit,
    onChange,
    onAddressChange,
    onCancel,
    onCreateAppointment,
    onResetPassword,
    onEditToggle,
}) {
    return (
        <form onSubmit={onSubmit}>
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 3 }}>
                    Patient Information
                </Typography>

                {/* Two-column grid layout */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 3,
                        mb: 3,
                    }}
                >
                    {/* Left Column */}
                    <Stack spacing={3}>
                        <TextField
                            label="First Name *"
                            name="first_name"
                            value={formData.first_name || ''}
                            onChange={onChange}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.first_name || formData.first_name.trim() === '')
                            }
                            helperText={
                                editMode &&
                                    (!formData.first_name || formData.first_name.trim() === '')
                                    ? 'First name is required'
                                    : ''
                            }
                            InputProps={
                                !editMode
                                    ? { style: { color: '#333', background: '#f5f5f5' } }
                                    : {}
                            }
                        />

                        <TextField
                            label="Last Name *"
                            name="last_name"
                            value={formData.last_name || ''}
                            onChange={onChange}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.last_name || formData.last_name.trim() === '')
                            }
                            helperText={
                                editMode &&
                                    (!formData.last_name || formData.last_name.trim() === '')
                                    ? 'Last name is required'
                                    : ''
                            }
                            InputProps={
                                !editMode
                                    ? { style: { color: '#333', background: '#f5f5f5' } }
                                    : {}
                            }
                        />

                        <TextField
                            label="Username *"
                            name="username"
                            value={formData.username || ''}
                            onChange={onChange}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.username ||
                                    formData.username.trim() === '' ||
                                    formData.username.length < 3)
                            }
                            helperText={
                                editMode &&
                                    (!formData.username || formData.username.trim() === '')
                                    ? 'Username is required'
                                    : editMode &&
                                        formData.username &&
                                        formData.username.length < 3
                                        ? 'Username must be at least 3 characters'
                                        : ''
                            }
                            InputProps={
                                !editMode
                                    ? { style: { color: '#333', background: '#f5f5f5' } }
                                    : {}
                            }
                        />

                        <TextField
                            label="Email *"
                            name="email"
                            type="email"
                            value={
                                editMode
                                    ? formatEmail(formData.email || '')
                                    : formData.email || ''
                            }
                            onChange={(e) => {
                                const val = e.target.value;
                                const syntheticEvent = {
                                    target: {
                                        name: 'email',
                                        value: val.replace(/\s+/g, ''),
                                    },
                                };
                                onChange(syntheticEvent);
                            }}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.email ||
                                    formData.email.trim() === '' ||
                                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
                            }
                            helperText={
                                editMode &&
                                    (!formData.email || formData.email.trim() === '')
                                    ? 'Email is required'
                                    : editMode &&
                                        formData.email &&
                                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
                                        ? 'Invalid email format'
                                        : ''
                            }
                            InputProps={
                                !editMode
                                    ? { style: { color: '#333', background: '#f5f5f5' } }
                                    : {}
                            }
                        />

                        <TextField
                            label="Phone Number *"
                            name="phone_number"
                            value={
                                editMode
                                    ? formatPhoneNumber(formData.phone_number || '')
                                    : formData.phone_number || ''
                            }
                            onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '');
                                const syntheticEvent = {
                                    target: {
                                        name: 'phone_number',
                                        value: raw,
                                    },
                                };
                                onChange(syntheticEvent);
                            }}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.phone_number ||
                                    formData.phone_number.length === 0 ||
                                    formData.phone_number.length < 10)
                            }
                            helperText={
                                editMode &&
                                    (!formData.phone_number || formData.phone_number.length === 0)
                                    ? 'Phone number is required'
                                    : editMode &&
                                        formData.phone_number &&
                                        formData.phone_number.length > 0 &&
                                        formData.phone_number.length < 10
                                        ? 'Phone number must be at least 10 digits'
                                        : editMode
                                            ? 'Format: (555) 123-4567'
                                            : ''
                            }
                            InputProps={{
                                ...(editMode
                                    ? {}
                                    : { style: { color: '#333', background: '#f5f5f5' } }),
                                startAdornment: (
                                    <InputAdornment position="start">📞</InputAdornment>
                                ),
                            }}
                        />
                    </Stack>

                    {/* Right Column */}
                    <Stack spacing={3}>
                        <TextField
                            label="Date of Birth *"
                            name="date_of_birth"
                            type="date"
                            value={formData.date_of_birth || ''}
                            onChange={onChange}
                            fullWidth
                            required
                            disabled={!editMode}
                            error={
                                editMode &&
                                (!formData.date_of_birth ||
                                    formData.date_of_birth.trim() === '')
                            }
                            helperText={
                                editMode &&
                                    (!formData.date_of_birth ||
                                        formData.date_of_birth.trim() === '')
                                    ? 'Date of birth is required'
                                    : ''
                            }
                            InputLabelProps={{ shrink: true }}
                            InputProps={
                                !editMode
                                    ? { style: { color: '#333', background: '#f5f5f5' } }
                                    : {}
                            }
                        />

                        <FormControl fullWidth disabled={!editMode} required>
                            <InputLabel required>Provider *</InputLabel>
                            <MUISelect
                                name="provider"
                                value={formData.provider || ''}
                                onChange={onChange}
                                label="Provider"
                                required
                                error={
                                    editMode && (!formData.provider || formData.provider === '')
                                }
                                sx={
                                    !editMode ? { color: '#333', background: '#f5f5f5' } : {}
                                }
                            >
                                <MenuItem value="">Select a provider</MenuItem>
                                {Array.isArray(doctors) &&
                                    doctors.map((doc) => (
                                        <MenuItem key={doc.id} value={doc.id}>
                                            Dr. {doc.first_name} {doc.last_name}
                                        </MenuItem>
                                    ))}
                            </MUISelect>
                            {editMode && (!formData.provider || formData.provider === '') && (
                                <Typography
                                    variant="caption"
                                    color="error"
                                    sx={{ mt: 0.5, ml: 1.5 }}
                                >
                                    Provider is required
                                </Typography>
                            )}
                        </FormControl>

                        <FormControl
                            fullWidth
                            disabled={!editMode}
                            required
                            error={
                                editMode &&
                                (!formData.organization || formData.organization === '')
                            }
                        >
                            <InputLabel
                                required
                                error={
                                    editMode &&
                                    (!formData.organization || formData.organization === '')
                                }
                            >
                                Organization *
                            </InputLabel>
                            <MUISelect
                                name="organization"
                                value={formData.organization || ''}
                                onChange={onChange}
                                label="Organization"
                                required
                                error={
                                    editMode &&
                                    (!formData.organization || formData.organization === '')
                                }
                                sx={
                                    !editMode ? { color: '#333', background: '#f5f5f5' } : {}
                                }
                            >
                                <MenuItem value="">Select an organization</MenuItem>
                                {organizations.map((org) => (
                                    <MenuItem key={org.id} value={org.id}>
                                        {org.name}
                                    </MenuItem>
                                ))}
                            </MUISelect>
                            {editMode &&
                                (!formData.organization || formData.organization === '') && (
                                    <Typography
                                        variant="caption"
                                        color="error"
                                        sx={{ mt: 0.5, ml: 1.5 }}
                                    >
                                        Organization is required
                                    </Typography>
                                )}
                        </FormControl>

                        {editMode ? (
                            <SimpleAddressAutocomplete
                                value={formData.address || ''}
                                onChange={onAddressChange}
                                disabled={!editMode}
                            />
                        ) : (
                            <TextField
                                label="Address *"
                                name="address"
                                value={formData.address || ''}
                                fullWidth
                                required
                                disabled
                                InputProps={{
                                    style: { color: '#333', background: '#f5f5f5' },
                                }}
                            />
                        )}
                    </Stack>
                </Box>

                {/* Medical History - Full Width */}
                <TextField
                    label="Notes (Optional)"
                    name="medical_history"
                    value={formData.medical_history || ''}
                    onChange={onChange}
                    fullWidth
                    disabled={!editMode}
                    multiline
                    rows={4}
                    helperText={
                        editMode
                            ? 'Optional - medical history, allergies, or other notes'
                            : ''
                    }
                    InputProps={
                        !editMode
                            ? { style: { color: '#333', background: '#f5f5f5' } }
                            : {}
                    }
                    sx={{ mb: 2 }}
                />

                {/* Action Buttons */}
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    {editMode ? (
                        <>
                            <Button
                                variant="contained"
                                color="primary"
                                type="submit"
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                                variant="outlined"
                                color="secondary"
                                onClick={onCancel}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button variant="outlined" color="warning" onClick={onEditToggle}>
                            Edit
                        </Button>
                    )}

                    <Button
                        variant="contained"
                        color="success"
                        onClick={onCreateAppointment}
                    >
                        Create Appointment
                    </Button>

                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={onResetPassword}
                        sx={{
                            borderColor: '#ff9800',
                            color: '#ff9800',
                            '&:hover': {
                                borderColor: '#f57c00',
                                backgroundColor: '#fff3e0',
                            },
                        }}
                    >
                        Reset Password
                    </Button>
                </Stack>
            </Paper>
        </form>
    );
}

export default PatientInformationForm;
