import React from 'react';
import { Box, Button, Chip, CircularProgress, Container, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import CreateProfileForm, { CREATE_PROFILE_FORM_ID } from './CreateProfileForm';

/**
 * CreateProfileContainer Component
 * Pinned title, status chips and toolbar (Cancel / Create Profile) above a
 * scrolling two-column form.
 */
const CreateProfileContainer = ({
    formData,
    formFields,
    roleOptions,
    roleDisplayType,
    organizations,
    submitting,
    handleSubmit,
    handleChange,
    addOrganization,
}) => {
    const navigate = useNavigate();

    const requiredKeys = [...formFields.map((f) => f.name), 'role', 'organization'];
    const requiredLeft = requiredKeys.filter((k) => !formData[k]).length;
    const touched =
        requiredKeys.some((k) => !!formData[k]) || !!formData.profile_picture;

    return (
        <Container maxWidth={false} sx={{ mt: 0, mb: 3, px: { xs: 2, md: 4 } }}>
            {/* Pinned title and toolbar (stays put while the form scrolls) */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 64,
                    zIndex: 1000,
                    bgcolor: 'background.paper',
                    pt: '18px',
                    mt: '-18px',
                    pb: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
                        Create Profile
                    </Typography>
                    <Chip
                        size="small"
                        color={requiredLeft ? 'warning' : 'success'}
                        variant="outlined"
                        label={requiredLeft ? `${requiredLeft} required left` : 'Ready to create'}
                        data-testid="create-profile-required-chip"
                    />
                    {touched && <Chip size="small" color="warning" label="Unsaved changes" />}
                    <Box sx={{ flex: 1 }} />
                    <BackButton sx={{ mb: 0, py: 0.75 }} />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12, mt: -0.25 }}>
                    Add a new user to your organization
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 1, minHeight: 44 }}>
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" variant="outlined" color="secondary" onClick={() => navigate(-1)}>
                        Cancel
                    </Button>
                    <Button
                        size="small"
                        type="submit"
                        form={CREATE_PROFILE_FORM_ID}
                        variant="contained"
                        color="success"
                        disabled={submitting || requiredLeft > 0}
                        startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : null}
                    >
                        {submitting ? 'Creating Profile...' : 'Create Profile'}
                    </Button>
                </Box>
            </Box>

            <Box sx={{ maxWidth: 1100, mx: 'auto', pt: 2 }}>
                <CreateProfileForm
                    formData={formData}
                    formFields={formFields}
                    roleOptions={roleOptions}
                    roleDisplayType={roleDisplayType}
                    organizations={organizations}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onChange={handleChange}
                    addOrganization={addOrganization}
                />
            </Box>
        </Container>
    );
};

export default CreateProfileContainer;
