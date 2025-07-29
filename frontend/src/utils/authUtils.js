import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { 
  getAccessToken, 
  getRefreshToken, 
  storeTokens, 
  clearTokens, 
  isTokenExpired 
} from './tokenManager';

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string|null>} Valid access token or null if not available
 */
export const getValidToken = async () => {
  try {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();

    if (!accessToken) {
      return null;
    }

    // Check if token is expired using centralized function
    if (!isTokenExpired(accessToken)) {
      return accessToken;
    }

    // Token is expired, try to refresh
    if (refreshToken) {
      try {
        const response = await axios.post('${API_BASE_URL}/api/auth/token/refresh/', {
          refresh: refreshToken
        });

        const newAccessToken = response.data.access;
        const newRefreshToken = response.data.refresh;
        
        // Store tokens using centralized manager
        storeTokens(newAccessToken, newRefreshToken);

        return newAccessToken;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        clearTokens();
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
  clearTokens();
};

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if user has a valid token
 */
export const isAuthenticated = async () => {
  const token = await getValidToken();
  return !!token;
};
