import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import ConfirmDialog from './ConfirmDialog';
import ToolbarPortal, { STICKY_TOP } from './CommunicatorToolbarSlot';

/**
 * Bulk messaging. Compose on the left, recipient summary on the right.
 * Sending asks for confirmation first, with the real recipient counts.
 */
const BulkMessageForm = ({
    contacts,
    selectedIds = [],
    messageForm,
    sending,
    error,
    onMessageChange,
    onCheckboxChange,
    onSendMessage
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Opens on "Selected" when people were ticked on the Contacts tab; falls back to everyone if the selection empties.
    const [audience, setAudience] = useState(selectedIds.length > 0 ? 'selected' : 'all');
    const audienceMode = audience === 'selected' && selectedIds.length > 0 ? 'selected' : 'all';
    const pool = audienceMode === 'selected' ? contacts.filter((c) => selectedIds.includes(c.id)) : contacts;

    const counts = useMemo(() => {
        const hasPhone = (c) => !!(c.phone && c.phone.trim());
        const hasEmail = (c) => !!(c.email && c.email.trim());
        const textable = pool.filter((c) => hasPhone(c) && !c.opted_out);
        const emailable = pool.filter(hasEmail);
        const reached = pool.filter(
            (c) =>
                (messageForm.send_sms && hasPhone(c) && !c.opted_out) ||
                (messageForm.send_email && hasEmail(c))
        );
        return {
            total: pool.length,
            text: textable.length,
            email: emailable.length,
            optedOut: pool.filter((c) => hasPhone(c) && c.opted_out).length,
            noPhone: pool.filter((c) => !hasPhone(c)).length,
            reached: reached.length
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pool.length, contacts, selectedIds.join(','), audienceMode, messageForm.send_sms, messageForm.send_email]);

    const nothingChosen = !messageForm.send_sms && !messageForm.send_email;
    const canSend = !sending && counts.reached > 0 && messageForm.message.trim() !== '' && !nothingChosen;
    const length = messageForm.message.length;

    const handleConfirm = async () => {
        await onSendMessage(audienceMode === 'selected' ? selectedIds : undefined);
        setConfirmOpen(false);
    };

    const channel = messageForm.send_sms && messageForm.send_email ? 'both' : messageForm.send_email ? 'email' : 'sms';
    const pickChannel = (_, value) => {
        if (!value) return;
        onCheckboxChange('send_sms', value !== 'email');
        onCheckboxChange('send_email', value !== 'sms');
    };

    return (
        <Box>
            {/* Frozen toolbar (rendered into the page's pinned header block) */}
            <ToolbarPortal>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, pb: 1 }}>
                    <ToggleButtonGroup exclusive size="small" value={channel} onChange={pickChannel} aria-label="How to send">
                        <ToggleButton value="sms" sx={{ textTransform: 'none', px: 1.75 }}>Text</ToggleButton>
                        <ToggleButton value="email" sx={{ textTransform: 'none', px: 1.75 }}>Email</ToggleButton>
                        <ToggleButton value="both" sx={{ textTransform: 'none', px: 1.75 }}>Text + Email</ToggleButton>
                    </ToggleButtonGroup>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
                        Don’t include patient information. Text and email are not secure channels.
                    </Typography>
                </Stack>
            </ToolbarPortal>

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
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Send to</Typography>
                        <ToggleButtonGroup exclusive size="small" value={audienceMode} onChange={(_, v) => v && setAudience(v)} aria-label="Who gets this message">
                            <ToggleButton value="all" sx={{ textTransform: 'none', px: 1.75 }}>Everyone ({contacts.length})</ToggleButton>
                            <ToggleButton value="selected" disabled={selectedIds.length === 0} sx={{ textTransform: 'none', px: 1.75 }}>Selected ({selectedIds.length})</ToggleButton>
                        </ToggleButtonGroup>
                        {selectedIds.length === 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                Tick people on the Contacts tab to send to just them.
                            </Typography>
                        )}
                    </Box>
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

                    {messageForm.message.trim() !== '' && (
                        <Paper variant="outlined" aria-label="Preview" sx={{ p: 1.5, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                                PREVIEW
                            </Typography>
                            {messageForm.send_email && (
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{messageForm.subject}</Typography>
                            )}
                            <Typography variant="body2">{messageForm.message}</Typography>
                        </Paper>
                    )}
                </Stack>

                {/* Recipients stay in view beside the message while the page scrolls */}
                <Paper
                    variant="outlined"
                    component="aside"
                    aria-label="Recipients"
                    sx={{ flex: '1 1 280px', maxWidth: 360, p: 2, position: { md: 'sticky' }, top: { md: STICKY_TOP }, alignSelf: 'flex-start' }}
                >
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Recipients</Typography>
                    <Stack spacing={1}>
                        {[
                            [audienceMode === 'selected' ? 'Selected contacts' : 'All contacts', counts.total],
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
                        Contacts who replied STOP never receive texts, even if text is selected.
                    </Typography>
                </Paper>
            </Box>

            {/* Send bar: pinned to the bottom of the window (above the 21px footer) so Send is always reachable */}
            <Box
                sx={{
                    position: 'sticky', bottom: '21px', zIndex: 3, mt: 2, py: 1.25,
                    bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
                    display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    Ready to send to <strong>{counts.reached}</strong> contacts
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                    disabled={sending || (!messageForm.message && messageForm.subject === 'Notification')}
                    onClick={() => {
                        onMessageChange('message', '');
                        onMessageChange('subject', 'Notification');
                    }}
                >
                    Clear
                </Button>
                <Button
                    variant="contained"
                    startIcon={<FontAwesomeIcon icon={faPaperPlane} />}
                    disabled={!canSend}
                    onClick={() => setConfirmOpen(true)}
                >
                    {sending ? 'Sending...' : `Send to ${counts.reached} contacts`}
                </Button>
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
