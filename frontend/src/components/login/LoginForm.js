import React from 'react';
import {
    Typography,
    TextField,
    Button,
    Box,
} from '@mui/material';
import { Link } from 'react-router-dom';

/**
 * LoginForm Component
 * Form component for user authentication
 */
const LoginForm = ({ formData, loading, onSubmit, onChange }) => {
    return (
        <>
            <Typography variant="h5" align="center" sx={{ mb: 2, fontWeight: 700, color: 'primary.main' }}>
                Login
            </Typography>

            <Box component="form" onSubmit={onSubmit} sx={{ mt: 1 }}>
                <TextField
                    margin="normal"
                    fullWidth
                    label="User"
                    name="username"
                    autoComplete="username"
                    value={formData.username}
                    onChange={onChange}
                    required
                    size="medium"
                />

                <TextField
                    margin="normal"
                    fullWidth
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={onChange}
                    required
                    size="medium"
                />

                <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    color="primary"
                    size="large"
                    disabled={loading}
                    sx={{ mt: 2, mb: 1, fontWeight: 700 }}
                >
                    {loading ? 'Logging in...' : 'Login'}
                </Button>

                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Link
                        to="/forgot-password"
                        style={{
                            display: 'block',
                            marginBottom: 8,
                            color: '#1976d2',
                            textDecoration: 'none',
                            fontWeight: 500
                        }}
                    >
                        Forgot Password?
                    </Link>
                    {/* 
                    <Typography variant="body2" component="span">
                        Don't have an account?{' '}
                        <Link
                            to="/register"
                            style={{
                                color: '#1976d2',
                                textDecoration: 'none',
                                fontWeight: 500
                            }}
                        >
                            Sign up
                        </Link>
                    </Typography>
                    */}
                </Box>
            </Box>
        </>
    );
};

export default LoginForm;
