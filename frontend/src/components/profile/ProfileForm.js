import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    IconButton,
    Avatar,
    Button,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import CreatableSelect from 'react-select/creatable';

/**
 * Profile form component for editing user information
 */
const ProfileForm = ({
    profile,
    editingProfile,
    profileLoading,
    isSystemAdmin,
    availableRoles,
    currentUser,
    fileInputRef,
    onProfileChange,
    onEditToggle,
    onSave,
    onCancel,
    onFileUpload,
}) => {
    return (
        <Box sx={{ marginBottom: 4 }}>


            {/* Header with Edit Controls */}
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ marginBottom: 2 }}
            >
                <Typography variant="h6">Profile Information</Typography>
                <Stack direction="row" spacing={1}>
                    {editingProfile ? (
                        <>
                            <IconButton
                                onClick={onSave}
                                disabled={profileLoading}
                                color="primary"
                                title="Save Changes"
                            >
                                {profileLoading ? (
                                    <CircularProgress size={20} />
                                ) : (
                                    <SaveIcon />
                                )}
                            </IconButton>
                            <IconButton
                                onClick={onCancel}
                                color="secondary"
                                title="Cancel Changes"
                            >
                                <CancelIcon />
                            </IconButton>
                        </>
                    ) : (
                        <IconButton
                            onClick={onEditToggle}
                            color="primary"
                            title="Edit Profile"
                        >
                            <EditIcon />
                        </IconButton>
                    )}
                </Stack>
            </Stack>

            {/* Profile Picture Section */}
            <Box sx={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
                <Avatar
                    src={profile.profile_picture}
                    sx={{
                        width: 80,
                        height: 80,
                        marginRight: 2,
                        border: '3px solid',
                        borderColor: 'primary.light',
                    }}
                >
                    {profile.first_name?.[0]}{profile.last_name?.[0]}
                </Avatar>
                <Button
                    variant="outlined"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!editingProfile}
                    sx={{ textTransform: 'none' }}
                >
                    Change Picture
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept="image/*"
                    onChange={onFileUpload}
                />
            </Box>

            {/* Form Fields */}
            <Stack spacing={3}>
                {/* Name Fields */}
                <Stack direction="row" spacing={2}>
                    <TextField
                        fullWidth
                        label="First Name"
                        value={profile.first_name || ''}
                        onChange={(e) =>
                            onProfileChange({
                                ...profile,
                                first_name: e.target.value,
                            })
                        }
                        disabled={!editingProfile}
                        variant="outlined"
                    />
                    <TextField
                        fullWidth
                        label="Last Name"
                        value={profile.last_name || ''}
                        onChange={(e) =>
                            onProfileChange({
                                ...profile,
                                last_name: e.target.value,
                            })
                        }
                        disabled={!editingProfile}
                        variant="outlined"
                    />
                </Stack>

                {/* Username */}
                <TextField
                    fullWidth
                    label="Username"
                    value={profile.username || ''}
                    onChange={(e) =>
                        onProfileChange({
                            ...profile,
                            username: e.target.value,
                        })
                    }
                    disabled={!editingProfile}
                    variant="outlined"
                />

                {/* Email */}
                <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={profile.email || ''}
                    onChange={(e) =>
                        onProfileChange({
                            ...profile,
                            email: e.target.value,
                        })
                    }
                    disabled={!editingProfile}
                    variant="outlined"
                />

                {/* Roles Selection (System Admin only) */}
                {isSystemAdmin && (
                    <Box>
                        <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                            Roles
                        </Typography>
                        <CreatableSelect
                            isMulti
                            value={availableRoles.filter((role) =>
                                profile.roles?.includes(role.value)
                            )}
                            onChange={(selectedRoles) =>
                                onProfileChange({
                                    ...profile,
                                    roles: selectedRoles.map((role) => role.value),
                                })
                            }
                            options={availableRoles}
                            isDisabled={!editingProfile}
                            placeholder="Select user roles..."
                            styles={{
                                control: (base, state) => ({
                                    ...base,
                                    minHeight: 56, // Match MUI TextField height
                                    backgroundColor: '#ffffff', // Solid white background
                                    border: state.isFocused ? '2px solid #1976d2' : '1px solid #c4c4c4',
                                    borderRadius: 4,
                                    boxShadow: state.isFocused ? '0 0 0 1px #1976d2' : 'none',
                                    '&:hover': {
                                        borderColor: state.isFocused ? '#1976d2' : '#000',
                                    },
                                }),
                                valueContainer: (base) => ({
                                    ...base,
                                    backgroundColor: '#ffffff', // Ensure value container has white background
                                }),
                                input: (base) => ({
                                    ...base,
                                    color: '#000', // Black text for input
                                }),
                                singleValue: (base) => ({
                                    ...base,
                                    color: '#000', // Black text for single values
                                }),
                                placeholder: (base) => ({
                                    ...base,
                                    color: '#999',
                                    backgroundColor: 'transparent',
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: '#ffffff', // White background for dropdown menu
                                    border: '1px solid #c4c4c4',
                                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                    zIndex: 9999,
                                }),
                                option: (base, state) => ({
                                    ...base,
                                    backgroundColor: state.isSelected
                                        ? '#1976d2'
                                        : state.isFocused
                                            ? '#e3f2fd'
                                            : '#ffffff',
                                    color: state.isSelected ? '#ffffff' : '#000',
                                    '&:hover': {
                                        backgroundColor: state.isSelected ? '#1976d2' : '#e3f2fd',
                                    },
                                }),
                                multiValue: (base) => ({
                                    ...base,
                                    backgroundColor: '#e3f2fd',
                                }),
                                multiValueLabel: (base) => ({
                                    ...base,
                                    color: '#1976d2',
                                    backgroundColor: 'transparent',
                                }),
                                multiValueRemove: (base) => ({
                                    ...base,
                                    color: '#1976d2',
                                    backgroundColor: 'transparent',
                                    '&:hover': {
                                        backgroundColor: '#1976d2',
                                        color: 'white',
                                    },
                                }),
                            }}
                        />
                    </Box>
                )}

                {/* Organization (Read-only) */}
                <TextField
                    fullWidth
                    label="Organization"
                    value={profile.organization || 'No organization assigned'}
                    disabled
                    variant="outlined"
                />

                {/* Active Status (System Admin only) */}
                {isSystemAdmin && (
                    <FormControl fullWidth disabled={!editingProfile}>
                        <InputLabel>Status</InputLabel>
                        <MUISelect
                            value={profile.is_active ? "active" : "inactive"}
                            onChange={(e) =>
                                onProfileChange({
                                    ...profile,
                                    is_active: e.target.value === "active",
                                })
                            }
                            label="Status"
                        >
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                        </MUISelect>
                    </FormControl>
                )}
            </Stack>
        </Box>
    );
};

export default ProfileForm;
