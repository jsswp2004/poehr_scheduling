import React from 'react';
import { Box } from '@mui/material';
import MessageLogTable from '../MessageLogTable';

/**
 * EmailLogsPanel Component
 * Right panel container for Email message logs
 */
const EmailLogsPanel = () => {
    return (
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <MessageLogTable type="email" />
        </Box>
    );
};

export default EmailLogsPanel;
