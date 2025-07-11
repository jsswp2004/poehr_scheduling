import React from 'react';
import {
    Box,
    Card,
    CardContent,
} from '@mui/material';
import LoginForm from './LoginForm';

/**
 * LoginContainer Component
 * Main container for the login page layout
 */
const LoginContainer = ({ formData, loading, handleSubmit, handleChange }) => {
    return (
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: '#f5f6fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <Card
                sx={{
                    maxWidth: 400,
                    width: '100%',
                    boxShadow: 6,
                    borderRadius: 3,
                    p: 1
                }}
            >
                <CardContent>
                    <LoginForm
                        formData={formData}
                        loading={loading}
                        onSubmit={handleSubmit}
                        onChange={handleChange}
                    />
                </CardContent>
            </Card>
        </Box>
    );
};

export default LoginContainer;
