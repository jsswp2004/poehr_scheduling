import { useState, useEffect } from 'react';

/**
 * Custom hook for managing organization search functionality
 * Handles search query and filtering of organizations
 */
export const useOrganizationSearch = (allOrganizations) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredOrganizations, setFilteredOrganizations] = useState([]);

    useEffect(() => {
        // Filter organizations based on search query
        if (searchQuery.trim() === '') {
            setFilteredOrganizations(allOrganizations);
        } else {
            const filtered = allOrganizations.filter(org =>
                org.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setFilteredOrganizations(filtered);
        }
    }, [searchQuery, allOrganizations]);

    const handleSearchChange = (value) => {
        setSearchQuery(value);
    };

    return {
        searchQuery,
        filteredOrganizations,
        handleSearchChange,
        setSearchQuery
    };
};
