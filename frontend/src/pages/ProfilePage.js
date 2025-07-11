import { useState, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Divider,
} from "@mui/material";
import BackButton from "../components/BackButton";
import { toast } from "../components/SimpleToast";
import { useNavigate } from "react-router-dom";
import { USER_ROLES } from "../config/constants";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { useSearch } from "../hooks/useSearch";
import { usePasswordChange } from "../hooks/usePasswordChange";

// Import new components
import UserSearchSection from "../components/profile/UserSearchSection";
import ProfileForm from "../components/profile/ProfileForm";
import PasswordForm from "../components/profile/PasswordForm";
import DangerZone from "../components/profile/DangerZone";
import LoadingSpinner from "../components/common/LoadingSpinner";

function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Custom hooks
  const { currentUser, isSystemAdmin } = useAuth();
  const {
    profile,
    editingProfile,
    profileLoading,
    setProfile,
    setEditingProfile,
    updateProfile,
    uploadProfilePicture,
    deleteUser,
  } = useProfile();
  const {
    searchTerm,
    userSearchResults,
    searchLoading,
    showSearchResults,
    setSearchTerm,
    setShowSearchResults,
    searchUsers,
    selectUser,
  } = useSearch();
  const {
    showPasswordChange,
    passwordData,
    passwordLoading,
    setShowPasswordChange,
    updatePasswordData,
    changePassword,
  } = usePasswordChange();

  // Available roles for system admin
  const availableRoles = [
    { value: USER_ROLES.ADMIN, label: "Admin" },
    { value: USER_ROLES.THERAPIST, label: "Therapist" },
    { value: USER_ROLES.PATIENT, label: "Patient" },
  ];

  // Handlers
  const handleProfileSubmit = async () => {
    try {
      await updateProfile();
      toast.success("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        await uploadProfilePicture(file);
        toast.success("Profile picture updated successfully!");
      } catch (error) {
        console.error("Error uploading profile picture:", error);
        toast.error("Failed to upload profile picture");
      }
    }
  };

  const handleDeleteUser = async () => {
    if (
      window.confirm(
        "Are you sure you want to delete this user? This action cannot be undone."
      )
    ) {
      try {
        await deleteUser();
        toast.success("User deleted successfully!");
        navigate("/");
      } catch (error) {
        console.error("Error deleting user:", error);
        toast.error("Failed to delete user");
      }
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      await changePassword();
      toast.success("Password updated successfully!");
      setShowPasswordChange(false);
    } catch (error) {
      console.error("Error changing password:", error);
      toast.error("Failed to change password");
    }
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setShowSearchResults(true);
    searchUsers(value);
  };

  const handleSelectUser = (user) => {
    selectUser(user);
    setShowSearchResults(false);
  };

  const handleProfileCancel = () => {
    setEditingProfile(false);
    // Reset profile to original state if needed
  };

  const handlePasswordCancel = () => {
    setShowPasswordChange(false);
  };

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
          onPasswordDataChange={updatePasswordData}
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
}

export default ProfilePage;
