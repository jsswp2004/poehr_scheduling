/**
 * Phone number utility functions for consistent formatting and validation
 */

/**
 * Format phone number to international format with +1 prefix
 * @param {string} phone - Raw phone number in various formats
 * @returns {string} - Formatted phone number (+1234567890) or original if invalid
 */
export const formatPhoneToInternational = (phone) => {
    if (!phone) return '';

    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Handle different scenarios
    if (cleaned.length === 10) {
        // US number without country code: 3018806015 → +13018806015
        return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        // US number with country code: 13018806015 → +13018806015
        return `+${cleaned}`;
    } else if (cleaned.length === 11 && !cleaned.startsWith('1')) {
        // Assume US number: 03018806015 → +13018806015 (remove leading 0)
        return `+1${cleaned.slice(1)}`;
    } else if (phone.startsWith('+1') && cleaned.length === 11) {
        // Already formatted correctly: +13018806015
        return phone;
    } else if (phone.startsWith('+') && cleaned.length >= 10) {
        // International format: +441234567890
        return phone;
    }

    // If we can't determine format, assume US and try to fix
    if (cleaned.length >= 10) {
        return `+1${cleaned.slice(-10)}`;
    }

    // Return original if we can't format
    return phone;
};

/**
 * Format phone number for display purposes
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted for display: +1 (301) 880-6015
 */
export const formatPhoneForDisplay = (phone) => {
    if (!phone) return 'No phone number';

    const international = formatPhoneToInternational(phone);

    // Extract country code and number
    if (international.startsWith('+1') && international.length === 12) {
        const number = international.slice(2); // Remove +1
        const area = number.slice(0, 3);
        const exchange = number.slice(3, 6);
        const subscriber = number.slice(6, 10);
        return `+1 (${area}) ${exchange}-${subscriber}`;
    }

    // For non-US numbers, return as-is
    return international;
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {object} - {isValid: boolean, message: string, formatted: string}
 */
export const validatePhoneNumber = (phone) => {
    if (!phone || phone.trim() === '') {
        return {
            isValid: false,
            message: 'Phone number is required',
            formatted: ''
        };
    }

    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length < 10) {
        return {
            isValid: false,
            message: 'Phone number must be at least 10 digits',
            formatted: phone
        };
    }

    if (cleaned.length > 15) {
        return {
            isValid: false,
            message: 'Phone number is too long',
            formatted: phone
        };
    }

    const formatted = formatPhoneToInternational(phone);

    return {
        isValid: true,
        message: 'Valid phone number',
        formatted: formatted
    };
};

/**
 * Extract country code from phone number
 * @param {string} phone - Phone number
 * @returns {string} - Country code (e.g., '+1', '+44')
 */
export const getCountryCode = (phone) => {
    if (!phone) return '+1'; // Default to US

    const formatted = formatPhoneToInternational(phone);

    if (formatted.startsWith('+1')) return '+1';
    if (formatted.startsWith('+44')) return '+44';
    if (formatted.startsWith('+33')) return '+33';

    // Extract first 1-3 digits after +
    const match = formatted.match(/^\+(\d{1,3})/);
    return match ? `+${match[1]}` : '+1';
};

/**
 * Check if phone number appears to be a US number
 * @param {string} phone - Phone number
 * @returns {boolean} - True if appears to be US number
 */
export const isUSPhoneNumber = (phone) => {
    if (!phone) return true; // Default assumption

    const cleaned = phone.replace(/\D/g, '');

    // 10 digits = US without country code
    if (cleaned.length === 10) return true;

    // 11 digits starting with 1 = US with country code
    if (cleaned.length === 11 && cleaned.startsWith('1')) return true;

    // Already formatted with +1
    if (phone.startsWith('+1')) return true;

    return false;
};

/**
 * Get SMS character count and warnings
 * @param {string} message - SMS message
 * @returns {object} - {count: number, limit: number, isOver: boolean, warning: string}
 */
export const getSMSCharacterInfo = (message) => {
    const count = message ? message.length : 0;
    const singleSMSLimit = 160;
    const multiSMSLimit = 153; // Per segment for multi-part SMS

    if (count <= singleSMSLimit) {
        return {
            count,
            limit: singleSMSLimit,
            segments: 1,
            isOver: false,
            warning: ''
        };
    } else {
        const segments = Math.ceil(count / multiSMSLimit);
        return {
            count,
            limit: multiSMSLimit,
            segments,
            isOver: count > (multiSMSLimit * 3), // Warn after 3 segments
            warning: segments > 1 ? `Message will be sent as ${segments} parts` : ''
        };
    }
};
