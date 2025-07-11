import React from 'react';
import {
    Box,
    Typography,
    Paper,
    Divider,
} from '@mui/material';
import BackButton from '../../components/BackButton';
import UserSearchSection from '../../components/profile/UserSearchSection';
import ProfileForm from '../../components/profile/ProfileForm';
import PasswordForm from '../../components/profile/PasswordForm';
import DangerZone from '../../components/profile/DangerZone';
import LoadingSpinner from '../../components/common/LoadingSpinner';

/**
 * ProfilePageContainer Component
 * Main container for the profile page content
 */
const ProfilePageContainer = ({
    currentUser,
    isSystemAdmin,
    profile,
    editingProfile,
    profileLoading,
    searchTerm,
    userSearchResults,
    searchLoading,
    showSearchResults,
    showPasswordChange,
    passwordData,
    passwordLoading,
    availableRoles,
    fileInputRef,
    setProfile,
    setEditingProfile,
    handleProfileSubmit,
    handleFileUpload,
    handleDeleteUser,
    handlePasswordSubmit,
    handleSearchChange,
    handleSelectUser,
    handleProfileCancel,
    handlePasswordCancel,
    searchUsers,
    setShowPasswordChange
}) => {
    // Loading state
    if (!currentUser) {
        return <LoadingSpinner message="Loading profile..." />;
    }

    return (
        <Box
            sx={{
                maxWidth: 800,
                margin: "0 auto",
                padding: 3,
                minHeight: "100vh",
                backgroundColor: "#f5f5f5",
            }}
        >
            <BackButton />

            <Paper elevation={3} sx={{ padding: 4, marginBottom: 3 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Profile Management
                </Typography>

                {/* System Admin Search Section */}
                {isSystemAdmin && (
                    <UserSearchSection
                        searchTerm={searchTerm}
                        userSearchResults={userSearchResults}
                        searchLoading={searchLoading}
                        showSearchResults={showSearchResults}
                        onSearchChange={handleSearchChange}
                        onSearchSubmit={() => searchUsers(searchTerm)}
                        onSelectUser={handleSelectUser}
                    />
                )}

                {/* Profile Form Section */}
                <ProfileForm
                    profile={profile}
                    editingProfile={editingProfile}
                    profileLoading={profileLoading}
                    isSystemAdmin={isSystemAdmin}
                    availableRoles={availableRoles}
                    fileInputRef={fileInputRef}
                    onProfileChange={setProfile}
                    onEditToggle={() => setEditingProfile(true)}
                    onSave={handleProfileSubmit}
                    onCancel={handleProfileCancel}
                    onFileUpload={handleFileUpload}
                />

                <Divider sx={{ marginY: 3 }} />

                {/* Password Change Section */}
                <PasswordForm
                    showPasswordChange={showPasswordChange}
                    passwordData={passwordData}
                    passwordLoading={passwordLoading}
                    onTogglePasswordForm={() => setShowPasswordChange(!showPasswordChange)}
                    onPasswordDataChange={passwordData}
                    onPasswordSubmit={handlePasswordSubmit}
                    onCancel={handlePasswordCancel}
                />

                {/* Danger Zone (System Admin only) */}
                {isSystemAdmin && profile.id !== currentUser.id && (
                    <DangerZone
                        onDeleteUser={handleDeleteUser}
                        disabled={profileLoading}
                    />
                )}
            </Paper>
        </Box>
    );
};

export default ProfilePageContainer;
