import React from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import BackButton from '../../components/BackButton';
import CreateProfileForm from './CreateProfileForm';

/**
 * CreateProfileContainer Component
 * Main container for the create profile page with two-column layout
 */
const CreateProfileContainer = ({
    formData,
    formFields,
    roleOptions,
    organizations,
    submitting,
    handleSubmit,
    handleChange,
    addOrganization,
}) => {
    return (
        <Box sx={{ mt: 4, px: 3, width: "100%" }}>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 2, sm: 3 },
                    borderRadius: 2,
                    width: "100%",
                    height: "calc(100vh - 120px)"
                }}
            >
                {/* Top Action Bar */}
                <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="space-between"
                    mb={3}
                >
                    <Typography variant="h5" sx={{ fontWeight: 700, color: "primary.main" }}>
                        Create Profile
                    </Typography>
                    <BackButton />
                </Stack>

                <CreateProfileForm
                    formData={formData}
                    formFields={formFields}
                    roleOptions={roleOptions}
                    organizations={organizations}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onChange={handleChange}
                    addOrganization={addOrganization}
                />
            </Paper>
        </Box>
    );
};

export default CreateProfileContainer;
