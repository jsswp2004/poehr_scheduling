import React from 'react';
import { Tabs, Tab } from '@mui/material';

/**
 * EnvironmentTabs Component
 * Renders the tab navigation for environment profile sections
 */
const EnvironmentTabs = ({ value, onChange }) => {
    return (
        <Tabs
            value={value}
            onChange={onChange}
            sx={{
                mb: 3,
                minHeight: 48,
                '& .MuiTabs-indicator': {
                    height: 2,
                    bgcolor: 'primary.main',
                },
                '& .MuiTab-root': {
                    fontWeight: 400,
                    fontSize: '1rem',
                    color: 'text.secondary',
                    minHeight: 48,
                    textTransform: 'none',
                    transition: 'color 0.2s',
                    '&.Mui-selected': {
                        color: 'primary.main',
                    },
                    '&:hover': {
                        color: 'primary.main',
                    },
                },
            }}
        >
            <Tab label="Default Blocked Days" value="blocked-days" />
            <Tab label="Holidays" value="holidays" />
            <Tab label="Organization" value="organization" />
        </Tabs>
    );
};

export default EnvironmentTabs;
