import React from 'react';
import { Tabs, Tab, Divider } from '@mui/material';

const AnnouncementTabs = ({ activeTab, onTabChange }) => {
    return (
        <>
            <Tabs
                value={activeTab}
                onChange={onTabChange}
                sx={{
                    mb: 3,
                    "& .MuiTabs-indicator": {
                        backgroundColor: "primary.main",
                    },
                    "& .MuiTab-root": {
                        textTransform: "none",
                        fontWeight: 500,
                        minWidth: 120,
                    },
                }}
            >
                <Tab label="Message #1" />
                <Tab label="Message #2" />
                <Tab label="Message #3" />
            </Tabs>
            <Divider sx={{ mb: 3 }} />
        </>
    );
};

export default AnnouncementTabs;
