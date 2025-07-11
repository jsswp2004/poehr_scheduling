import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    Button,
    Collapse,
    CircularProgress,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';

/**
 * Password change form component
 */
const PasswordForm = ({
    showPasswordChange,
    passwordData,
    passwordLoading,
    onTogglePasswordForm,
    onPasswordDataChange,
    onPasswordSubmit,
    onCancel,
}) => {
    return (
        <Box>
            {/* Header */}
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ marginBottom: 2 }}
            >
                <Typography variant="h6">Security</Typography>
                <Button
                    variant="outlined"
                    startIcon={<LockResetIcon />}
                    onClick={onTogglePasswordForm}
                    sx={{ textTransform: 'none' }}
                >
                    {showPasswordChange ? 'Cancel' : 'Change Password'}
                </Button>
            </Stack>

            {/* Password Change Form */}
            <Collapse in={showPasswordChange}>
                <Box sx={{
                    backgroundColor: '#fafafa',
                    padding: 3,
                    borderRadius: 2,
                    border: '1px solid #e0e0e0',
                }}>
                    <Stack spacing={3}>
                        <TextField
                            fullWidth
                            type="password"
                            label="Current Password"
                            value={passwordData.current_password || ''}
                            onChange={(e) =>
                                onPasswordDataChange("current_password", e.target.value)
                            }
                            variant="outlined"
                            autoComplete="current-password"
                        />

                        <TextField
                            fullWidth
                            type="password"
                            label="New Password"
                            value={passwordData.new_password || ''}
                            onChange={(e) =>
                                onPasswordDataChange("new_password", e.target.value)
                            }
                            variant="outlined"
                            autoComplete="new-password"
                            helperText="Password should be at least 8 characters long"
                        />

                        <TextField
                            fullWidth
                            type="password"
                            label="Confirm New Password"
                            value={passwordData.confirm_password || ''}
                            onChange={(e) =>
                                onPasswordDataChange("confirm_password", e.target.value)
                            }
                            variant="outlined"
                            autoComplete="new-password"
                            error={
                                passwordData.new_password &&
                                passwordData.confirm_password &&
                                passwordData.new_password !== passwordData.confirm_password
                            }
                            helperText={
                                passwordData.new_password &&
                                    passwordData.confirm_password &&
                                    passwordData.new_password !== passwordData.confirm_password
                                    ? "Passwords do not match"
                                    : ""
                            }
                        />

                        {/* Action Buttons */}
                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                            <Button
                                variant="outlined"
                                onClick={onCancel}
                                disabled={passwordLoading}
                                sx={{ textTransform: 'none' }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={onPasswordSubmit}
                                disabled={
                                    passwordLoading ||
                                    !passwordData.current_password ||
                                    !passwordData.new_password ||
                                    !passwordData.confirm_password ||
                                    passwordData.new_password !== passwordData.confirm_password
                                }
                                sx={{ textTransform: 'none' }}
                            >
                                {passwordLoading ? (
                                    <>
                                        <CircularProgress size={20} sx={{ marginRight: 1 }} />
                                        Updating...
                                    </>
                                ) : (
                                    "Update Password"
                                )}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Collapse>
        </Box>
    );
};

export default PasswordForm;
