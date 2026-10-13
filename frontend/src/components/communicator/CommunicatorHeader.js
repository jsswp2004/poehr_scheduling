import React from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Chip
} from '@mui/material';
import { Send as SendIcon, Email as EmailIcon, Sms as SmsIcon } from '@mui/icons-material';
import BackButton from '../BackButton';

// Tab label: optional icon + text, same inline spacing everywhere.
const TabLabel = ({ icon, children }) => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        {icon}
        {children}
    </Box>
);

/**
 * Page header with title, Back button and tabs.
 * Layout, type scale and tab sizing mirror the Staffing Center header.
 */
const CommunicatorHeader = ({
    currentTab,
    contactsCount,
    onTabChange,
    // Only admins/system_admins get the Email and SMS auto-messaging setup
    // tabs here (same settings as the Messages page) -- registrars still see
    // just Contacts/Send Message.
    isAdmin = false,
    backTo = '/login?redirect=communicator'
}) => {
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 0.5 }}>
                <Typography variant="h5">Communicator</Typography>
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
                <Tab
                    value="contacts"
                    label={
                        <TabLabel>
                            Contacts
                            <Chip label={contactsCount} size="small" color="primary" sx={{ height: 20 }} />
                        </TabLabel>
                    }
                />
                <Tab
                    value="message"
                    label={<TabLabel icon={<SendIcon fontSize="small" />}>Send Message</TabLabel>}
                />
                {isAdmin && (
                    <Tab
                        value="email"
                        label={<TabLabel icon={<EmailIcon fontSize="small" />}>Email</TabLabel>}
                    />
                )}
                {isAdmin && (
                    <Tab
                        value="sms"
                        label={<TabLabel icon={<SmsIcon fontSize="small" />}>SMS</TabLabel>}
                    />
                )}
            </Tabs>
        </Box>
    );
};

export default CommunicatorHeader;
