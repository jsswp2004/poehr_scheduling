/**
 * Organization utility functions
 */
import { API_BASE_URL } from '../../config/api';

// Helper function to properly construct logo URLs
export const getLogoUrl = (logoPath) => {
    if (!logoPath) return null;
    let path = String(logoPath).trim();
    if (path.startsWith('http')) return path;

    // Strip base URL if accidentally stored
    if (API_BASE_URL && path.startsWith(API_BASE_URL)) {
        path = path.slice(API_BASE_URL.length);
    }

    // Normalize slashes
    path = path.replace(/\\/g, '/');

    // Ensure we end up with a single '/media/...' path regardless of input shape
    // Accepted inputs: '/media/org_logos/foo.png', 'media/org_logos/foo.png', 'org_logos/foo.png', 'foo.png'
    if (path.startsWith('/media/')) {
        // ok as-is
    } else if (path.startsWith('media/')) {
        path = `/${path}`;
    } else if (path.startsWith('org_logos/')) {
        path = `/media/${path}`;
    } else if (!path.includes('/')) {
        // bare filename
        path = `/media/org_logos/${path}`;
    } else {
        // Unknown relative, ensure leading slash
        if (!path.startsWith('/')) path = `/${path}`;
    }

    // De-dupe any accidental double media prefixes
    path = path.replace(/^\/media\/media\//, '/media/');

    return `${API_BASE_URL}${path}`;
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
