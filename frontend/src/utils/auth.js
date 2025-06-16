import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Check if a token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - true if expired, false if valid
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
 * @param {string} token - JWT token
 * @returns {boolean} - true if expiring soon, false otherwise
 */
export const isTokenExpiringSoon = (token) => {
  if (!token) return true;
  
  try {
    const decoded = jwtDecode(token);
    const currentTime = Math.floor(Date.now() / 1000);
    const fiveMinutesFromNow = currentTime + (5 * 60); // 5 minutes in seconds
    return decoded.exp < fiveMinutesFromNow;
  } catch (error) {
    console.error('Error decoding token:', error);
    return true;
  }
};

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<string|null>} - new access token or null if failed
 */
export const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  
  if (!refreshToken) {
    console.error('No refresh token available');
    return null;
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
      refresh: refreshToken
    });

    const { access } = response.data;
    
    // Update stored token
    localStorage.setItem('access_token', access);
    
    // Update axios default header
    axios.defaults.headers.common['Authorization'] = `Bearer ${access}`;
    
    console.log('Token refreshed successfully');
    return access;
  } catch (error) {
    console.error('Token refresh failed:', error);
    
    // If refresh fails, clear all tokens and redirect to login
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    
    return null;
  }
};

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string|null>} - valid access token or null if authentication failed
 */
export const getValidToken = async () => {
  let token = localStorage.getItem('access_token') || localStorage.getItem('token');
  
  if (!token) {
    console.error('No access token found');
    return null;
  }

  // If token is expired, try to refresh it
  if (isTokenExpired(token)) {
    console.log('Token expired, attempting to refresh...');
    token = await refreshAccessToken();
  }
  // If token is expiring soon, proactively refresh it
  else if (isTokenExpiringSoon(token)) {
    console.log('Token expiring soon, proactively refreshing...');
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
    }
    // If refresh fails, we still use the current token since it's not expired yet
  }

  return token;
};

/**
 * Clear all authentication data
 */
export const clearAuthData = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token');
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
