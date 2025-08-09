/**
 * Centralized Token Management for POWER Scheduler
 * This file standardizes how authentication tokens are stored and retrieved
 * to prevent inconsistencies between different parts of the application.
 */

import { jwtDecode } from 'jwt-decode';

// Standard token keys - use these throughout the application
export const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token'
};

/**
 * Store authentication tokens in localStorage
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 */
export const storeTokens = (accessToken, refreshToken) => {
  if (accessToken) {
    // Store as JSON to be extension-friendly
    localStorage.setItem(TOKEN_KEYS.ACCESS, JSON.stringify({ token: accessToken }));
  }
  if (refreshToken) {
    // Store as JSON to be extension-friendly
    localStorage.setItem(TOKEN_KEYS.REFRESH, JSON.stringify({ token: refreshToken }));
  }

  // Clean up any legacy token keys to prevent confusion
  cleanupLegacyTokens();

  console.log('✅ Tokens stored successfully');
};

/**
 * Get the current access token from localStorage
 * @returns {string|null} Access token or null if not found
 */
export const getAccessToken = () => {
  const stored = localStorage.getItem(TOKEN_KEYS.ACCESS);
  console.log('🔍 getAccessToken: Raw stored value:', stored ? '✅ Found in localStorage' : '❌ Not found in localStorage');

  if (!stored) return null;

  try {
    // Try to parse as JSON first (new format)
    const parsed = JSON.parse(stored);
    const token = parsed.token || null;
    console.log('🔑 getAccessToken: Parsed token:', token ? '✅ Token extracted from JSON' : '❌ No token in JSON');
    return token;
  } catch {
    // Fallback to direct string (legacy format)
    console.log('🔑 getAccessToken: Using legacy format (direct string)');
    return stored;
  }
};

/**
 * Get the current refresh token from localStorage
 * @returns {string|null} Refresh token or null if not found
 */
export const getRefreshToken = () => {
  const stored = localStorage.getItem(TOKEN_KEYS.REFRESH);
  console.log('🔍 getRefreshToken: Raw stored value:', stored ? '✅ Found in localStorage' : '❌ Not found in localStorage');

  if (!stored) return null;

  try {
    // Try to parse as JSON first (new format)
    const parsed = JSON.parse(stored);
    const token = parsed.token || null;
    console.log('🔑 getRefreshToken: Parsed token:', token ? '✅ Token extracted from JSON' : '❌ No token in JSON');
    return token;
  } catch {
    // Fallback to direct string (legacy format)
    console.log('🔑 getRefreshToken: Using legacy format (direct string)');
    return stored;
  }
};

/**
 * Remove all authentication tokens from localStorage
 */
export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEYS.ACCESS);
  localStorage.removeItem(TOKEN_KEYS.REFRESH);

  // Also clean up legacy tokens
  cleanupLegacyTokens();

  console.log('🧹 All tokens cleared');
};

/**
 * Clean up legacy token keys that might cause confusion
 */
const cleanupLegacyTokens = () => {
  const legacyKeys = ['token', 'authToken', 'jwt_token', 'auth_token'];
  legacyKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`🧹 Removed legacy token: ${key}`);
    }
  });
};

/**
 * Check if a token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} True if expired, false if valid
 */
export const isTokenExpired = (token) => {
  if (!token) return true;

  try {
    const decoded = jwtDecode(token);
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    console.error('Error decoding token:', error);
    return true;
  }
};

/**
 * Check if a token will expire soon (within 5 minutes)
 * @param {string} token - JWT token to check
 * @returns {boolean} True if expiring soon, false otherwise
 */
export const isTokenExpiringSoon = (token) => {
  if (!token) return true;

  try {
    const decoded = jwtDecode(token);
    const currentTime = Math.floor(Date.now() / 1000);
    const fiveMinutesFromNow = currentTime + (5 * 60);
    return decoded.exp < fiveMinutesFromNow;
  } catch (error) {
    console.error('Error decoding token:', error);
    return true;
  }
};

/**
 * Get user information from the current access token
 * @returns {Object|null} User info object or null if no valid token
 */
export const getCurrentUserFromToken = () => {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) {
    return null;
  }

  try {
    const decoded = jwtDecode(token);
    return {
      id: decoded.user_id,
      username: decoded.username,
      email: decoded.email,
      firstName: decoded.first_name,
      lastName: decoded.last_name,
      role: decoded.role
    };
  } catch (error) {
    console.error('Error extracting user from token:', error);
    return null;
  }
};

/**
 * Set up browser storage event listener to detect token changes across tabs
 */
export const setupTokenStorageListener = (callback) => {
  const handleStorageChange = (event) => {
    if (event.key === TOKEN_KEYS.ACCESS || event.key === TOKEN_KEYS.REFRESH) {
      console.log('🔄 Token changed in another tab, refreshing state...');
      callback();
    }
  };

  window.addEventListener('storage', handleStorageChange);

  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
};

/**
 * Debug function to log current token state
 */
export const debugTokenState = () => {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  console.group('🔍 Token Debug State');
  console.log('Access token present:', !!accessToken);
  console.log('Refresh token present:', !!refreshToken);

  if (accessToken) {
    console.log('Access token expired:', isTokenExpired(accessToken));
    console.log('Access token expiring soon:', isTokenExpiringSoon(accessToken));

    const user = getCurrentUserFromToken();
    if (user) {
      console.log('Current user:', user);
    }
  }

  // Check for legacy tokens
  const legacyKeys = ['token', 'authToken', 'jwt_token', 'auth_token'];
  const legacyTokens = legacyKeys.filter(key => localStorage.getItem(key));
  if (legacyTokens.length > 0) {
    console.warn('⚠️ Legacy tokens found:', legacyTokens);
  }

  console.groupEnd();
};
