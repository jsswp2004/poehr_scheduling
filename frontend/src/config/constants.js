// Application constants and configuration values

// User roles
export const USER_ROLES = {
    ADMIN: 'admin',
    SYSTEM_ADMIN: 'system_admin',
    DOCTOR: 'doctor',
    REGISTRAR: 'registrar',
    RECEPTIONIST: 'receptionist',
    PATIENT: 'patient',
};

// Local storage keys
export const STORAGE_KEYS = {
    ACCESS_TOKEN: 'access_token',
    USER_DATA: 'user_data',
    THEME_PREFERENCE: 'theme_preference',
};

// Form validation patterns
export const VALIDATION_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/,
    PASSWORD_MIN_LENGTH: 8,
};

// UI constants
export const UI_CONSTANTS = {
    DEBOUNCE_DELAY: 300,
    SEARCH_MIN_CHARS: 2,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
};

// API request timeouts
export const TIMEOUTS = {
    DEFAULT: 10000, // 10 seconds
    UPLOAD: 30000,  // 30 seconds for file uploads
    LONG: 60000,    // 1 minute for long operations
};

// Toast/notification types
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};

// Pagination defaults
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
};

// Environment helpers
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
