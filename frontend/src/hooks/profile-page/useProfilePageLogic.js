import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../components/SimpleToast';
import { USER_ROLES } from '../../config/constants';
import { useAuth } from '../useAuth';
import { useProfile } from '../useProfile';
import { useSearch } from '../useSearch';
import { usePasswordChange } from '../usePasswordChange';

/**
 * Custom hook for managing all ProfilePage functionality
 * Consolidates auth, profile, search, and password change logic
 */
export const useProfilePageLogic = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // Existing hooks
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

    // Handler functions
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
    };

    const handlePasswordCancel = () => {
        setShowPasswordChange(false);
    };

    return {
        // State
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

        // Setters
        setProfile,
        setEditingProfile,
        setShowPasswordChange,
        updatePasswordData,

        // Handlers
        handleProfileSubmit,
        handleFileUpload,
        handleDeleteUser,
        handlePasswordSubmit,
        handleSearchChange,
        handleSelectUser,
        handleProfileCancel,
        handlePasswordCancel,

        // Search functions
        searchUsers
    };
};
