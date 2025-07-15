import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
    apiEndpoints,
    getAuthHeaders,
    getAuthHeadersForUpload,
} from "../config/api";
import { notifyProfileUpdated } from "../utils/events";
import { useAuth } from "./useAuth";

/**
 * Custom hook for profile management
 */
export const useProfile = () => {
    const { currentUser } = useAuth();

    const [profile, setProfile] = useState({
        id: "",
        first_name: "",
        last_name: "",
        email: "",
        username: "",
        roles: [],
        profile_picture: "",
        organization: "",
        phone_number: "",
        sms_consent: false,
        is_active: true,
    });

    const [editingProfile, setEditingProfile] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    // Fetch current user's complete profile data
    const fetchCurrentUserProfile = useCallback(async () => {
        if (!currentUser?.id) return;

        console.log("🔄 Fetching fresh profile data for user:", currentUser.id);
        try {
            const token = localStorage.getItem("access_token");
            if (!token) {
                console.log("❌ No access token found");
                return;
            }

            const response = await axios.get(apiEndpoints.user(currentUser.id), {
                headers: getAuthHeaders(token),
            });

            console.log("✅ Fresh profile data received:", response.data);
            console.log("📧 Profile email:", response.data.email);
            console.log("📱 Profile phone_number:", response.data.phone_number);
            // Update profile with fresh data from API
            setProfile((prevProfile) => ({
                ...prevProfile,
                ...response.data,
            }));
        } catch (error) {
            console.error("❌ Error fetching current user profile:", error);
        }
    }, [currentUser?.id]);

    // Initialize profile with current user data
    useEffect(() => {
        if (currentUser) {
            console.log("🔄 Initializing profile with currentUser:", currentUser);
            setProfile((prev) => ({
                ...prev,
                ...currentUser,
            }));

            // Fetch fresh profile data to ensure we have the latest profile picture
            fetchCurrentUserProfile();
        }
    }, [currentUser, fetchCurrentUserProfile]);

    // Update profile
    const updateProfile = useCallback(async () => {
        if (!profile.id) return;

        setProfileLoading(true);
        try {
            const token = localStorage.getItem("access_token");
            if (!token) {
                throw new Error("No authentication token found");
            }

            const response = await axios.put(
                apiEndpoints.userUpdate(profile.id),
                {
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    email: profile.email,
                    username: profile.username,
                    roles: profile.roles,
                    phone_number: profile.phone_number,
                    sms_consent: profile.sms_consent,
                    is_active: profile.is_active,
                },
                { headers: getAuthHeaders(token) }
            );

            setProfile((prev) => ({ ...prev, ...response.data }));
            setEditingProfile(false);

            // Notify other components
            notifyProfileUpdated(response.data);
        } catch (error) {
            console.error("Error updating profile:", error);
            throw error;
        } finally {
            setProfileLoading(false);
        }
    }, [profile]);

    // Update specific field (like phone number or SMS consent)
    const updateProfileField = useCallback(async (fieldName, fieldValue) => {
        if (!currentUser?.id) return;

        setProfileLoading(true);
        try {
            const token = localStorage.getItem("access_token");
            if (!token) {
                throw new Error("No authentication token found");
            }

            const updateData = {
                [fieldName]: fieldValue,
            };

            console.log('🔄 Updating profile field:', { fieldName, fieldValue, updateData, userId: currentUser.id });

            const response = await axios.patch(
                apiEndpoints.userUpdate(currentUser.id),
                updateData,
                { headers: getAuthHeaders(token) }
            );

            setProfile((prev) => ({ ...prev, ...response.data }));

            // Notify other components
            notifyProfileUpdated(response.data);

            return response.data;
        } catch (error) {
            console.error(`Error updating ${fieldName}:`, error);
            if (error.response) {
                console.error(`Response status: ${error.response.status}`);
                console.error(`Response data:`, error.response.data);
            }
            throw error;
        } finally {
            setProfileLoading(false);
        }
    }, [currentUser?.id]);

    // Upload profile picture
    const uploadProfilePicture = useCallback(
        async (file) => {
            if (!profile.id) return;

            const token = localStorage.getItem("access_token");
            if (!token) {
                throw new Error("No authentication token found");
            }

            const formData = new FormData();
            formData.append("profile_picture", file);

            try {
                const response = await axios.put(
                    apiEndpoints.userUpdate(profile.id),
                    formData,
                    { headers: getAuthHeadersForUpload(token) }
                );

                setProfile((prev) => ({
                    ...prev,
                    profile_picture: response.data.profile_picture,
                }));
            } catch (error) {
                console.error("Error uploading profile picture:", error);
                throw error;
            }
        },
        [profile.id]
    );

    // Delete user
    const deleteUser = useCallback(async () => {
        if (!profile.id) return;

        const token = localStorage.getItem("access_token");
        if (!token) {
            throw new Error("No authentication token found");
        }

        try {
            await axios.delete(apiEndpoints.userDelete(profile.id), {
                headers: getAuthHeaders(token),
            });
        } catch (error) {
            console.error("Error deleting user:", error);
            throw error;
        }
    }, [profile.id]);

    return {
        profile,
        setProfile,
        editingProfile,
        setEditingProfile,
        profileLoading,
        updateProfile,
        updateProfileField,
        uploadProfilePicture,
        deleteUser,
    };
};
