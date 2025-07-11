import React from 'react';
import { Button, Box } from '@mui/material';
import {
    FaTools,
    FaCalendarCheck,
    FaUserCog,
    FaSearch,
    FaEnvelope
} from 'react-icons/fa';

/**
 * AdminNavGrid Component
 * Grid of navigation buttons for admin functionality
 */
const AdminNavGrid = ({ navItems, onNavigate }) => {
    // Icon mapping
    const iconMap = {
        FaCalendarCheck: FaCalendarCheck,
        FaTools: FaTools,
        FaUserCog: FaUserCog,
        FaSearch: FaSearch,
        FaEnvelope: FaEnvelope,
    };

    const renderIcon = (iconName) => {
        const IconComponent = iconMap[iconName];
        return IconComponent ? <IconComponent size={24} style={{ marginBottom: 8 }} /> : null;
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 3,
                flexWrap: 'wrap',
            }}
        >
            {navItems.map((item) => (
                <Button
                    key={item.id}
                    variant="contained"
                    color={item.color}
                    size="large"
                    onClick={() => onNavigate(item.path)}
                    sx={{
                        width: 120,
                        height: 120,
                        flexDirection: 'column',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                    }}
                >
                    {renderIcon(item.icon)}
                    {item.label}
                </Button>
            ))}
        </Box>
    );
};

export default AdminNavGrid;
