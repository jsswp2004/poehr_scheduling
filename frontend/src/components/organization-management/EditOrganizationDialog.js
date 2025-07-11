/**
 * EditOrganizationDialog component - Dialog for editing existing organizations
 */
import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Avatar,
    Typography,
    IconButton,
    Stack,
} from '@mui/material';
import { Upload, Business } from '@mui/icons-material';
import { getLogoUrl } from '../../utils/organization/organizationUtils';

const EditOrganizationDialog = ({
    open,
    onClose,
    organization,
    formData,
    setFormData,
    formErrors,
    previewLogo,
    onLogoChange,
    onSubmit,
    saving,
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Edit Organization: {organization?.name}
            </DialogTitle>

            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    {/* Organization Name */}
                    <TextField
                        autoFocus
                        label="Organization Name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        fullWidth
                        error={!!formErrors.name}
                        helperText={formErrors.name}
                        required
                    />

                    {/* Logo Upload */}
                    <Box>
                        <Typography variant="subtitle1" gutterBottom>
                            Organization Logo
                        </Typography>

                        <Stack direction="row" spacing={2} alignItems="center">
                            <Avatar
                                src={previewLogo ? getLogoUrl(previewLogo) : getLogoUrl(organization?.logo)}
                                sx={{ width: 80, height: 80 }}
                            >
                                <Business />
                            </Avatar>

                            <Box>
                                <input
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id="edit-logo-upload"
                                    type="file"
                                    onChange={onLogoChange}
                                />
                                <label htmlFor="edit-logo-upload">
                                    <IconButton
                                        color="primary"
                                        aria-label="upload logo"
                                        component="span"
                                        size="large"
                                    >
                                        <Upload />
                                    </IconButton>
                                </label>

                                <Typography variant="body2" color="text.secondary">
                                    Click to change logo
                                    <br />
                                    (JPEG, PNG, GIF - Max 5MB)
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    onClick={onSubmit}
                    variant="contained"
                    disabled={saving}
                >
                    {saving ? 'Updating...' : 'Update'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EditOrganizationDialog;
