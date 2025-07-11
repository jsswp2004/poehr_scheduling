import { useState } from 'react';

/**
 * Custom hook for managing email form state and validation
 */
export const useEmailForm = () => {
    const [formData, setFormData] = useState({
        to: 'info@powerhealthcareit.com  ',
        from: '',
        telephone: '',
        subject: '',
        message: ''
    });
    const [formErrors, setFormErrors] = useState({});

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear error when user starts typing
        if (formErrors[name]) {
            setFormErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!formData.from.trim()) {
            errors.from = 'Email address is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.from)) {
            errors.from = 'Please enter a valid email address';
        }

        if (!formData.telephone.trim()) {
            errors.telephone = 'Phone number is required';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const resetForm = () => {
        setFormData({
            to: 'info@powerhealthcareit.com  ',
            from: '',
            telephone: '',
            subject: '',
            message: ''
        });
        setFormErrors({});
    };

    return {
        formData,
        formErrors,
        handleInputChange,
        validateForm,
        resetForm,
        setFormErrors
    };
};
