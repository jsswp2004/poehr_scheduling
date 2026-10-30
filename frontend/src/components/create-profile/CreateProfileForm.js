import React, { useRef } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Avatar,
    CircularProgress,
    Paper,
} from '@mui/material';
import CreatableSelect from "react-select/creatable";
import axios from "axios";
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/api';
import DictionaryField from '../dictionaries/DictionaryField';
import { moduleEnabled } from '../../utils/orgModules';

// Direct-care roles the Staffing hours and ratio checks understand.
const NURSING_ROLES = [
    { value: 'rn', label: 'RN' },
    { value: 'lpn', label: 'LPN' },
    { value: 'cna', label: 'CNA / support' },
    { value: 'other', label: 'Other (not counted toward HPPD)' },
];

export const CREATE_PROFILE_FORM_ID = 'create-profile-form';

/**
 * CreateProfileForm Component
 * Form component for creating new user profiles with two-column layout
 */
const CreateProfileForm = ({
    formData,
    formFields,
    roleOptions,
    roleDisplayType,
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
                    `${API_BASE_URL}/api/users/organizations/`,
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

    const fieldGridSx = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 };
    const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: 2 } };

    // Staff and Nurse profiles join the Staffing roster when the organization has Staffing.
    const chosenRole = roleOptions.find((o) => o.value === formData.role);
    const baseRole = chosenRole ? chosenRole.behaves_like || chosenRole.value : '';
    const joinsRoster = ['staff', 'nurse'].includes(baseRole) && moduleEnabled('staffing');

    return (
        <form id={CREATE_PROFILE_FORM_ID} onSubmit={onSubmit} encType="multipart/form-data">
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" },
                    gap: 2,
                    alignItems: "start",
                }}
            >
                {/* Left: photo and organization */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                        <Avatar
                            src={
                                formData.profile_picture
                                    ? URL.createObjectURL(formData.profile_picture)
                                    : undefined
                            }
                            alt="Profile Preview"
                            variant="square"
                            sx={{
                                width: 140,
                                height: 140,
                                borderRadius: 3,
                                bgcolor: formData.profile_picture ? "transparent" : "grey.300",
                                fontSize: "3.5rem",
                                border: "2px solid",
                                borderColor: "divider",
                            }}
                        >
                            {!formData.profile_picture && (formData.first_name?.[0] || "U")}
                        </Avatar>
                        <Button
                            variant="outlined"
                            component="label"
                            size="small"
                            fullWidth
                            disabled={submitting}
                            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : null}
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
                        <Typography
                            variant="caption"
                            sx={{ color: formData.profile_picture ? "success.main" : "text.secondary", textAlign: "center", fontWeight: formData.profile_picture ? 500 : 400 }}
                        >
                            {formData.profile_picture ? `✓ ${formData.profile_picture.name}` : "PNG or JPEG (optional)"}
                        </Typography>
                    </Box>

                    <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                            Organization *
                        </Typography>
                        <CreatableSelect
                            name="organization"
                            value={
                                organizations
                                    .map((org) => ({ value: org.id, label: org.name, id: org.id }))
                                    .find((opt) => String(opt.value) === String(formData.organization)) || null
                            }
                            onChange={handleOrganizationChange}
                            options={organizations.map((org) => ({ value: org.id, label: org.name, id: org.id }))}
                            isClearable
                            isSearchable
                            placeholder="Select or type to add organization..."
                            formatCreateLabel={(inputValue) => `Add "${inputValue}"`}
                            menuPlacement="auto"
                            styles={{
                                control: (base) => ({ ...base, minHeight: 40, borderRadius: 8 }),
                                menu: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                        />
                    </Box>
                </Paper>

                {/* Right: profile information */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Profile information
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, mb: 2 }}>
                        All fields marked * are required.
                    </Typography>
                    <Box sx={fieldGridSx}>
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
                                sx={{ ...fieldSx, ...(field.name === 'password' ? { gridColumn: { sm: "1 / -1" } } : {}) }}
                            />
                        ))}
                        <DictionaryField
                            label="Role"
                            name="role"
                            value={formData.role}
                            onChange={onChange}
                            options={roleOptions.filter((o) => o.value !== '')}
                            displayType={roleDisplayType}
                            required
                        />
                        {joinsRoster && (
                            <>
                                <TextField
                                    label="Job title (Staffing roster)"
                                    name="job_title"
                                    value={formData.job_title || ''}
                                    onChange={onChange}
                                    size="small"
                                    variant="outlined"
                                    placeholder="e.g. Night RN"
                                    helperText="This person will be added to the Staffing roster."
                                    sx={fieldSx}
                                />
                                <DictionaryField
                                    label="Nursing role"
                                    name="nursing_role"
                                    value={formData.nursing_role || ''}
                                    onChange={onChange}
                                    options={NURSING_ROLES}
                                    displayType="dropdown"
                                />
                            </>
                        )}
                    </Box>
                </Paper>
            </Box>
        </form>
    );
};

export default CreateProfileForm;
