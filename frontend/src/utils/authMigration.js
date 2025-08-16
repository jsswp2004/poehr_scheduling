/**
 * Authentication Migration Utility
 * 
 * This utility fixes token storage inconsistencies between different
 * parts of the application and ensures all components use the same
 * centralized token management system.
 */

import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './tokenManager';
import { STORAGE_KEYS } from '../config/constants';

/**
 * Migrate from old token storage format to new centralized format
 */
export const migrateTokenStorage = () => {
  console.group('🔄 Auth Migration: Fixing token storage inconsistencies');
  
  try {
    // Check if we already have tokens in the new format
    const newFormatAccess = getAccessToken();
    const newFormatRefresh = getRefreshToken();
    
    // Check for tokens in old format
    const oldFormatAccess = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const oldFormatRefresh = localStorage.getItem('refresh_token');
    
    console.log('📊 Current token state:');
    console.log('  New format access token:', !!newFormatAccess);
    console.log('  New format refresh token:', !!newFormatRefresh);
    console.log('  Old format access token:', !!oldFormatAccess);
    console.log('  Old format refresh token:', !!oldFormatRefresh);
    
    // Decide which tokens to use
    let bestAccessToken = newFormatAccess || oldFormatAccess;
    let bestRefreshToken = newFormatRefresh || oldFormatRefresh;
    
    if (!bestAccessToken) {
      console.log('ℹ️ No tokens found, migration not needed');
      console.groupEnd();
      return;
    }
    
    // Clear all token storage to start fresh
    console.log('🧹 Clearing all token storage...');
    clearTokens();
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem('refresh_token');
    
    // Store tokens using the new centralized system
    console.log('💾 Storing tokens in new format...');
    storeTokens(bestAccessToken, bestRefreshToken);
    
    console.log('✅ Token migration completed successfully');
    
  } catch (error) {
    console.error('❌ Token migration failed:', error);
    // If migration fails, clear everything to prevent further issues
    clearTokens();
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem('refresh_token');
  }
  
  console.groupEnd();
};

/**
 * Auto-run migration when imported
 * This ensures tokens are migrated as soon as the app starts
 */
export const autoMigrateTokens = () => {
  // Only run migration if there might be inconsistencies
  const hasOldFormat = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const hasNewFormat = getAccessToken();
  
  // Run migration if:
  // 1. We have old format tokens but no new format tokens
  // 2. We have both formats (inconsistency)
  if (hasOldFormat && (!hasNewFormat || hasOldFormat !== hasNewFormat)) {
    console.log('🔧 Detected token storage inconsistency, running auto-migration...');
    migrateTokenStorage();
  }
};

/**
 * Clear all authentication data (for debugging)
 */
export const clearAllAuthData = () => {
  console.log('🧹 Clearing all authentication data...');
  
  // Clear new format tokens
  clearTokens();
  
  // Clear old format tokens
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem('refresh_token');
  
  // Clear any other auth-related data
  localStorage.removeItem('user_data');
  sessionStorage.clear();
  
  console.log('✅ All authentication data cleared');
};

/**
 * Debug function to show current token state
 */
export const debugAuthState = () => {
  console.group('🔍 Authentication Debug State');
  
  const newFormatAccess = getAccessToken();
  const newFormatRefresh = getRefreshToken();
  const oldFormatAccess = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const oldFormatRefresh = localStorage.getItem('refresh_token');
  
  console.log('New Format Tokens:');
  console.log('  Access token:', newFormatAccess ? `${newFormatAccess.slice(0, 20)}...` : 'null');
  console.log('  Refresh token:', newFormatRefresh ? `${newFormatRefresh.slice(0, 20)}...` : 'null');
  
  console.log('Old Format Tokens:');
  console.log('  Access token:', oldFormatAccess ? `${oldFormatAccess.slice(0, 20)}...` : 'null');
  console.log('  Refresh token:', oldFormatRefresh ? `${oldFormatRefresh.slice(0, 20)}...` : 'null');
  
  // Check for any inconsistencies
  if (oldFormatAccess && newFormatAccess && oldFormatAccess !== newFormatAccess) {
    console.warn('⚠️ TOKEN INCONSISTENCY DETECTED!');
    console.log('Old format access token differs from new format');
  }
  
  console.groupEnd();
};

// Make functions available globally for debugging
if (process.env.NODE_ENV === 'development') {
  window.debugAuthState = debugAuthState;
  window.clearAllAuthData = clearAllAuthData;
  window.migrateTokenStorage = migrateTokenStorage;
}
