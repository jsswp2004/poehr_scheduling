import React from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Chip
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

/**
 * Page header with title, description, and tabs
 */
const CommunicatorHeader = ({
    currentTab,
    contactsCount,
    onTabChange
}) => {
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Communicator
                </Typography>
            </Box>

            <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
                Manage your contacts and send bulk messages via SMS and email.
            </Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={currentTab} onChange={(_, newValue) => onTabChange(newValue)}>
                    <Tab
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <span>Contacts</span>
                                <Chip label={contactsCount} size="small" color="primary" />
                            </Box>
                        }
                        value="contacts"
                    />

                    <Tab
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SendIcon fontSize="small" />
                                <span>Send Message</span>
                            </Box>
                        }
                        value="message"
                    />
                </Tabs>
            </Box>
        </Box>
    );
};

export default CommunicatorHeader;
