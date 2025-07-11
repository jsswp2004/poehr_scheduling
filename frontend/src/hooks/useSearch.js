import { useState } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders } from '../config/api';
import { USER_ROLES } from '../config/constants';
import { toast } from '../components/SimpleToast';

/**
 * Custom hook for user search functionality
 */
export const useSearch = (token, currentUser, user) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    // Handle user search
    const handleSearch = async () => {
        try {
            // Fetch the current user's organization
            const orgId = user && user.organization && typeof user.organization === "object"
                ? user.organization.id
                : user.organization;

            const res = await axios.get(
                apiEndpoints.userSearch(searchQuery),
                { headers: getAuthHeaders(token) }
            );

            // System admins can see all users across organizations
            const isSystemAdmin = currentUser?.role === USER_ROLES.SYSTEM_ADMIN;

            // Filter results based on role and organization
            const filtered = res.data.filter((u) => {
                // Always exclude patients from search results
                if (u.role === USER_ROLES.PATIENT) return false;

                // For system admins, include all non-patient users regardless of organization
                if (isSystemAdmin) return true;

                // For other roles, only include users from the same organization
                if (!u.organization || !orgId) return false;

                // Handle organization as object or ID
                if (typeof u.organization === "object")
                    return String(u.organization.id) === String(orgId);
                return String(u.organization) === String(orgId);
            });

            setSearchResults(filtered);

            if (filtered.length === 0) {
                toast.info(
                    isSystemAdmin
                        ? "No matching users found."
                        : "No matching users found in your organization."
                );
            }
        } catch (err) {
            console.error("Search failed:", err);
            toast.error("Search failed.");
        }
    };

    // Handle user deletion
    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this user?"
        );
        if (!confirmDelete) return;

        try {
            await axios.delete(
                apiEndpoints.userDelete(id),
                { headers: getAuthHeaders(token) }
            );

            toast.success("User deleted!");
            setSearchResults(prev => prev.filter(u => u.id !== id));
        } catch (err) {
            console.error("Delete failed:", err);
            toast.error("Failed to delete user.");
        }
    };

    // Select a user from search results
    const selectUser = (selectedUser, setUser, setFormData) => {
        setUser(selectedUser);
        setFormData({
            username: selectedUser.username,
            first_name: selectedUser.first_name,
            last_name: selectedUser.last_name,
            email: selectedUser.email,
            phone_number: selectedUser.phone_number || "",
            organization: selectedUser.organization,
            role: selectedUser.role,
        });
        setSearchResults([]);
    };

    // Clear search results
    const clearSearch = () => {
        setSearchResults([]);
        setSearchQuery("");
    };

    return {
        // State
        searchQuery,
        searchResults,

        // Actions
        setSearchQuery,
        handleSearch,
        handleDelete,
        selectUser,
        clearSearch,
    };
};
