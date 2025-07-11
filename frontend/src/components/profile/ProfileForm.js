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
                    <FormControl fullWidth disabled={!editingProfile}>
                        <InputLabel>Roles</InputLabel>
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
                                control: (base) => ({
                                    ...base,
                                    minHeight: 56, // Match MUI TextField height
                                }),
                            }}
                        />
                    </FormControl>
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
