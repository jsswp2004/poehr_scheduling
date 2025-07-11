import React from 'react';
import {
    Stack,
    TextField,
    Button,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';

/**
 * CreateProfileForm Component
 * Form component for creating new user profiles
 */
const CreateProfileForm = ({
    formData,
    formFields,
    roleOptions,
    organizations,
    submitting,
    onSubmit,
    onChange,
}) => {
    return (
        <form onSubmit={onSubmit} encType="multipart/form-data">
            <Stack spacing={2}>
                {/* Text input fields */}
                {formFields.map((field) => (
                    <TextField
                        key={field.name}
                        label={field.label}
                        type={field.type}
                        name={field.name}
                        onChange={onChange}
                        value={formData[field.name]}
                        fullWidth
                        required
                        size="small"
                    />
                ))}

                {/* Profile picture upload */}
                <Button
                    variant="outlined"
                    component="label"
                    sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                    Upload Profile Picture
                    <input
                        type="file"
                        name="profile_picture"
                        accept="image/*"
                        hidden
                        onChange={onChange}
                    />
                </Button>

                {formData.profile_picture && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
                        {formData.profile_picture.name}
                    </Typography>
                )}

                {/* Role selection */}
                <FormControl fullWidth size="small">
                    <InputLabel id="role-label">Role</InputLabel>
                    <Select
                        labelId="role-label"
                        name="role"
                        value={formData.role}
                        label="Role"
                        onChange={onChange}
                        required
                    >
                        {roleOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                <em>{option.label}</em>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Organization selection */}
                <FormControl fullWidth size="small">
                    <InputLabel id="organization-label">Organization</InputLabel>
                    <Select
                        labelId="organization-label"
                        name="organization"
                        value={formData.organization}
                        label="Organization"
                        onChange={onChange}
                        required
                    >
                        <MenuItem value="">
                            <em>Select an organization</em>
                        </MenuItem>
                        {organizations.map((org) => (
                            <MenuItem key={org.id} value={org.id}>
                                {org.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Submit button */}
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={submitting}
                    fullWidth
                >
                    {submitting ? 'Saving...' : 'Save'}
                </Button>
            </Stack>
        </form>
    );
};

export default CreateProfileForm;
