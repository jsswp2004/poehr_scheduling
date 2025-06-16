import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string|null>} Valid access token or null if not available
 */
export const getValidToken = async () => {
  try {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    if (!accessToken) {
      return null;
    }

    // Check if token is expired
    try {
      const decoded = jwtDecode(accessToken);
      const currentTime = Math.floor(Date.now() / 1000);
      
      // If token is still valid (with 5 minute buffer), return it
      if (decoded.exp && decoded.exp > currentTime + 300) {
        return accessToken;
      }
    } catch (decodeError) {
      console.error('Token decode error:', decodeError);
      // Token is malformed, try to refresh
    }

    // Token is expired or malformed, try to refresh
    if (refreshToken) {
      try {
        const response = await axios.post('http://127.0.0.1:8000/api/auth/token/refresh/', {
          refresh: refreshToken
        });

        const newAccessToken = response.data.access;
        localStorage.setItem('access_token', newAccessToken);
        
        // Update refresh token if provided
        if (response.data.refresh) {
          localStorage.setItem('refresh_token', response.data.refresh);
        }

        return newAccessToken;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        clearAuthData();
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting valid token:', error);
    return null;
  }
};

/**
 * Clear all authentication data from localStorage
 */
export const clearAuthData = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token'); // Legacy key
};

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if user has a valid token
 */
export const isAuthenticated = async () => {
  const token = await getValidToken();
  return !!token;
};
