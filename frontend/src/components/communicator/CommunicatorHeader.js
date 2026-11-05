import React from 'react';
import { Box, Chip, Typography, Tabs, Tab } from '@mui/material';
import BackButton from '../BackButton';

/**
 * Page header with title, Back button and tabs.
 * Layout, type scale and tab sizing mirror the Staffing Center header
 * (plain text tabs, no icons or count badges; counts live in the section title).
 */
const CommunicatorHeader = ({
    currentTab,
    onTabChange,
    // Only admins/system_admins get the Email and SMS auto-messaging setup
    // tabs here (same settings as the Messages page) -- registrars still see
    // just Contacts/Send Message.
    isAdmin = false,
    // Count chips next to the title, e.g. [{ label: '128 contacts' }, { label: '4 opted out', color: 'error' }]
    chips = [],
    backTo = '/login?redirect=communicator'
}) => {
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 0.5 }}>
                <Typography variant="h5">Communicator</Typography>
                {chips.map((c) => (
                    <Chip key={c.label} size="small" color={c.color || 'primary'} label={c.label} />
                ))}
                <Box sx={{ flex: 1 }} />
                <BackButton to={backTo} sx={{ mb: 0 }} />
            </Box>

            <Tabs
                value={currentTab}
                onChange={(_, newValue) => onTabChange(newValue)}
                sx={{
                    mb: 1.5, minHeight: 40, borderBottom: 1, borderColor: 'divider',
                    '& .MuiTab-root': { minHeight: 40, py: 0.5 },
                }}
            >
                <Tab value="contacts" label="Contacts" />
                <Tab value="message" label="Send Message" />
                {isAdmin && <Tab value="email" label="Email" />}
                {isAdmin && <Tab value="sms" label="SMS" />}
            </Tabs>
        </Box>
    );
};

export default CommunicatorHeader;
