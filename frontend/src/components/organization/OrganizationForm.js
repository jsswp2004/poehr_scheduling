import React from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Stack,
    Avatar,
    Alert,
    CircularProgress
} from '@mui/material';
import { Edit, Save, Cancel, Upload } from '@mui/icons-material';

/**
 * OrganizationForm Component
 * Displays and manages the organization form for editing user's organization
 * or an organization selected by system admin
 */
const OrganizationForm = ({
    userOrganization,
    editingOrganization,
    editMode,
    saving,
    formData,
    previewLogo,
    canEdit,
    onInputChange,
    onLogoChange,
    onEditToggle,
    onSave,
    onCancel,
    getLogoUrl
}) => {
    const currentOrganization = editingOrganization || userOrganization;

    if (!currentOrganization && !editingOrganization) {
        return (
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                    My Organization
                </Typography>
                <Alert severity="info">
                    No organization found. Please contact your administrator.
                </Alert>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    {editingOrganization ? `Editing: ${editingOrganization.name}` : 'My Organization'}
                </Typography>
                {canEdit && (
                    <Stack direction="row" spacing={1}>
                        {!editMode ? (
                            <Button
                                variant="outlined"
                                startIcon={<Edit />}
                                onClick={onEditToggle}
                                size="small"
                            >
                                Edit
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="contained"
                                    startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                                    onClick={onSave}
                                    disabled={saving}
                                    size="small"
                                >
                                    Save
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<Cancel />}
                                    onClick={onCancel}
                                    disabled={saving}
                                    size="small"
                                >
                                    Cancel
                                </Button>
                            </>
                        )}
                    </Stack>
                )}
            </Stack>

            <Stack direction="row" spacing={3} alignItems="start">
                <Box>
                    <Avatar
                        src={previewLogo || getLogoUrl(currentOrganization.logo)}
                        sx={{ width: 80, height: 80, border: '2px solid #e0e0e0' }}
                        onError={() => {
                            console.log(`Main logo failed to load for ${currentOrganization.name}:`, currentOrganization.logo);
                            console.log('Attempted URL:', getLogoUrl(currentOrganization.logo));
                        }}
                    >
                        {currentOrganization.name.charAt(0).toUpperCase()}
                    </Avatar>
                    {editMode && (
                        <Stack spacing={1} sx={{ mt: 2 }}>
                            <input
                                accept="image/*"
                                style={{ display: 'none' }}
                                id="logo-upload"
                                type="file"
                                onChange={onLogoChange}
                            />
                            <label htmlFor="logo-upload">
                                <Button
                                    variant="outlined"
                                    component="span"
                                    startIcon={<Upload />}
                                    size="small"
                                    fullWidth
                                >
                                    Upload Logo
                                </Button>
                            </label>
                        </Stack>
                    )}
                </Box>

                <Box sx={{ flex: 1 }}>
                    <TextField
                        label="Organization Name"
                        name="name"
                        value={formData.name}
                        onChange={onInputChange}
                        fullWidth
                        disabled={!editMode}
                        variant={editMode ? "outlined" : "filled"}
                        sx={{ mb: 2 }}
                    />

                    <Typography variant="body2" color="text.secondary">
                        <strong>Created:</strong> {new Date(currentOrganization.created_at).toLocaleDateString()}
                    </Typography>
                </Box>
            </Stack>
        </Paper>
    );
};

export default OrganizationForm;
