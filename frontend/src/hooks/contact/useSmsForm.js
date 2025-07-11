import { useState } from 'react';

/**
 * Custom hook for managing SMS form state and validation
 */
export const useSmsForm = () => {
    const [smsFormData, setSmsFormData] = useState({
        phone_to: '3018806015',
        phone_from: '',
        message: ''
    });
    const [smsFormErrors, setSmsFormErrors] = useState({});

    const handleSmsInputChange = (e) => {
        const { name, value } = e.target;
        setSmsFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear error when user starts typing
        if (smsFormErrors[name]) {
            setSmsFormErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateSmsForm = () => {
        const errors = {};

        if (!smsFormData.phone_from.trim()) {
            errors.phone_from = 'Your phone number is required';
        }

        if (!smsFormData.message.trim()) {
            errors.message = 'Message is required';
        }

        setSmsFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const resetSmsForm = () => {
        setSmsFormData({
            phone_to: '3018806015',
            phone_from: '',
            message: ''
        });
        setSmsFormErrors({});
    };

    return {
        smsFormData,
        smsFormErrors,
        handleSmsInputChange,
        validateSmsForm,
        resetSmsForm,
        setSmsFormErrors
    };
};
