import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    Button,
    Paper,
    Chip,
    FormControlLabel,
    Checkbox,
    IconButton,
    Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';

/**
 * User information panel component
 */
const UserInfoPanel = ({
    currentUser,
    phoneEditing,
    smsConsentEditing,
    tempPhoneNumber,
    tempSmsConsent,
    onPhoneEdit,
    onPhoneCancel,
    onPhoneSave,
    onSmsConsentEdit,
    onSmsConsentCancel,
    onSmsConsentSave,
    onTempPhoneChange,
    onTempSmsConsentChange,
}) => {
    if (!currentUser) {
        return (
            <Paper elevation={2} sx={{ padding: 3 }}>
                <Typography variant="body1">Loading user information...</Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={2} sx={{ padding: 3 }}>
            <Typography variant="h6" gutterBottom>
                My Information
            </Typography>

            <Stack spacing={3}>
                {/* Basic Info */}
                <Box>
                    <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                        Personal Details
                    </Typography>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Name
                            </Typography>
                            <Typography variant="body1">
                                {currentUser.first_name} {currentUser.last_name}
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Username
                            </Typography>
                            <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                                {currentUser.username}
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EmailIcon fontSize="small" color="action" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">
                                    Email
                                </Typography>
                                <Typography variant="body1">
                                    {currentUser.email}
                                </Typography>
                            </Box>
                        </Box>
                    </Stack>
                </Box>

                <Divider />

                {/* Phone Number Section */}
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PhoneIcon fontSize="small" color="action" />
                            <Typography variant="subtitle1" fontWeight="medium">
                                Phone Number
                            </Typography>
                        </Box>
                        {!phoneEditing && (
                            <IconButton size="small" onClick={onPhoneEdit}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>

                    {phoneEditing ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <TextField
                                fullWidth
                                size="small"
                                value={tempPhoneNumber}
                                onChange={(e) => onTempPhoneChange(e.target.value)}
                                placeholder="(555) 123-4567"
                                label="Phone Number"
                            />
                            <IconButton size="small" onClick={onPhoneSave} color="primary">
                                <SaveIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={onPhoneCancel} color="secondary">
                                <CancelIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    ) : (
                        <Typography variant="body1">
                            {currentUser.phone_number || 'No phone number set'}
                        </Typography>
                    )}
                </Box>

                <Divider />

                {/* SMS Consent Section */}
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight="medium">
                            SMS Notifications
                        </Typography>
                        {!smsConsentEditing && (
                            <IconButton size="small" onClick={onSmsConsentEdit}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>

                    {smsConsentEditing ? (
                        <Stack spacing={2}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={tempSmsConsent}
                                        onChange={(e) => onTempSmsConsentChange(e.target.checked)}
                                    />
                                }
                                label="I consent to receive SMS notifications"
                            />
                            <Stack direction="row" spacing={1}>
                                <Button size="small" onClick={onSmsConsentSave} variant="contained">
                                    Save
                                </Button>
                                <Button size="small" onClick={onSmsConsentCancel} variant="outlined">
                                    Cancel
                                </Button>
                            </Stack>
                        </Stack>
                    ) : (
                        <Chip
                            label={currentUser.sms_consent ? 'SMS Enabled' : 'SMS Disabled'}
                            color={currentUser.sms_consent ? 'success' : 'default'}
                            size="small"
                        />
                    )}
                </Box>

                {/* Role Information */}
                <Box>
                    <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                        Account Details
                    </Typography>
                    <Stack spacing={1}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Role
                            </Typography>
                            <Chip
                                label={currentUser.role || 'User'}
                                color="primary"
                                size="small"
                                sx={{ textTransform: 'capitalize' }}
                            />
                        </Box>
                        {currentUser.organization && (
                            <Box>
                                <Typography variant="body2" color="text.secondary">
                                    Organization
                                </Typography>
                                <Typography variant="body1">
                                    {typeof currentUser.organization === 'object'
                                        ? currentUser.organization.name
                                        : currentUser.organization}
                                </Typography>
                            </Box>
                        )}
                    </Stack>
                </Box>
            </Stack>
        </Paper>
    );
};

export default UserInfoPanel;
