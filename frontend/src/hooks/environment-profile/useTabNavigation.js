import { useState } from 'react';

/**
 * Custom hook for managing tab navigation state
 * Handles switching between different tabs in the environment profile page
 */
export const useTabNavigation = (initialTab = 'blocked-days') => {
    const [tabKey, setTabKey] = useState(initialTab);

    const handleTabChange = (event, newValue) => {
        setTabKey(newValue);
    };

    return {
        tabKey,
        handleTabChange
    };
};
