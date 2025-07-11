/**
 * Utility functions for organization-related operations
 */

/**
 * Utility function to construct logo URL
 * Handles both external URLs and local media paths
 */
export const getLogoUrl = (logoPath) => {
    if (!logoPath || logoPath.trim() === '') {
        console.log('No logo path provided:', logoPath);
        return null;
    }

    if (logoPath.startsWith('http')) {
        console.log('Using external URL:', logoPath);
        return logoPath;
    }

    const constructedUrl = `http://127.0.0.1:8000/media/${logoPath}`;
    console.log('Constructed media URL:', constructedUrl);
    return constructedUrl;
};

/**
 * Handle logo load errors with logging
 */
export const handleLogoError = (organizationName, logoPath) => {
    console.log(`Logo failed to load for ${organizationName}:`, logoPath);
    console.log('Attempted URL:', getLogoUrl(logoPath));
};
