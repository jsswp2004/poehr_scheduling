import React from 'react';
import { Avatar, Badge, Box, Button, Chip, Divider, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import { toast } from 'react-toastify';
import { avatarColor, canText, initials, lastActive, memberName, phoneText, roleColors, roleLabel, textBlockedReason } from './teamHelpers';

const copy = async (text, what) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    } catch (err) {
        toast.error(`Could not copy the ${what.toLowerCase()}`);
    }
};

function Row({ label, children, action }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>
                {label}
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{children}</Box>
            {action}
        </Box>
    );
}

// The side panel that opens when a person is chosen in the Team list.
function TeamMemberDrawer({ member, onClose, onMessage, onSendText, onOpenEmailModal, showOrganization }) {
    const open = !!member;
    const m = member || {};
    const name = memberName(m);
    const active = lastActive(m);
    const [bg, fg] = roleColors(m.role);
    const phone = phoneText(m.phone_number);
    const textable = canText(m);
    const blocked = textBlockedReason(m);
    const consentDate = m.sms_consent_date ? new Date(m.sms_consent_date).toLocaleDateString('en-US') : '';

    return (
        <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 }, p: 3 }, role: 'dialog', 'aria-label': 'Team member details' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    Team member
                </Typography>
                <IconButton size="small" onClick={onClose} aria-label="Close details">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 2 }}>
                <Badge
                    overlap="circular"
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    variant="dot"
                    sx={{ '& .MuiBadge-badge': { bgcolor: active.online ? '#16a34a' : '#c9d1dd', width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff' } }}
                >
                    <Avatar src={m.profile_picture || undefined} alt="" sx={{ width: 64, height: 64, bgcolor: avatarColor(m.id), fontSize: 24 }}>
                        {initials(name)}
                    </Avatar>
                </Badge>
                <Box>
                    <Typography variant="h6" fontWeight={600} data-testid="drawer-name">
                        {name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                        <Chip size="small" label={roleLabel(m.role)} sx={{ bgcolor: bg, color: fg, fontWeight: 600 }} />
                        <Typography variant="caption" sx={{ color: active.online ? '#067647' : 'text.secondary' }}>
                            {active.text}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, pb: 2 }}>
                <Button fullWidth variant="contained" startIcon={<ChatBubbleOutlineIcon />} onClick={() => onMessage(m)}>
                    Message
                </Button>
                <Tooltip title={blocked}>
                    <span style={{ flex: 1, display: 'flex' }}>
                        <Button fullWidth variant="outlined" startIcon={<SmsOutlinedIcon />} disabled={!textable} onClick={() => onSendText(m)}>
                            Text
                        </Button>
                    </span>
                </Tooltip>
                <Button fullWidth variant="outlined" startIcon={<EmailOutlinedIcon />} disabled={!m.email} onClick={() => onOpenEmailModal(m)}>
                    Email
                </Button>
            </Box>

            <Row
                label="Email"
                action={m.email ? <Button size="small" onClick={() => copy(m.email, 'Email')}>Copy</Button> : null}
            >
                <Typography variant="body2">{m.email || 'No email on file'}</Typography>
            </Row>
            <Row label="Phone" action={phone ? <Button size="small" onClick={() => copy(phone, 'Phone number')}>Copy</Button> : null}>
                <Typography variant="body2" color={phone ? 'text.primary' : 'text.secondary'}>
                    {phone || 'No phone number on file'}
                </Typography>
            </Row>
            <Row label="Texting">
                {textable ? (
                    <Chip size="small" label={`Agreed to texts${consentDate ? ` · ${consentDate}` : ''}`} sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 600 }} />
                ) : (
                    <Chip size="small" label={blocked} sx={{ bgcolor: '#eef1f6', color: '#3b4556', fontWeight: 600 }} />
                )}
            </Row>
            {showOrganization && (
                <Row label="Clinic">
                    <Typography variant="body2">{m.organization_name || 'No organization'}</Typography>
                </Row>
            )}
            <Row label="Last active">
                <Typography variant="body2">{active.text}</Typography>
            </Row>
            <Divider />
            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f4f6f9', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                    Texting is turned off for anyone who has not agreed to receive texts.
                </Typography>
            </Box>
        </Drawer>
    );
}

export default TeamMemberDrawer;
