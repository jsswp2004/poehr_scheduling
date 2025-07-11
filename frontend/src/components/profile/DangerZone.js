import React from 'react';
import {
    Box,
    Typography,
    Button,
    Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

/**
 * Danger zone component for destructive actions
 */
const DangerZone = ({
    onDeleteUser,
    disabled = false,
}) => {
    return (
        <>
            <Divider sx={{ marginY: 3 }} />
            <Box>
                <Typography variant="h6" color="error" gutterBottom>
                    Danger Zone
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Once you delete a user, there is no going back. Please be certain.
                </Typography>
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={onDeleteUser}
                    disabled={disabled}
                    sx={{
                        textTransform: 'none',
                        '&:hover': {
                            backgroundColor: 'error.light',
                            color: 'white',
                        }
                    }}
                >
                    Delete User
                </Button>
            </Box>
        </>
    );
};

export default DangerZone;
