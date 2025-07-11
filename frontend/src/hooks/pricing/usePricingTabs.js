import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Custom hook for managing pricing page tab navigation
 * Handles URL parameters for plan pre-selection and tab state
 */
export const usePricingTabs = () => {
    const [searchParams] = useSearchParams();

    // Get initial tab from URL parameter, defaulting to 'personal'
    const getInitialTab = () => {
        const planParam = searchParams.get('plan');
        // Only allow 'personal' or 'clinic' pre-selection (Group goes to contact page)
        if (planParam === 'clinic') {
            return 'clinic';
        }
        return 'personal'; // Default to personal for any other value or no parameter
    };

    // State for active tab with URL parameter support
    const [activeTab, setActiveTab] = useState(getInitialTab());

    // Update tab when URL parameters change
    useEffect(() => {
        setActiveTab(getInitialTab());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Handler function for tab clicks
    const handleTabClick = (tab) => {
        setActiveTab(tab);
    };

    return {
        activeTab,
        handleTabClick
    };
};
