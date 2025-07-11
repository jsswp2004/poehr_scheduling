import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Custom hook for managing enrollment form data and URL parameters
 * Handles initial state from URL params and form state management
 */
export const useEnrollmentForm = () => {
    const [searchParams] = useSearchParams();

    // Get parameters from URL
    const urlPlan = searchParams.get('plan'); // 'personal', 'clinic', 'group'
    const urlTier = searchParams.get('tier'); // 'basic', 'premium', 'enterprise'

    // Map URL parameters to form values
    const getInitialOrgType = () => {
        if (urlPlan) {
            switch (urlPlan.toLowerCase()) {
                case 'personal': return 'personal';
                case 'clinic': return 'clinic';
                case 'group': return 'group';
                default: return 'personal';
            }
        }
        return 'personal';
    };

    const getInitialTier = () => {
        if (urlTier) {
            switch (urlTier.toLowerCase()) {
                case 'basic': return 'basic';
                case 'premium': return 'premium';
                case 'enterprise': return 'enterprise';
                default: return 'premium';
            }
        }
        // If plan is specified but tier isn't, map plan to default tier
        if (urlPlan) {
            switch (urlPlan.toLowerCase()) {
                case 'personal': return 'basic';
                case 'clinic': return 'premium';
                case 'group': return 'enterprise';
                default: return 'premium';
            }
        }
        return 'premium';
    };

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone_number: '',
        organization_name: '',
        organization_type: getInitialOrgType(),
        subscription_tier: getInitialTier(),
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleTierSelect = (tier) => {
        setFormData({
            ...formData,
            subscription_tier: tier,
        });
    };

    return {
        formData,
        setFormData,
        handleChange,
        handleTierSelect,
        urlPlan,
        urlTier
    };
};
