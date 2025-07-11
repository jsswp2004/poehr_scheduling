import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    IconButton,
    Box,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

function EmailModal({
    open,
    onClose,
    selectedPatient,
    emailForm,
    setEmailForm,
    onSend,
    loading = false,
}) {
    const handleSubjectChange = (event) => {
        setEmailForm(prev => ({
            ...prev,
            subject: event.target.value
        }));
    };

    const handleMessageChange = (event) => {
        setEmailForm(prev => ({
            ...prev,
            message: event.target.value
        }));
    };

    const handleSend = () => {
        if (!emailForm.subject.trim() || !emailForm.message.trim()) {
            return;
        }
        onSend();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { minHeight: 400 }
            }}
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6">
                        Send Email to {selectedPatient?.first_name} {selectedPatient?.last_name}
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {/* Recipient Info */}
                    <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            To: {selectedPatient?.email}
                        </Typography>
                    </Box>

                    {/* Subject Field */}
                    <TextField
                        label="Subject"
                        value={emailForm.subject}
                        onChange={handleSubjectChange}
                        fullWidth
                        required
                        variant="outlined"
                    />

                    {/* Message Field */}
                    <TextField
                        label="Message"
                        value={emailForm.message}
                        onChange={handleMessageChange}
                        fullWidth
                        required
                        multiline
                        rows={8}
                        variant="outlined"
                        placeholder="Type your message here..."
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2, pt: 0 }}>
                <Button onClick={onClose} color="secondary">
                    Cancel
                </Button>
                <Button
                    onClick={handleSend}
                    variant="contained"
                    disabled={loading || !emailForm.subject.trim() || !emailForm.message.trim()}
                >
                    {loading ? 'Sending...' : 'Send Email'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default EmailModal;
