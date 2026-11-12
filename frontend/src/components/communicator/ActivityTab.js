import React, { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import MessageLogTable from '../MessageLogTable';
import ActivityFeed from './ActivityFeed';

const VIEWS = [
    ['sms', 'Texts'],
    ['email', 'Emails'],
    ['webhook', 'Replies']
];

/**
 * Everything that went out or came back. "Feed" (default) groups each send into one item with a detail pane;
 * "Table" is the full per-recipient log with print and CSV export.
 */
const ActivityTab = ({ contacts = [] }) => {
    const [mode, setMode] = useState('feed');
    const [view, setView] = useState('sms');
    return (
        <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                {mode === 'table' && (
                    <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} aria-label="Show">
                        {VIEWS.map(([value, label]) => (
                            <ToggleButton key={value} value={value} sx={{ textTransform: 'none', px: 2 }}>{label}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                )}
                <Box sx={{ flex: 1 }} />
                <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Layout">
                    <ToggleButton value="feed" sx={{ textTransform: 'none', px: 2 }}>Feed</ToggleButton>
                    <ToggleButton value="table" sx={{ textTransform: 'none', px: 2 }}>Table</ToggleButton>
                </ToggleButtonGroup>
            </Stack>
            {mode === 'feed' ? <ActivityFeed contacts={contacts} /> : <MessageLogTable key={view} type={view} />}
        </Box>
    );
};

export default ActivityTab;
