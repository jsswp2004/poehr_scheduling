import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    Button,
    Paper,
    Grid,
    Chip,
    Alert,
    CircularProgress,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';

/**
 * Communication panel for email and SMS
 */
const CommunicationPanel = ({
    emailForm,
    smsForm,
    emailSending,
    smsSending,
    messageSent,
    smsSent,
    onEmailFormChange,
    onSmsFormChange,
    onSendEmail,
    onSendSMS,
    onAttachment,
    onRemoveAttachment,
}) => {
    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                Message Your Provider
            </Typography>

            <Grid container spacing={3}>
                {/* Email Section */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ padding: 3 }}>
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EmailIcon color="primary" />
                                <Typography variant="subtitle1" fontWeight="medium">
                                    Send Email
                                </Typography>
                            </Box>

                            {messageSent && (
                                <Alert severity="success">
                                    Email sent successfully!
                                </Alert>
                            )}

                            <TextField
                                fullWidth
                                label="To"
                                value={emailForm.to}
                                onChange={(e) => onEmailFormChange('to', e.target.value)}
                                placeholder="doctor@example.com"
                                size="small"
                            />

                            <Stack direction="row" spacing={2}>
                                <TextField
                                    fullWidth
                                    label="CC"
                                    value={emailForm.cc}
                                    onChange={(e) => onEmailFormChange('cc', e.target.value)}
                                    placeholder="Optional"
                                    size="small"
                                />
                                <TextField
                                    fullWidth
                                    label="BCC"
                                    value={emailForm.bcc}
                                    onChange={(e) => onEmailFormChange('bcc', e.target.value)}
                                    placeholder="Optional"
                                    size="small"
                                />
                            </Stack>

                            <TextField
                                fullWidth
                                label="Subject"
                                value={emailForm.subject}
                                onChange={(e) => onEmailFormChange('subject', e.target.value)}
                                placeholder="Appointment inquiry"
                                size="small"
                            />

                            <TextField
                                fullWidth
                                label="Message"
                                value={emailForm.message}
                                onChange={(e) => onEmailFormChange('message', e.target.value)}
                                multiline
                                rows={4}
                                placeholder="Please type your message here..."
                            />

                            {/* Attachments */}
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                    Attachments
                                </Typography>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    size="small"
                                    sx={{ marginBottom: 1 }}
                                >
                                    Add File
                                    <input
                                        type="file"
                                        hidden
                                        multiple
                                        onChange={(e) => onAttachment(e.target.files)}
                                    />
                                </Button>

                                {emailForm.attachments.length > 0 && (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                        {emailForm.attachments.map((file, index) => (
                                            <Chip
                                                key={index}
                                                label={file.name}
                                                size="small"
                                                onDelete={() => onRemoveAttachment(index)}
                                            />
                                        ))}
                                    </Box>
                                )}
                            </Box>

                            <Button
                                variant="contained"
                                onClick={onSendEmail}
                                disabled={emailSending || !emailForm.to || !emailForm.subject || !emailForm.message}
                                startIcon={emailSending ? <CircularProgress size={20} /> : <EmailIcon />}
                                fullWidth
                            >
                                {emailSending ? 'Sending...' : 'Send Email'}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>

                {/* SMS Section */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ padding: 3 }}>
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SmsIcon color="primary" />
                                <Typography variant="subtitle1" fontWeight="medium">
                                    Send SMS
                                </Typography>
                            </Box>

                            {smsSent && (
                                <Alert severity="success">
                                    SMS sent successfully!
                                </Alert>
                            )}

                            <TextField
                                fullWidth
                                label="Phone Number"
                                value={smsForm.phone}
                                onChange={(e) => onSmsFormChange('phone', e.target.value)}
                                placeholder="+1 (555) 123-4567"
                                size="small"
                            />

                            <TextField
                                fullWidth
                                label="Message"
                                value={smsForm.message}
                                onChange={(e) => onSmsFormChange('message', e.target.value)}
                                multiline
                                rows={4}
                                helperText={`${smsForm.message.length}/160 characters`}
                                inputProps={{ maxLength: 160 }}
                            />

                            <Button
                                variant="contained"
                                onClick={onSendSMS}
                                disabled={smsSending || !smsForm.phone || !smsForm.message}
                                startIcon={smsSending ? <CircularProgress size={20} /> : <SmsIcon />}
                                fullWidth
                            >
                                {smsSending ? 'Sending...' : 'Send SMS'}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default CommunicationPanel;
