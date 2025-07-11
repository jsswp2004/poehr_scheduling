import React from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    FormControlLabel,
    Checkbox,
    Alert
} from '@mui/material';
import {
    Send as SendIcon,
    Email as EmailIcon,
    Sms as SmsIcon
} from '@mui/icons-material';

/**
 * Bulk messaging component
 * Handles message composition and sending to all contacts
 */
const BulkMessageForm = ({
    contacts,
    messageForm,
    sending,
    onMessageChange,
    onCheckboxChange,
    onSendMessage
}) => {
    return (
        <Box>
            <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 3 }}>
                    Send Bulk Message
                </Typography>

                {/* Contact Count Alert */}
                {contacts.length === 0 ? (
                    <Alert severity="warning" sx={{ mb: 3 }}>
                        You need to add contacts before you can send messages. Switch to the Contacts tab to add contacts.
                    </Alert>
                ) : (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        This message will be sent to all {contacts.length} contacts in your list.
                    </Alert>
                )}

                {/* Delivery Method Selection */}
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={messageForm.send_sms}
                                onChange={(e) => onCheckboxChange('send_sms', e.target.checked)}
                                color="success"
                            />
                        }
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SmsIcon color="success" />
                                Send SMS
                            </Box>
                        }
                    />

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={messageForm.send_email}
                                onChange={(e) => onCheckboxChange('send_email', e.target.checked)}
                                color="info"
                            />
                        }
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EmailIcon color="info" />
                                Send Email
                            </Box>
                        }
                    />
                </Box>

                {/* Email Subject Field */}
                {messageForm.send_email && (
                    <TextField
                        fullWidth
                        label="Email Subject"
                        value={messageForm.subject}
                        onChange={(e) => onMessageChange('subject', e.target.value)}
                        sx={{ mb: 3 }}
                    />
                )}

                {/* Message Text Area */}
                <TextField
                    fullWidth
                    multiline
                    rows={6}
                    label="Message"
                    value={messageForm.message}
                    onChange={(e) => onMessageChange('message', e.target.value)}
                    placeholder="Enter your message here..."
                    sx={{ mb: 3 }}
                />

                {/* Send Button */}
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<SendIcon />}
                    onClick={onSendMessage}
                    disabled={contacts.length === 0 || sending}
                    sx={{ mr: 2 }}
                >
                    {sending ? 'Sending...' : `Send to ${contacts.length} Contacts`}
                </Button>
            </Paper>
        </Box>
    );
};

export default BulkMessageForm;
