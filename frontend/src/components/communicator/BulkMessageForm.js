import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import ConfirmDialog from './ConfirmDialog';

/**
 * Bulk messaging. Compose on the left, recipient summary on the right.
 * Sending asks for confirmation first, with the real recipient counts.
 */
const BulkMessageForm = ({
    contacts,
    messageForm,
    sending,
    error,
    onMessageChange,
    onCheckboxChange,
    onSendMessage
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const counts = useMemo(() => {
        const hasPhone = (c) => !!(c.phone && c.phone.trim());
        const hasEmail = (c) => !!(c.email && c.email.trim());
        const textable = contacts.filter((c) => hasPhone(c) && !c.opted_out);
        const emailable = contacts.filter(hasEmail);
        const reached = contacts.filter(
            (c) =>
                (messageForm.send_sms && hasPhone(c) && !c.opted_out) ||
                (messageForm.send_email && hasEmail(c))
        );
        return {
            total: contacts.length,
            text: textable.length,
            email: emailable.length,
            optedOut: contacts.filter((c) => hasPhone(c) && c.opted_out).length,
            noPhone: contacts.filter((c) => !hasPhone(c)).length,
            reached: reached.length
        };
    }, [contacts, messageForm.send_sms, messageForm.send_email]);

    const nothingChosen = !messageForm.send_sms && !messageForm.send_email;
    const canSend = !sending && counts.reached > 0 && messageForm.message.trim() !== '' && !nothingChosen;
    const length = messageForm.message.length;

    const handleConfirm = async () => {
        await onSendMessage();
        setConfirmOpen(false);
    };

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>Send message</Typography>

            <Alert severity="warning" sx={{ mb: 1.5, py: 0 }}>
                Don’t include patient information. Text and email are not secure channels.
            </Alert>

            {contacts.length === 0 && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                    Add contacts on the Contacts tab before sending a message.
                </Alert>
            )}
            {error && (
                <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start' }}>
                <Stack spacing={2} sx={{ flex: '999 1 520px', minWidth: 0, maxWidth: 760 }}>
                    <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={messageForm.send_sms}
                                    onChange={(e) => onCheckboxChange('send_sms', e.target.checked)}
                                />
                            }
                            label="Text message (SMS)"
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={messageForm.send_email}
                                    onChange={(e) => onCheckboxChange('send_email', e.target.checked)}
                                />
                            }
                            label="Email"
                        />
                    </Stack>

                    {messageForm.send_email && (
                        <TextField
                            fullWidth
                            size="small"
                            label="Subject"
                            value={messageForm.subject}
                            onChange={(e) => onMessageChange('subject', e.target.value)}
                        />
                    )}

                    <TextField
                        fullWidth
                        multiline
                        minRows={6}
                        label="Message"
                        value={messageForm.message}
                        onChange={(e) => onMessageChange('message', e.target.value)}
                        helperText={
                            messageForm.send_sms
                                ? `${length} characters. Texts over 160 characters are sent as more than one message.`
                                : `${length} characters.`
                        }
                    />

                    <Stack direction="row" spacing={1} alignItems="center">
                        <Button
                            variant="contained"
                            startIcon={<FontAwesomeIcon icon={faPaperPlane} />}
                            disabled={!canSend}
                            onClick={() => setConfirmOpen(true)}
                        >
                            {sending ? 'Sending...' : `Send to ${counts.reached} contacts`}
                        </Button>
                        <Button
                            disabled={sending || (!messageForm.message && messageForm.subject === 'Notification')}
                            onClick={() => {
                                onMessageChange('message', '');
                                onMessageChange('subject', 'Notification');
                            }}
                        >
                            Clear
                        </Button>
                    </Stack>
                </Stack>

                <Paper variant="outlined" component="aside" aria-label="Recipients" sx={{ flex: '1 1 280px', maxWidth: 360, p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Recipients</Typography>
                    <Stack spacing={1}>
                        {[
                            ['All contacts', counts.total],
                            ['Will get a text', counts.text],
                            ['Will get an email', counts.email]
                        ].map(([label, value]) => (
                            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">{label}</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
                            </Box>
                        ))}
                    </Stack>
                    {(counts.optedOut > 0 || counts.noPhone > 0) && (
                        <>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mt: 2, mb: 1 }}>
                                SKIPPED FOR TEXT
                            </Typography>
                            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                                {counts.optedOut > 0 && (
                                    <Chip size="small" color="error" variant="outlined" label={`${counts.optedOut} opted out`} />
                                )}
                                {counts.noPhone > 0 && (
                                    <Chip size="small" variant="outlined" label={`${counts.noPhone} no phone`} />
                                )}
                            </Stack>
                        </>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                        Contacts who replied STOP never receive texts, even if SMS is checked.
                    </Typography>
                </Paper>
            </Box>

            <ConfirmDialog
                open={confirmOpen}
                title={`Send to ${counts.reached} contacts?`}
                confirmLabel={sending ? 'Sending...' : 'Send'}
                busy={sending}
                onConfirm={handleConfirm}
                onClose={() => setConfirmOpen(false)}
            >
                {[
                    messageForm.send_sms && `a text to ${counts.text} contacts`,
                    messageForm.send_email && `an email to ${counts.email} contacts`
                ].filter(Boolean).reduce((acc, part, i) => (i === 0 ? `This sends ${part}` : `${acc} and ${part}`), '')}
                {messageForm.send_sms && (counts.optedOut > 0 || counts.noPhone > 0)
                    ? `. ${counts.optedOut} opted-out and ${counts.noPhone} without a phone are skipped for text.`
                    : '.'}
            </ConfirmDialog>
        </Box>
    );
};

export default BulkMessageForm;
