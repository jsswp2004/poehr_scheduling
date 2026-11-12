import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Paper,
    Radio,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import ConfirmDialog from './ConfirmDialog';
import { STICKY_TOP } from './CommunicatorToolbarSlot';

// A gentle check for things that should not go out by text or email. It warns; it never blocks.
const PHI_CHECKS = [
    [/\b(mrn|medical record( number| no\.?)?)\b/i, 'a medical record number'],
    [/\b(dob|date of birth|birth ?date|born on)\b/i, 'a date of birth'],
    [/\b\d{3}-\d{2}-\d{4}\b/, 'a Social Security number'],
    [/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](\d{4}|\d{2})\b/, 'a full date (such as a birth date)'],
    [/\b(diagnos(is|ed)|prescri(bed|ption)|test results?|lab results?)\b/i, 'medical details']
];
const findPhi = (text) => PHI_CHECKS.filter(([re]) => re.test(text)).map(([, label]) => label);

const card = { p: 3, borderRadius: '12px' };

/**
 * Compose. Three steps on the left (who, how, what to say) and a rail on the right with a live preview,
 * the delivery summary and the Send button. Sending asks for confirmation first, with the real recipient counts.
 */
const BulkMessageForm = ({
    contacts,
    selectedIds = [],
    lists = [],
    messageForm,
    sending,
    error,
    onMessageChange,
    onCheckboxChange,
    onSendMessage,
    onChooseContacts
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Opens on "Chosen people" when people were ticked on the Contacts tab; falls back to everyone if the selection empties.
    const [audience, setAudience] = useState(selectedIds.length > 0 ? 'selected' : 'all');
    const [listId, setListId] = useState('');
    const audienceMode =
        audience === 'list' && listId ? 'list'
            : audience === 'selected' && selectedIds.length > 0 ? 'selected' : 'all';
    const chosenList = lists.find((l) => String(l.id) === String(listId));
    const pool =
        audienceMode === 'selected' ? contacts.filter((c) => selectedIds.includes(c.id))
            : audienceMode === 'list' ? contacts.filter((c) => (c.list_ids || []).some((id) => String(id) === String(listId)))
                : contacts;

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
    }, [pool.length, contacts, selectedIds.join(','), audienceMode, listId, messageForm.send_sms, messageForm.send_email]);

    const nothingChosen = !messageForm.send_sms && !messageForm.send_email;
    const hasMessage = messageForm.message.trim() !== '';
    const canSend = !sending && counts.reached > 0 && hasMessage && !nothingChosen;
    const length = messageForm.message.length;
    const segments = length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153);
    const phiFound = findPhi(`${messageForm.message} ${messageForm.send_email ? messageForm.subject : ''}`);

    const handleConfirm = async () => {
        await onSendMessage(
            audienceMode === 'selected' ? selectedIds : audienceMode === 'list' ? { list_id: Number(listId) } : undefined,
            counts.total
        );
        setConfirmOpen(false);
    };

    const channel = messageForm.send_sms && messageForm.send_email ? 'both' : messageForm.send_email ? 'email' : 'sms';
    const pickChannel = (_, value) => {
        if (!value) return;
        onCheckboxChange('send_sms', value !== 'email');
        onCheckboxChange('send_email', value !== 'sms');
    };

    // A plain function (not a component) so the radio keeps focus while typing elsewhere.
    const audienceCard = (value, title, detail, disabled) => {
        const checked = audienceMode === value;
        return (
            <Box
                key={value}
                component="label"
                sx={{
                    display: 'block', borderRadius: '10px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
                    p: checked ? '11px 13px' : '12px 14px',
                    bgcolor: checked ? '#eff6ff' : 'background.paper',
                    border: checked ? '2px solid #2563eb' : '1px solid #cbd5e1'
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Radio size="small" name="audience" value={value} checked={checked} disabled={disabled} onChange={() => setAudience(value)} sx={{ p: 0.5, mr: 0.75 }} />
                    <Typography sx={{ fontWeight: 600, fontSize: 14, color: checked ? '#1e3a8a' : 'text.primary' }}>{title}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>{detail}</Typography>
            </Box>
        );
    };

    return (
        <Box>
            {contacts.length === 0 && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                    Add contacts on the Contacts tab before sending a message.
                </Alert>
            )}
            {error && (
                <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start' }}>
                <Stack spacing={2} sx={{ flex: '999 1 560px', minWidth: 0, maxWidth: 800 }}>

                    {/* 1. Who */}
                    <Paper variant="outlined" sx={card}>
                        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>1. Who gets this?</Typography>
                        <Box role="radiogroup" aria-label="Recipients" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1.5, mt: 1.75 }}>
                            {audienceCard('all', 'Everyone', `${contacts.length} contacts`, false)}
                            {audienceCard(
                                'selected',
                                'Chosen people',
                                selectedIds.length > 0 ? `${selectedIds.length} chosen on the Contacts tab` : 'None chosen yet',
                                selectedIds.length === 0
                            )}
                            {lists.length > 0 && audienceCard('list', 'A list', chosenList ? `${chosenList.name}` : 'Pick one of your lists', false)}
                        </Box>
                        {audience === 'list' && lists.length > 0 && (
                            <TextField
                                select
                                size="small"
                                label="List"
                                value={listId}
                                onChange={(e) => setListId(e.target.value)}
                                SelectProps={{ native: true }}
                                InputLabelProps={{ shrink: true }}
                                sx={{ mt: 1.5, minWidth: 260 }}
                            >
                                <option value="">Choose a list</option>
                                {lists.map((l) => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.contact_count})</option>
                                ))}
                            </TextField>
                        )}
                        {onChooseContacts && (
                            <Button size="small" onClick={onChooseContacts} sx={{ mt: 1, fontWeight: 600 }}>
                                {selectedIds.length > 0 ? 'Change who is chosen' : 'Choose people on the Contacts tab'}
                            </Button>
                        )}
                    </Paper>

                    {/* 2. How and what */}
                    <Paper variant="outlined" sx={card}>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
                            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, flex: 1 }}>2. Write the message</Typography>
                            <ToggleButtonGroup exclusive size="small" value={channel} onChange={pickChannel} aria-label="Send by">
                                <ToggleButton value="sms" sx={{ textTransform: 'none', px: 2 }}>Text</ToggleButton>
                                <ToggleButton value="email" sx={{ textTransform: 'none', px: 2 }}>Email</ToggleButton>
                                <ToggleButton value="both" sx={{ textTransform: 'none', px: 2 }}>Text + Email</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>

                        {/* The privacy reminder sits with the text box, where people read it */}
                        <Box role="note" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mt: 2, p: '12px 14px', bgcolor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', color: '#78350f', fontSize: 13, lineHeight: 1.5 }}>
                            <Box component="svg" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" sx={{ flexShrink: 0, mt: '1px', width: 20, height: 20 }}>
                                <path d="M12 3 2 20h20Z" /><path d="M12 10v4" /><path d="M12 17.5v.01" />
                            </Box>
                            <span><strong>Keep it generic.</strong> Text and email aren't secure. Leave out diagnoses, medical record numbers and birth dates.</span>
                        </Box>

                        <Stack spacing={2} sx={{ mt: 2 }}>
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
                            />
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">
                                {messageForm.send_sms
                                    ? `${length} characters · ${segments} text${segments === 1 ? '' : 's'} per person`
                                    : `${length} characters`}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            {hasMessage && (phiFound.length === 0 ? (
                                <Typography variant="body2" role="status" sx={{ color: '#065f46', fontWeight: 600 }}>
                                    ✓ No patient identifiers found
                                </Typography>
                            ) : (
                                <Typography variant="body2" role="alert" sx={{ color: '#991b1b', fontWeight: 600 }}>
                                    May include {phiFound.join(', ')}. Remove it before sending.
                                </Typography>
                            ))}
                        </Stack>
                    </Paper>
                </Stack>

                {/* Right rail: preview, delivery summary and Send stay in view while the page scrolls */}
                <Stack
                    component="aside"
                    aria-label="Preview and recipients"
                    spacing={2}
                    sx={{ flex: '1 1 340px', maxWidth: 400, position: { md: 'sticky' }, top: { md: `calc(${STICKY_TOP} + 8px)` }, alignSelf: 'flex-start' }}
                >
                    <Paper variant="outlined" sx={card}>
                        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>Preview</Typography>
                        <Box sx={{ mt: 1.75, p: 2, borderRadius: '16px', bgcolor: '#f1f5f9' }}>
                            {!hasMessage ? (
                                <Typography variant="body2" color="text.secondary">Your message will appear here as you type.</Typography>
                            ) : (
                                <Stack spacing={2}>
                                    {messageForm.send_sms && (
                                        <Box>
                                            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontWeight: 600, color: '#475569', mb: 1 }}>Text message</Typography>
                                            <Box sx={{ maxWidth: '88%', bgcolor: '#e2e8f0', borderRadius: '18px 18px 18px 4px', px: 1.75, py: 1.25, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                {messageForm.message}
                                            </Box>
                                        </Box>
                                    )}
                                    {messageForm.send_email && (
                                        <Box>
                                            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontWeight: 600, color: '#475569', mb: 1 }}>Email</Typography>
                                            <Box sx={{ bgcolor: '#fff', borderRadius: '10px', p: 1.75, border: '1px solid #e2e8f0' }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>{messageForm.subject}</Typography>
                                                <Typography sx={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{messageForm.message}</Typography>
                                            </Box>
                                        </Box>
                                    )}
                                </Stack>
                            )}
                        </Box>
                    </Paper>

                    <Paper variant="outlined" sx={card}>
                        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>Delivery</Typography>
                        <Stack spacing={1.25} sx={{ mt: 1.75, fontSize: 14 }}>
                            {[
                                [audienceMode === 'selected' ? 'Chosen people' : audienceMode === 'list' && chosenList ? chosenList.name : 'Everyone', counts.total],
                                ...(messageForm.send_sms ? [['Will get a text', counts.text, '#065f46']] : []),
                                ...(messageForm.send_email ? [['Will get an email', counts.email, '#065f46']] : [])
                            ].map(([label, value, color]) => (
                                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{label}</span><strong style={color ? { color } : undefined}>{value}</strong>
                                </Box>
                            ))}
                            {messageForm.send_sms && (counts.optedOut > 0 || counts.noPhone > 0) && (
                                <Box sx={{ pt: 1.25, borderTop: '1px solid #e2e8f0' }}>
                                    {counts.optedOut > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <span>Skipped: opted out (STOP)</span><strong style={{ color: '#991b1b' }}>{counts.optedOut}</strong>
                                        </Box>
                                    )}
                                    {counts.noPhone > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Skipped: no phone number</span><strong>{counts.noPhone}</strong>
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                            Contacts who replied STOP never receive texts, even if text is selected.
                        </Typography>
                    </Paper>

                    <Box>
                        <Button
                            fullWidth
                            size="large"
                            variant="contained"
                            startIcon={<FontAwesomeIcon icon={faPaperPlane} />}
                            disabled={!canSend}
                            onClick={() => setConfirmOpen(true)}
                            sx={{ height: 48, fontSize: 15 }}
                        >
                            {sending ? 'Sending...' : `Review and send to ${counts.reached} ${counts.reached === 1 ? 'person' : 'people'}`}
                        </Button>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">You'll confirm the final count before anything is sent.</Typography>
                            <Button
                                size="small"
                                disabled={sending || (!messageForm.message && messageForm.subject === 'Notification')}
                                onClick={() => {
                                    onMessageChange('message', '');
                                    onMessageChange('subject', 'Notification');
                                }}
                            >
                                Clear
                            </Button>
                        </Stack>
                    </Box>
                </Stack>
            </Box>

            <ConfirmDialog
                open={confirmOpen}
                title={`Send to ${counts.reached} ${counts.reached === 1 ? 'person' : 'people'}?`}
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
                {phiFound.length > 0 && (
                    <Box component="span" sx={{ display: 'block', mt: 1.5, color: '#991b1b', fontWeight: 600 }}>
                        Warning: this message may include {phiFound.join(', ')}. Text and email are not secure.
                    </Box>
                )}
            </ConfirmDialog>
        </Box>
    );
};

export default BulkMessageForm;
