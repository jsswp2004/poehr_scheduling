/**
 * Custom hook for registration page utilities
 * Provides helper functions for formatting and validation
 */
export const useRegistrationUtils = () => {
    // Format phone number with (XXX) XXX-XXXX pattern
    const formatPhoneNumber = (value) => {
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    };

    // Check if user is logged in
    const isLoggedIn = () => {
        return !!localStorage.getItem('access_token');
    };

    // Validate email format
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Validate phone number (basic check for 10 digits)
    const isValidPhone = (phone) => {
        const digitsOnly = phone.replace(/\D/g, '');
        return digitsOnly.length === 10;
    };

    // Check if registration requires contact info
    const requiresContactInfo = (isPatient, hasProvider, isLoggedIn) => {
        return !isLoggedIn && isPatient && hasProvider === 'no';
    };

    // Get contact validation message
    const getContactValidationMessage = (email, phone, requiresContact) => {
        if (!requiresContact) return null;

        if (!email || !phone) {
            return 'Please provide us with your contact details.';
        }

        return 'A representative will reach out to you shortly after registration. Thank you!';
    };

    return {
        formatPhoneNumber,
        isLoggedIn,
        isValidEmail,
        isValidPhone,
        requiresContactInfo,
        getContactValidationMessage
    };
};
