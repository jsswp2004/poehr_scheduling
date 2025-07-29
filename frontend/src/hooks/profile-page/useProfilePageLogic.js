import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../components/SimpleToast';
import { USER_ROLES } from '../../config/constants';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../useAuth';
import { useProfile } from '../useProfile';
import { useProfileSearch } from '../useProfileSearch';
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
        deleteUser,
    } = useProfile();
    const {
        searchTerm,
        userSearchResults,
        searchLoading,
        showSearchResults,
        currentPage,
        totalPages,
        totalResults,
        setSearchTerm,
        setShowSearchResults,
        searchUsers,
        selectUser,
        handlePageChange,
    } = useProfileSearch();
    const {
        showPasswordForm: showPasswordChange,
        passwordData,
        setShowPasswordForm: setShowPasswordChange,
        updatePasswordData,
        handlePasswordChange: changePassword,
    } = usePasswordChange();

    // Available roles for system admin
    const availableRoles = [
        { value: USER_ROLES.ADMIN, label: "Admin" },
        { value: USER_ROLES.SYSTEM_ADMIN, label: "System Admin" },
        { value: USER_ROLES.DOCTOR, label: "Doctor" },
        { value: USER_ROLES.REGISTRAR, label: "Registrar" },
        { value: USER_ROLES.RECEPTIONIST, label: "Receptionist" },
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

    const uploadProfilePicture = async (file) => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const formData = new FormData();
        formData.append('profile_picture', file);

        const response = await fetch(`${API_BASE_URL}/api/users/${profile.id}/`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                // Don't set Content-Type for FormData - let browser set it
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const updatedUser = await response.json();

        // Update the profile state with the new profile picture
        setProfile(prevProfile => ({
            ...prevProfile,
            profile_picture: updatedUser.profile_picture
        }));

        return updatedUser;
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                console.log('📁 Uploading file:', file.name, 'for user:', profile.id);
                await uploadProfilePicture(file);
                toast.success("Profile picture updated successfully!");
            } catch (error) {
                console.error("Error uploading profile picture:", error);
                toast.error(`Failed to upload profile picture: ${error.message}`);
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
        console.log('🔍 Search change:', { value, isSystemAdmin, currentUser });
        setSearchTerm(value);
        // Don't automatically search on change, wait for search button click
    };

    const handleSearchSubmit = () => {
        console.log('🔍 Search submit:', { searchTerm, isSystemAdmin });
        setShowSearchResults(true);
        searchUsers(searchTerm, 1); // Always start from page 1 on new search
    };

    const handleSelectUser = (user) => {
        selectUser(user);
        setShowSearchResults(false);
        // Update profile to show selected user's information
        setProfile({
            id: user.id,
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            email: user.email || "",
            username: user.username || "",
            roles: user.roles || [],
            profile_picture: user.profile_picture || "",
            organization: user.organization || "",
            is_active: user.is_active !== undefined ? user.is_active : true,
        });
    };

    const handleResetToCurrentUser = () => {
        if (currentUser) {
            setProfile({
                id: currentUser.id,
                first_name: currentUser.first_name || "",
                last_name: currentUser.last_name || "",
                email: currentUser.email || "",
                username: currentUser.username || "",
                roles: currentUser.roles || [],
                profile_picture: currentUser.profile_picture || "",
                organization: currentUser.organization || "",
                is_active: currentUser.is_active !== undefined ? currentUser.is_active : true,
            });
            setSearchTerm("");
            setShowSearchResults(false);
        }
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
        currentPage,
        totalPages,
        totalResults,
        showPasswordChange,
        passwordData,
        passwordLoading: false, // No loading state in password change
        availableRoles,
        fileInputRef,

        // Setters
        setProfile,
        setEditingProfile,
        setShowPasswordChange,
        setSearchTerm,
        setShowSearchResults,
        updatePasswordData,

        // Handlers
        handleProfileSubmit,
        handleFileUpload,
        handleDeleteUser,
        handlePasswordSubmit,
        handleSearchChange,
        handleSearchSubmit,
        handleSelectUser,
        handleProfileCancel,
        handlePasswordCancel,
        handleResetToCurrentUser,
        handlePageChange,

        // Search functions
        searchUsers
    };
};
