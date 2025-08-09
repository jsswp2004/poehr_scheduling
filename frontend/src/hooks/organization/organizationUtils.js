/**
 * Utility functions for organization-related operations
 */
import { API_BASE_URL } from '../../config/api';

/**
 * Utility function to construct logo URL
 * Handles both external URLs and local media paths
 */
export const getLogoUrl = (logoPath) => {
    if (!logoPath) return null;
    let path = String(logoPath).trim();
    if (path.startsWith('http')) return path;

    // Strip base URL if present
    if (API_BASE_URL && path.startsWith(API_BASE_URL)) {
        path = path.slice(API_BASE_URL.length);
    }

    // Normalize slashes
    path = path.replace(/\\/g, '/');

    // Normalize to /media/org_logos when needed
    if (path.startsWith('/media/')) {
        // ok
    } else if (path.startsWith('media/')) {
        path = `/${path}`;
    } else if (path.startsWith('org_logos/')) {
        path = `/media/${path}`;
    } else if (!path.includes('/')) {
        // bare filename
        path = `/media/org_logos/${path}`;
    } else {
        if (!path.startsWith('/')) path = `/${path}`;
    }

    path = path.replace(/^\/media\/media\//, '/media/');

    return `${API_BASE_URL}${path}`;
};

/**
 * Handle logo load errors with logging
 */
export const handleLogoError = (organizationName, logoPath) => {
    console.log(`Logo failed to load for ${organizationName}:`, logoPath);
    console.log('Attempted URL:', getLogoUrl(logoPath));
};
