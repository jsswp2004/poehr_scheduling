import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders, getAuthHeadersForUpload } from '../config/api';
import { notifyProfileUpdated } from '../utils/events';
import { useAuth } from './useAuth';

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
        is_active: true,
    });

    const [editingProfile, setEditingProfile] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    // Initialize profile with current user data
    useEffect(() => {
        if (currentUser) {
            setProfile(prev => ({
                ...prev,
                ...currentUser,
            }));
        }
    }, [currentUser]);

    // Update profile
    const updateProfile = useCallback(async () => {
        if (!profile.id) return;

        setProfileLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const response = await axios.put(
                apiEndpoints.userUpdate(profile.id),
                {
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    email: profile.email,
                    username: profile.username,
                    roles: profile.roles,
                    is_active: profile.is_active,
                },
                { headers: getAuthHeaders(token) }
            );

            setProfile(prev => ({ ...prev, ...response.data }));
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

    // Upload profile picture
    const uploadProfilePicture = useCallback(async (file) => {
        if (!profile.id) return;

        const token = localStorage.getItem('access_token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const formData = new FormData();
        formData.append("profile_picture", file);

        try {
            const response = await axios.put(
                apiEndpoints.userUpdate(profile.id),
                formData,
                { headers: getAuthHeadersForUpload(token) }
            );

            setProfile(prev => ({ ...prev, profile_picture: response.data.profile_picture }));
        } catch (error) {
            console.error("Error uploading profile picture:", error);
            throw error;
        }
    }, [profile.id]);

    // Delete user
    const deleteUser = useCallback(async () => {
        if (!profile.id) return;

        const token = localStorage.getItem('access_token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        try {
            await axios.delete(
                apiEndpoints.userDelete(profile.id),
                { headers: getAuthHeaders(token) }
            );
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
        uploadProfilePicture,
        deleteUser,
    };
};
