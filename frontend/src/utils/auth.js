import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearTokens,
  isTokenExpired,
  isTokenExpiringSoon
} from './tokenManager';

// Single-flight guards to prevent multiple simultaneous operations
let refreshPromise = null;
let getValidTokenPromise = null;

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<string|null>} - new access token or null if failed
 */
export const refreshAccessToken = async () => {
  // If a refresh is already in progress, return that promise
  if (refreshPromise) {
    console.log('🔄 Refresh already in progress, waiting for existing refresh...');
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    console.error('No refresh token available');
    return null;
  }

  // Create the refresh promise
  refreshPromise = (async () => {
    try {
      console.log('🔄 Starting token refresh...');
      const response = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
        refresh: refreshToken
      });

      const { access, refresh: newRefresh } = response.data;

      // Update stored tokens using centralized manager
      storeTokens(access, newRefresh || refreshToken);

      // Update axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

      console.log('✅ Token refreshed successfully');
      return access;
    } catch (error) {
      console.error('❌ Token refresh failed:', error);

      // If refresh fails, clear all tokens and redirect to login
      clearTokens();
      delete axios.defaults.headers.common['Authorization'];

      return null;
    } finally {
      // Clear the promise so future refreshes can proceed
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string|null>} - valid access token or null if authentication failed
 */
export const getValidToken = async () => {
  // If a getValidToken call is already in progress, return that promise
  if (getValidTokenPromise) {
    console.log('🔄 getValidToken already in progress, waiting...');
    return getValidTokenPromise;
  }

  // Create the getValidToken promise
  getValidTokenPromise = (async () => {
    try {
      let token = getAccessToken();

      if (!token) {
        console.error('❌ No access token found');
        return null;
      }

      // Check token status
      const expired = isTokenExpired(token);
      const expiringSoon = isTokenExpiringSoon(token);
      
      console.log(`🔍 Token status - Expired: ${expired}, Expiring soon: ${expiringSoon}`);

      // If token is expired, try to refresh it
      if (expired) {
        console.log('🔄 Token expired, attempting to refresh...');
        token = await refreshAccessToken();
      }
      // If token is expiring soon, proactively refresh it
      else if (expiringSoon) {
        console.log('🔄 Token expiring soon, attempting proactive refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          token = newToken;
        }
        // If refresh fails, we still use the current token since it's not expired yet
      } else {
        console.log('✅ Token is valid, no refresh needed');
      }

      return token;
    } finally {
      // Clear the promise so future calls can proceed
      getValidTokenPromise = null;
    }
  })();

  return getValidTokenPromise;
};

/**
 * Clear all authentication data
 */
export const clearAuthData = () => {
  clearTokens();
  delete axios.defaults.headers.common['Authorization'];
};

/**
 * Check if user is authenticated with a valid token
 * @returns {Promise<boolean>} - true if authenticated, false otherwise
 */
export const isAuthenticated = async () => {
  const token = await getValidToken();
  return !!token;
};

// Re-export token manager functions for backwards compatibility
export { isTokenExpired, isTokenExpiringSoon } from './tokenManager';
