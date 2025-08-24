import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Typography,
    Box,
    Chip,
    Alert,
    Divider,
    IconButton
} from '@mui/material';
import {
    Close as CloseIcon,
    Phone as PhoneIcon,
    Person as PersonIcon,
    Group as GroupIcon,
    Send as SendIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { formatPhoneForDisplay, validatePhoneNumber, getSMSCharacterInfo } from '../utils/phoneUtils';

const SMSModal = ({
    open,
    onClose,
    recipient,
    recipientType = 'patient', // 'patient' or 'team'
    onSend,
    loading = false
}) => {
    const [message, setMessage] = useState('');
    const [phoneValidation, setPhoneValidation] = useState({ isValid: true, message: '', formatted: '' });
    const [smsInfo, setSmsInfo] = useState({ count: 0, segments: 1, warning: '' });

    // Template messages based on recipient type
    const getTemplateMessages = () => {
        if (recipientType === 'patient') {
            return [
                `Hello ${recipient?.first_name || 'Patient'}, this is a reminder from your healthcare provider.`,
                `Hi ${recipient?.first_name || 'Patient'}, your appointment is confirmed for tomorrow. Please call if you need to reschedule.`,
                `${recipient?.first_name || 'Patient'}, please remember to bring your insurance card and photo ID to your appointment.`,
                `Hello ${recipient?.first_name || 'Patient'}, your test results are ready. Please call our office to discuss.`
            ];
        } else {
            return [
                `Hi ${recipient?.first_name || 'Team Member'}, regarding today's schedule change.`,
                `${recipient?.first_name || 'Team Member'}, urgent: please check your email for important updates.`,
                `Hi ${recipient?.first_name || 'Team Member'}, team meeting moved to 3 PM today.`,
                `${recipient?.first_name || 'Team Member'}, patient Mr. Smith has cancelled his 2 PM appointment.`
            ];
        }
    };

    // Modal configuration based on recipient type
    const getModalConfig = () => {
        if (recipientType === 'patient') {
            return {
                title: 'Send SMS to Patient',
                icon: <PersonIcon />,
                color: 'primary',
                subtitle: 'Patient Communication',
                placeholder: 'Type your message to the patient...',
                helpText: 'Keep messages professional and HIPAA-compliant. Avoid sharing sensitive medical information via SMS.'
            };
        } else {
            return {
                title: 'Send SMS to Team Member',
                icon: <GroupIcon />,
                color: 'secondary',
                subtitle: 'Internal Communication',
                placeholder: 'Type your message to the team member...',
                helpText: 'Internal team communication for schedule updates, notifications, and coordination.'
            };
        }
    };

    const config = getModalConfig();
    const templates = getTemplateMessages();

    // Validate phone and update SMS info when component mounts or recipient changes
    useEffect(() => {
        if (recipient?.phone_number) {
            const validation = validatePhoneNumber(recipient.phone_number);
            setPhoneValidation(validation);
        }
    }, [recipient]);

    // Update SMS character info when message changes
    useEffect(() => {
        const info = getSMSCharacterInfo(message);
        setSmsInfo(info);
    }, [message]);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setMessage('');
        }
    }, [open]);

    const handleSend = async () => {
        if (!message.trim()) {
            toast.warning('Please enter a message before sending');
            return;
        }

        if (!phoneValidation.isValid) {
            toast.error('Invalid phone number format');
            return;
        }

        try {
            await onSend({
                phone: phoneValidation.formatted,
                message: message.trim(),
                recipient,
                recipientType
            });

            // Success handling is done in parent component
            onClose();
        } catch (error) {
            // Error handling is done in parent component
            console.error('SMS send error:', error);
        }
    };

    const handleTemplateClick = (template) => {
        setMessage(template);
    };

    const getCharacterCountColor = () => {
        if (smsInfo.isOver) return 'error';
        if (smsInfo.segments > 1) return 'warning';
        return 'textSecondary';
    };

    if (!recipient) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 2 }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color: `${config.color}.main` }}>
                            {config.icon}
                        </Box>
                        <Box>
                            <Typography variant="h6" component="div">
                                {config.title}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                                {config.subtitle}
                            </Typography>
                        </Box>
                    </Box>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ pt: 1 }}>
                {/* Recipient Information */}
                <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        {recipientType === 'patient' ? 'Patient Information' : 'Team Member Information'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body1" fontWeight="medium">
                            {recipient.first_name} {recipient.last_name}
                        </Typography>
                        {recipient.role && (
                            <Chip
                                label={recipient.role}
                                size="small"
                                variant="outlined"
                                color={recipientType === 'patient' ? 'primary' : 'secondary'}
                            />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <PhoneIcon fontSize="small" color="action" />
                        <Typography variant="body2" color={phoneValidation.isValid ? 'textPrimary' : 'error'}>
                            {formatPhoneForDisplay(recipient.phone_number)}
                        </Typography>
                        {!phoneValidation.isValid && (
                            <Chip label="Invalid Format" size="small" color="error" variant="outlined" />
                        )}
                    </Box>
                    {!phoneValidation.isValid && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                            {phoneValidation.message}
                        </Alert>
                    )}
                </Box>

                {/* Message Templates */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Quick Message Templates
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {templates.slice(0, 3).map((template, index) => (
                            <Button
                                key={index}
                                variant="outlined"
                                size="small"
                                onClick={() => handleTemplateClick(template)}
                                sx={{
                                    textTransform: 'none',
                                    justifyContent: 'flex-start',
                                    maxWidth: '250px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {template.slice(0, 30)}...
                            </Button>
                        ))}
                    </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Message Input */}
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Message
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={config.placeholder}
                        variant="outlined"
                        disabled={loading}
                        helperText={config.helpText}
                    />
                </Box>

                {/* Character Count and SMS Info */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="caption" color={getCharacterCountColor()}>
                        {smsInfo.count}/160 characters
                        {smsInfo.segments > 1 && ` • ${smsInfo.segments} parts`}
                    </Typography>
                    {smsInfo.warning && (
                        <Typography variant="caption" color="warning.main">
                            {smsInfo.warning}
                        </Typography>
                    )}
                </Box>

                {/* SMS Warnings */}
                {smsInfo.isOver && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Very long messages may be truncated or charged as multiple SMS messages.
                    </Alert>
                )}

                {recipientType === 'patient' && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="caption">
                            <strong>HIPAA Compliance:</strong> Avoid sharing sensitive medical information via SMS.
                            Use general reminders and instructions only.
                        </Typography>
                    </Alert>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button
                    onClick={onClose}
                    disabled={loading}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSend}
                    disabled={loading || !message.trim() || !phoneValidation.isValid}
                    startIcon={loading ? undefined : <SendIcon />}
                    color={config.color}
                >
                    {loading ? 'Sending...' : 'Send SMS'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SMSModal;
