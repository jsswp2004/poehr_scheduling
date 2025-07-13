import { useState } from 'react';
import axios from 'axios';
import { apiEndpoints, getAuthHeaders, API_BASE_URL } from '../config/api';
import { USER_ROLES } from '../config/constants';
import { toast } from '../components/SimpleToast';

/**
 * Custom hook for profile page user search functionality
 */
export const useProfileSearch = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [userSearchResults, setUserSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const pageSize = 10;

    const searchUsers = async (query, page = 1) => {
        console.log('🔍 searchUsers called with query:', query, 'page:', page);

        setSearchLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            console.log('🔍 Making API call with token:', !!token);

            // For now, let's use the original API without pagination to test
            let url;
            if (!query || query.trim().length === 0) {
                // For empty search, try to get all users by using an empty query
                url = apiEndpoints.userSearch('');
            } else {
                url = apiEndpoints.userSearch(query);
            }

            console.log('🔍 Using URL:', url);
            const res = await axios.get(url, { headers: getAuthHeaders(token) });

            console.log('🔍 API response:', res.data);

            // Handle response (assume non-paginated for now)
            const results = Array.isArray(res.data) ? res.data : [];

            // Filter out patients and include all other users for profile search
            const filtered = results.filter((u) => u.role !== USER_ROLES.PATIENT);

            // Implement client-side pagination for now
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedResults = filtered.slice(startIndex, endIndex);
            const totalPages = Math.ceil(filtered.length / pageSize);

            console.log('🔍 Filtered results:', filtered.length, 'Page results:', paginatedResults.length);
            setUserSearchResults(paginatedResults);
            setShowSearchResults(true);
            setCurrentPage(page);
            setTotalPages(totalPages);
            setTotalResults(filtered.length);

            if (filtered.length === 0 && query) {
                toast.info("No users found matching your search.");
            }
        } catch (error) {
            console.error("Search error:", error);
            toast.error("Failed to search users");
            setUserSearchResults([]);
            setTotalResults(0);
            setTotalPages(1);
        } finally {
            setSearchLoading(false);
        }
    };

    const selectUser = (selectedUser) => {
        // This will be handled by the profile logic
        setShowSearchResults(false);
        return selectedUser;
    };

    const clearSearch = () => {
        setSearchTerm("");
        setUserSearchResults([]);
        setShowSearchResults(false);
        setCurrentPage(1);
        setTotalPages(1);
        setTotalResults(0);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
        searchUsers(searchTerm, page);
    };

    return {
        // State
        searchTerm,
        userSearchResults,
        searchLoading,
        showSearchResults,
        currentPage,
        totalPages,
        totalResults,

        // Setters
        setSearchTerm,
        setShowSearchResults,

        // Actions
        searchUsers,
        selectUser,
        clearSearch,
        handlePageChange,
    };
};
