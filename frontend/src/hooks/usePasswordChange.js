import { useState } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders } from '../config/api';
import { USER_ROLES } from '../config/constants';
import { toast } from '../components/SimpleToast';

/**
 * Custom hook for password change functionality
 */
export const usePasswordChange = (token, currentUser, user) => {
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordData, setPasswordData] = useState({
        current_password: "",
        new_password: "",
        confirm_password: "",
    });

    // Check if admin is changing another user's password
    const isAdminChangingOtherUser = currentUser && user && (
        (currentUser.role === USER_ROLES.ADMIN || currentUser.role === USER_ROLES.SYSTEM_ADMIN) &&
        user.id !== currentUser.id
    );

    // Handle password change
    const handlePasswordChange = async () => {
        try {
            if (isAdminChangingOtherUser) {
                // Use admin password change endpoint
                const adminPasswordData = {
                    target_user_id: user.id,
                    admin_password: passwordData.current_password,
                    new_password: passwordData.new_password,
                    confirm_password: passwordData.confirm_password,
                };

                await axios.post(
                    apiEndpoints.adminChangePassword,
                    adminPasswordData,
                    { headers: getAuthHeaders(token) }
                );
            } else {
                // Use regular password change endpoint
                await axios.post(
                    apiEndpoints.changePassword,
                    passwordData,
                    { headers: getAuthHeaders(token) }
                );
            }

            toast.success("Password changed successfully");
            resetPasswordForm();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to change password");
        }
    };

    // Reset password form
    const resetPasswordForm = () => {
        setPasswordData({
            current_password: "",
            new_password: "",
            confirm_password: "",
        });
        setShowPasswordForm(false);
    };

    // Update password data
    const updatePasswordData = (field, value) => {
        setPasswordData(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    // Toggle password form visibility
    const togglePasswordForm = () => {
        setShowPasswordForm(prev => !prev);
        if (showPasswordForm) {
            resetPasswordForm();
        }
    };

    return {
        // State
        showPasswordForm,
        passwordData,
        isAdminChangingOtherUser,

        // Actions
        handlePasswordChange,
        resetPasswordForm,
        updatePasswordData,
        togglePasswordForm,
        setShowPasswordForm,
    };
};
