import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Stack,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Alert
} from '@mui/material';
import Select from 'react-select';

/**
 * Registration form component
 * Handles user input for registration data
 */
const RegistrationForm = ({
    adminMode,
    formData,
    isPatient,
    hasProvider,
    doctorOptions,
    loading,
    isLoggedIn,
    onFormChange,
    onPatientTypeChange,
    onProviderSelectionChange,
    onDoctorSelection,
    onSubmit,
    formatPhoneNumber,
    getContactValidationMessage
}) => {
    const requiresContact = !isLoggedIn && isPatient && hasProvider === 'no';
    const contactMessage = getContactValidationMessage(formData.email, formData.phone_number, requiresContact);

    return (
        <Box sx={{ flex: '0 0 30%', pr: 2 }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
                Quick Register
            </Typography>

            {/* Patient Type Selection (non-admin mode) */}
            {!adminMode && (formData.role === 'none' || formData.role === 'patient') && (
                <Box sx={{ mb: 2 }}>
                    <FormControl component="fieldset">
                        <FormLabel>Are you registering as a patient?</FormLabel>
                        <RadioGroup row value={isPatient ? 'yes' : 'no'}>
                            <FormControlLabel
                                value="yes"
                                control={<Radio />}
                                label="Yes"
                                onChange={() => onPatientTypeChange(true)}
                                checked={isPatient}
                            />
                            <FormControlLabel
                                value="no"
                                control={<Radio />}
                                label="No"
                                onChange={() => onPatientTypeChange(false)}
                                checked={!isPatient}
                            />
                        </RadioGroup>
                    </FormControl>
                </Box>
            )}

            <form onSubmit={onSubmit}>
                <Stack spacing={2}>
                    {/* Organization Field (conditional) */}
                    {!adminMode && !isLoggedIn && (formData.role === 'none' || formData.role === 'patient') && (
                        <TextField
                            label="Organization Name"
                            name="organization_name"
                            value={formData.organization_name || ''}
                            onChange={onFormChange}
                            required
                            fullWidth
                            size="small"
                        />
                    )}

                    {/* Basic Information Fields */}
                    <TextField
                        label="First Name"
                        name="first_name"
                        value={formData.first_name}
                        onChange={onFormChange}
                        required
                        fullWidth
                        size="small"
                    />

                    <TextField
                        label="Last Name"
                        name="last_name"
                        value={formData.last_name}
                        onChange={onFormChange}
                        required
                        fullWidth
                        size="small"
                    />

                    <TextField
                        label="Username"
                        name="username"
                        value={formData.username}
                        onChange={onFormChange}
                        required
                        fullWidth
                        size="small"
                    />

                    <TextField
                        label="Email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={onFormChange}
                        required={isPatient && hasProvider === 'no'}
                        fullWidth
                        size="small"
                    />

                    <TextField
                        label="Phone Number"
                        name="phone_number"
                        value={formData.phone_number}
                        onChange={onFormChange}
                        required={isPatient && hasProvider === 'no'}
                        fullWidth
                        size="small"
                        placeholder="e.g. (555) 123-4567"
                    />

                    <TextField
                        label="Password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={onFormChange}
                        required
                        fullWidth
                        size="small"
                    />

                    {/* Provider Question (non-admin mode) */}
                    {!adminMode && isPatient && (
                        <Box>
                            <FormControl component="fieldset">
                                <FormLabel>Do you know/have a Primary Care Provider?</FormLabel>
                                <RadioGroup row value={hasProvider}>
                                    <FormControlLabel
                                        value="yes"
                                        control={<Radio />}
                                        label="Yes"
                                        onChange={() => onProviderSelectionChange('yes')}
                                        checked={hasProvider === 'yes'}
                                    />
                                    <FormControlLabel
                                        value="no"
                                        control={<Radio />}
                                        label="No"
                                        onChange={() => onProviderSelectionChange('no')}
                                        checked={hasProvider === 'no'}
                                    />
                                </RadioGroup>
                            </FormControl>
                        </Box>
                    )}

                    {/* Doctor Selection */}
                    {isPatient && hasProvider === 'yes' && (
                        <Box>
                            <FormLabel>Select Doctor</FormLabel>
                            <Select
                                options={doctorOptions}
                                placeholder="Search or select doctor..."
                                onChange={onDoctorSelection}
                                isClearable
                                styles={{
                                    control: (base) => ({ ...base, minHeight: 40 }),
                                    menu: (base) => ({ ...base, zIndex: 9999 }),
                                }}
                            />
                        </Box>
                    )}

                    {/* Contact Information Alert */}
                    {requiresContact && (
                        <Box>
                            {!formData.email || !formData.phone_number ? (
                                <Alert severity="error">
                                    Please provide us with your contact details.
                                </Alert>
                            ) : (
                                <Alert severity="info" sx={{ fontWeight: 700 }}>
                                    A representative will reach out to you shortly after registration. Thank you!
                                </Alert>
                            )}
                        </Box>
                    )}

                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        size="large"
                        sx={{ mt: 2 }}
                        fullWidth
                        disabled={loading}
                    >
                        {loading ? 'Registering...' : 'Register'}
                    </Button>
                </Stack>
            </form>
        </Box>
    );
};

export default RegistrationForm;
