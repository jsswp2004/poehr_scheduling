// API Configuration for different environments
// This file centralizes all API endpoint configurations

// Determine base URL based on environment
const getBaseUrl = () => {
    // Check if we have a custom API URL from environment variables
    if (process.env.REACT_APP_API_URL) {
        let url = process.env.REACT_APP_API_URL;
        // Note: Using the URL as specified in environment variable
        // TODO: Configure backend to support HTTPS for better security
        return url;
    }

    // Default based on environment
    if (process.env.NODE_ENV === 'production') {
        // Check if we're on the custom domain
        if (window.location.hostname === 'powerhealthcareit.com' ||
            window.location.hostname === 'www.powerhealthcareit.com') {
            // Always use www version for SSL certificate compatibility
            // This ensures SSL works regardless of how user accessed the site
            console.log('🔧 SSL Debug - Detected custom domain, using www version');
            console.log('🔧 SSL Debug - Current hostname:', window.location.hostname);
            return 'https://www.powerhealthcareit.com';
        }
        // Production URL - use the specific backend Azure Container App URL
        console.log('🔧 SSL Debug - Using Azure Container App URL');
        return 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io';
    } else {
        // Development URL - default to localhost:8000
        return 'http://localhost:8000';
    }
};

export const API_BASE_URL = getBaseUrl();

// WebSocket URL configuration
const getWebSocketUrl = () => {
    if (process.env.REACT_APP_WS_URL) {
        return process.env.REACT_APP_WS_URL;
    }

    if (process.env.NODE_ENV === 'production') {
        // Check if we're on the custom domain for WebSocket
        if (window.location.hostname === 'powerhealthcareit.com' ||
            window.location.hostname === 'www.powerhealthcareit.com') {
            // Always use www version for SSL certificate compatibility
            // This ensures WebSocket SSL works regardless of how user accessed the site
            return 'wss://www.powerhealthcareit.com';
        }

        // Production WebSocket URL - use same domain but wss protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        // Debug info for Azure troubleshooting
        console.log('🔧 WebSocket URL Debug:', {
            protocol: window.location.protocol,
            host: window.location.host,
            wsProtocol: protocol,
            finalUrl: `${protocol}//${host}`
        });

        return `${protocol}//${host}`;
    } else {
        // Development WebSocket URL - updated to use port 8080 consistently
        return `ws://localhost:8080`;
    }
};

export const WS_BASE_URL = getWebSocketUrl();

// API Endpoints - centralized endpoint definitions
export const apiEndpoints = {
    // User endpoints
    user: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userUpdate: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userDelete: (id) => `${API_BASE_URL}/api/users/${id}/`,
    userSearch: (query) => `${API_BASE_URL}/api/users/search/?q=${query}`,

    // Organization endpoints
    organizations: `${API_BASE_URL}/api/users/organizations/`,

    // Doctor endpoints
    doctors: `${API_BASE_URL}/api/users/doctors/`,

    // Appointment endpoints
    appointments: `${API_BASE_URL}/api/appointments/`,
    appointment: (id) => `${API_BASE_URL}/api/appointments/${id}/`,
    availableSlots: (doctorId, date) => `${API_BASE_URL}/api/doctors/${doctorId}/available-dates/`,

    // Authentication endpoints
    changePassword: `${API_BASE_URL}/api/auth/change-password/`,
    adminChangePassword: `${API_BASE_URL}/api/users/admin-change-password/`,

    // Communication endpoints
    sendEmail: `${API_BASE_URL}/api/auth/send-email/`,
    sendSMS: `${API_BASE_URL}/api/auth/send-sms/`,

    // Media endpoints
    profilePicture: (id) => `${API_BASE_URL}/api/users/${id}/`,
    mediaUrl: (path) => path?.startsWith(`http`) ? path : `${API_BASE_URL}${path}`,
};

// Common headers for API requests
export const getAuthHeaders = (token) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
});

// For file uploads
export const getAuthHeadersForUpload = (token) => ({
    'Authorization': `Bearer ${token}`,
    // Don't set Content-Type for file uploads - let browser set it
});

// API request configuration
export const apiConfig = {
    timeout: 10000, // 10 seconds timeout
    headers: {
        'Content-Type': 'application/json',
    },
};

// Export for debugging
export const debugApiConfig = () => {
    console.log('🔧 API Configuration:', {
        baseUrl: API_BASE_URL,
        environment: process.env.NODE_ENV,
        customApiUrl: process.env.REACT_APP_API_URL,
    });
};
