import React, { useRef } from 'react';
import {
    Box,
    Stack,
    TextField,
    Button,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Avatar,
    CircularProgress,
    Paper,
    Divider,
} from '@mui/material';
import CreatableSelect from "react-select/creatable";
import axios from "axios";
import { toast } from 'react-toastify';

/**
 * CreateProfileForm Component
 * Form component for creating new user profiles with two-column layout
 */
const CreateProfileForm = ({
    formData,
    formFields,
    roleOptions,
    organizations,
    submitting,
    onSubmit,
    onChange,
    addOrganization,
}) => {
    const fileInputRef = useRef();
    const token = localStorage.getItem("access_token");

    // Handle organization creation
    const handleOrganizationChange = (option) => {
        if (option && option.__isNew__) {
            axios
                .post(
                    "http://127.0.0.1:8000/api/users/organizations/",
                    { name: option.label },
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                )
                .then((res) => {
                    addOrganization(res.data);
                    onChange({
                        target: {
                            name: 'organization',
                            value: res.data.id
                        }
                    });
                    toast.success("Organization created!");
                })
                .catch(() => toast.error("Failed to create organization"));
        } else {
            onChange({
                target: {
                    name: 'organization',
                    value: option ? option.value : ""
                }
            });
        }
    };

    return (
        <form onSubmit={onSubmit} encType="multipart/form-data">
            <Divider sx={{ mb: 3 }} />
            <Typography variant="h6" sx={{ mb: 3 }}>
                Profile Information
            </Typography>

            {/* Two-Column Layout */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr",
                    gap: 4,
                    alignItems: "start",
                    mb: 4,
                }}
            >
                {/* Left Column - Profile Picture and Organization */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {/* Profile Picture Section */}
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                        }}
                    >
                        <Avatar
                            src={
                                formData.profile_picture
                                    ? URL.createObjectURL(formData.profile_picture)
                                    : undefined
                            }
                            alt="Profile Preview"
                            sx={{
                                width: 160,
                                height: 160,
                                borderRadius: 3,
                                bgcolor: formData.profile_picture ? "transparent" : "grey.300",
                                fontSize: "4rem",
                                border: "3px solid",
                                borderColor: "primary.light",
                                boxShadow: 2,
                            }}
                            variant="square"
                        >
                            {!formData.profile_picture && (formData.first_name?.[0] || "U")}
                        </Avatar>

                        {/* Upload Profile Picture Button */}
                        <Button
                            variant="contained"
                            component="label"
                            size="medium"
                            disabled={submitting}
                            startIcon={
                                submitting ? (
                                    <CircularProgress size={16} color="inherit" />
                                ) : null
                            }
                            sx={{
                                minWidth: 160,
                                borderRadius: 2,
                                textTransform: "none",
                                fontWeight: 600,
                            }}
                        >
                            Upload Picture
                            <input
                                type="file"
                                name="profile_picture"
                                accept="image/png, image/jpeg"
                                hidden
                                ref={fileInputRef}
                                onChange={onChange}
                            />
                        </Button>

                        {formData.profile_picture && (
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'success.main',
                                    textAlign: 'center',
                                    fontWeight: 500
                                }}
                            >
                                ✓ {formData.profile_picture.name}
                            </Typography>
                        )}
                    </Box>

                    {/* Organization Field */}
                    <Box>
                        <Typography
                            variant="subtitle1"
                            sx={{ mb: 1, fontWeight: 600, color: "primary.main" }}
                        >
                            Organization *
                        </Typography>
                        <CreatableSelect
                            name="organization"
                            value={
                                organizations
                                    .map((org) => ({
                                        value: org.id,
                                        label: org.name,
                                        id: org.id,
                                    }))
                                    .find(
                                        (opt) => String(opt.value) === String(formData.organization)
                                    ) || null
                            }
                            onChange={handleOrganizationChange}
                            options={organizations.map((org) => ({
                                value: org.id,
                                label: org.name,
                                id: org.id,
                            }))}
                            isClearable
                            isSearchable
                            placeholder="Select or type to add organization..."
                            formatCreateLabel={(inputValue) => `Add "${inputValue}"`}
                            styles={{
                                control: (base) => ({
                                    ...base,
                                    minHeight: 40,
                                    borderRadius: 8,
                                }),
                                menu: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                        />
                    </Box>
                </Box>

                {/* Right Column - User Information Fields */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
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
                            variant="outlined"
                            placeholder={field.name === 'phone_number' ? '(123) 456-7890' : undefined}
                            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                        />
                    ))}

                    {/* Role Selection */}
                    <Box>
                        <Typography
                            variant="subtitle1"
                            sx={{ mb: 1, fontWeight: 600, color: "primary.main" }}
                        >
                            Role *
                        </Typography>
                        <FormControl fullWidth size="small">
                            <InputLabel id="role-label">Role</InputLabel>
                            <Select
                                labelId="role-label"
                                name="role"
                                value={formData.role}
                                label="Role"
                                onChange={onChange}
                                required
                                sx={{ borderRadius: 2 }}
                            >
                                <MenuItem value="">
                                    <em>Select a role</em>
                                </MenuItem>
                                {roleOptions
                                    .filter(option => option.value !== '') // Remove the default empty option
                                    .map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                            </Select>
                        </FormControl>
                    </Box>
                </Box>
            </Box>

            {/* Submit Button Section - Full Width Below */}
            <Box sx={{ mt: 4 }}>
                <Divider sx={{ mb: 3 }} />
                <Box sx={{ display: "flex", justifyContent: "center" }}>
                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={submitting}
                        sx={{
                            minWidth: 200,
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 600,
                            py: 1.5,
                            fontSize: "1.1rem",
                        }}
                    >
                        {submitting ? (
                            <>
                                <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                                Creating Profile...
                            </>
                        ) : (
                            'Create Profile'
                        )}
                    </Button>
                </Box>
            </Box>
        </form>
    );
};

export default CreateProfileForm;
