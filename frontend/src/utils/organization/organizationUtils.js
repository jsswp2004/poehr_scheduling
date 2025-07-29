/**
 * Organization utility functions
 */
import { API_BASE_URL } from '../../config/api';

// Helper function to properly construct logo URLs
export const getLogoUrl = (logoPath) => {
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    return `${API_BASE_URL}${logoPath}`;
};

// Validate organization form data
export const validateOrganizationForm = (formData) => {
    const errors = {};

    if (!formData.name.trim()) {
        errors.name = 'Organization name is required';
    } else if (formData.name.trim().length < 2) {
        errors.name = 'Organization name must be at least 2 characters';
    } else if (formData.name.trim().length > 255) {
        errors.name = 'Organization name must be less than 255 characters';
    }

    return errors;
};

// Validate uploaded file
export const validateUploadedFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
        return { isValid: false, error: 'Please select a valid image file (JPEG, PNG, or GIF)' };
    }

    if (file.size > maxSize) {
        return { isValid: false, error: 'File size must be less than 5MB' };
    }

    return { isValid: true };
};

// Create file preview
export const createFilePreview = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
};

// Filter organizations by search query
export const filterOrganizations = (organizations, searchQuery) => {
    if (!searchQuery.trim()) return organizations;

    const query = searchQuery.toLowerCase();
    return organizations.filter(org =>
        org.name.toLowerCase().includes(query)
    );
};
