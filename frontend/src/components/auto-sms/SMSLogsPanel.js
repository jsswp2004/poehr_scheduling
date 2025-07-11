import React from 'react';
import { Box } from '@mui/material';
import MessageLogTable from '../MessageLogTable';

/**
 * SMSLogsPanel Component
 * Right panel container for SMS message logs
 */
const SMSLogsPanel = () => {
    return (
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <MessageLogTable type="sms" />
        </Box>
    );
};

export default SMSLogsPanel;
