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

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<string|null>} - new access token or null if failed
 */
export const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    console.error('No refresh token available');
    return null;
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
      refresh: refreshToken
    });

    const { access, refresh: newRefresh } = response.data;

    // Update stored tokens using centralized manager
    storeTokens(access, newRefresh || refreshToken);

    // Update axios default header
    axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;

    console.log('Token refreshed successfully');
    return access;
  } catch (error) {
    console.error('Token refresh failed:', error);

    // If refresh fails, clear all tokens and redirect to login
    clearTokens();
    delete axios.defaults.headers.common['Authorization'];

    return null;
  }
};

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string|null>} - valid access token or null if authentication failed
 */
export const getValidToken = async () => {
  console.log('🔍 getValidToken: Starting token validation...');
  let token = getAccessToken();
  console.log('🔑 getValidToken: Retrieved token from storage:', token ? `✅ Token exists (${token.substring(0, 20)}...)` : '❌ No token found');

  if (!token) {
    console.error('❌ getValidToken: No access token found');
    return null;
  }

  // If token is expired, try to refresh it
  if (isTokenExpired(token)) {
    console.log('🔄 getValidToken: Token expired, attempting to refresh...');
    token = await refreshAccessToken();
    console.log('🔑 getValidToken: Refresh result:', token ? '✅ Success' : '❌ Failed');
  }
  // If token is expiring soon, proactively refresh it
  else if (isTokenExpiringSoon(token)) {
    console.log('🔄 getValidToken: Token expiring soon, proactively refreshing...');
    const newToken = await refreshAccessToken();
    console.log('🔑 getValidToken: Proactive refresh result:', newToken ? '✅ Success' : '❌ Failed');
    if (newToken) {
      token = newToken;
    }
    // If refresh fails, we still use the current token since it's not expired yet
  }

  console.log('✅ getValidToken: Returning token:', token ? '✅ Valid token available' : '❌ No valid token');
  return token;
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
