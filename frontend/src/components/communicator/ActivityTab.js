import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import MessageLogTable from '../MessageLogTable';

const VIEWS = [
    ['sms', 'Texts'],
    ['email', 'Emails'],
    ['webhook', 'Replies']
];

/**
 * Everything that went out or came back, in one place: sent texts, sent emails and replies from contacts.
 * (The log used to live on the separate Messages page.)
 */
const ActivityTab = () => {
    const [view, setView] = useState('sms');
    return (
        <Box>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={view}
                onChange={(_, v) => v && setView(v)}
                aria-label="Show"
                sx={{ mb: 1.5 }}
            >
                {VIEWS.map(([value, label]) => (
                    <ToggleButton key={value} value={value} sx={{ textTransform: 'none', px: 2 }}>{label}</ToggleButton>
                ))}
            </ToggleButtonGroup>
            {/* key remounts the table so filters and paging start fresh for each view */}
            <MessageLogTable key={view} type={view} />
        </Box>
    );
};

export default ActivityTab;
