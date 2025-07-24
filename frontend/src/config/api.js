// API Configuration for different environments
// This file centralizes all API endpoint configurations

// Determine base URL based on environment
const getBaseUrl = () => {
    // Check if we have a custom API URL from environment variables
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    // Default based on environment
    if (process.env.NODE_ENV === 'production') {
        // Production URL - using Application Load Balancer
        return 'http://poehr-healthcare-alb-2098682478.us-east-1.elb.amazonaws.com:8000';
    } else {
        // Development URL
        return 'http://127.0.0.1:8000';
    }
};

export const API_BASE_URL = getBaseUrl();

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
    mediaUrl: (path) => path?.startsWith('http') ? path : `${API_BASE_URL}${path}`,
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
