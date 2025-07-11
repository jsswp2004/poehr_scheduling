import React from 'react';
import {
    Box,
    Typography,
    Stack
} from '@mui/material';

/**
 * ConfirmationStep Component
 * Step 4 of enrollment - Review information before submission
 */
const ConfirmationStep = ({
    formData
}) => {
    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Review Your Information
            </Typography>

            <Stack spacing={2}>
                <Box>
                    <Typography variant="subtitle2" color="text.secondary">Organization</Typography>
                    <Typography>{formData.organization_name} ({formData.organization_type})</Typography>
                </Box>

                <Box>
                    <Typography variant="subtitle2" color="text.secondary">Account</Typography>
                    <Typography>{formData.first_name} {formData.last_name}</Typography>
                    <Typography variant="body2" color="text.secondary">{formData.email}</Typography>
                </Box>

                <Box>
                    <Typography variant="subtitle2" color="text.secondary">Selected Plan</Typography>
                    <Typography>{formData.subscription_tier.charAt(0).toUpperCase() + formData.subscription_tier.slice(1)} Plan</Typography>
                    <Typography variant="body2" color="text.secondary">7-day free trial, then monthly billing</Typography>
                </Box>
            </Stack>
        </Box>
    );
};

export default ConfirmationStep;
