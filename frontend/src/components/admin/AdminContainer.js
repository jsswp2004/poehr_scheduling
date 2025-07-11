import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Divider,
    CircularProgress
} from '@mui/material';
import AdminNavGrid from './AdminNavGrid';

/**
 * AdminContainer Component
 * Main container for the admin page layout
 */
const AdminContainer = ({ userRole, loading, visibleNavItems, handleNavigate }) => {
    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '50vh'
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', mt: 8 }}>
            <Card elevation={6} sx={{ textAlign: 'center', borderRadius: 3 }}>
                <CardContent>
                    <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
                        Management Portal
                    </Typography>

                    <Divider sx={{ mb: 4 }} />

                    <AdminNavGrid
                        navItems={visibleNavItems}
                        onNavigate={handleNavigate}
                    />
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminContainer;
