import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';

function ProfilePictureUpload({ onFileUpload }) {
    return (
        <Paper
            elevation={1}
            sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: '#f8f9fa' }}
        >
            <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                Profile Picture
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                    variant="outlined"
                    component="label"
                    sx={{
                        textTransform: 'none',
                        borderRadius: 2,
                        px: 3,
                        py: 1.5,
                        borderColor: 'primary.main',
                        '&:hover': {
                            bgcolor: 'primary.light',
                            borderColor: 'primary.dark',
                        },
                    }}
                >
                    Choose New Picture
                    <input
                        type="file"
                        accept="image/png, image/jpeg"
                        hidden
                        onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                                onFileUpload(file);
                            }
                        }}
                    />
                </Button>
                <Typography variant="body2" color="text.secondary">
                    Accepted formats: PNG, JPEG (max 5MB)
                </Typography>
            </Box>
        </Paper>
    );
}

export default ProfilePictureUpload;
