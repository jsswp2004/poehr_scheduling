import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from '../../components/BackButton';
import CreateProfileForm from './CreateProfileForm';

/**
 * CreateProfileContainer Component
 * Main container for the create profile page
 */
const CreateProfileContainer = ({
    formData,
    formFields,
    roleOptions,
    organizations,
    submitting,
    handleSubmit,
    handleChange,
}) => {
    return (
        <Box
            sx={{
                mt: 6,
                mx: 'auto',
                maxWidth: 440,
                p: 4,
                boxShadow: 3,
                borderRadius: 2,
                bgcolor: 'background.paper',
            }}
        >
            <BackButton />

            <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
                Create Profile
            </Typography>

            <CreateProfileForm
                formData={formData}
                formFields={formFields}
                roleOptions={roleOptions}
                organizations={organizations}
                submitting={submitting}
                onSubmit={handleSubmit}
                onChange={handleChange}
            />
        </Box>
    );
};

export default CreateProfileContainer;
