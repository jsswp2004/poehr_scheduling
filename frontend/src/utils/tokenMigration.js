/**
 * Migration Script: Fix Token Storage Inconsistencies
 * 
 * This script should be run once to migrate existing users from
 * inconsistent token storage to the new centralized system.
 */

import { storeTokens, clearTokens, debugTokenState } from './tokenManager';

/**
 * Migrate tokens from old storage format to new centralized format
 */
export const migrateTokenStorage = () => {
  console.group('🔄 Migrating Token Storage');
  
  // Show current state
  console.log('📊 Current token state:');
  debugTokenState();
  
  // Look for tokens in various legacy locations
  const possibleTokenKeys = [
    'access_token',
    'refresh_token', 
    'token',
    'authToken',
    'jwt_token',
    'auth_token'
  ];
  
  let foundAccessToken = null;
  let foundRefreshToken = null;
  
  // Find the best tokens available
  for (const key of possibleTokenKeys) {
    const value = localStorage.getItem(key);
    if (value) {
      console.log(`🔍 Found token at key: ${key}`);
      
      // Determine if this is an access or refresh token
      try {
        // Simple heuristic: decode and check token_type
        const parts = value.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          
          if (payload.token_type === 'access' || key.includes('access') || key === 'token' || key === 'authToken') {
            if (!foundAccessToken) {
              foundAccessToken = value;
              console.log(`✅ Using as access token: ${key}`);
            }
          } else if (payload.token_type === 'refresh' || key.includes('refresh')) {
            if (!foundRefreshToken) {
              foundRefreshToken = value;
              console.log(`✅ Using as refresh token: ${key}`);
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ Could not decode token from ${key}:`, e.message);
      }
    }
  }
  
  // If we found valid tokens, migrate them
  if (foundAccessToken || foundRefreshToken) {
    console.log('🔄 Migrating tokens to centralized storage...');
    
    // Clear all existing tokens first
    clearTokens();
    
    // Store using the new system
    storeTokens(foundAccessToken, foundRefreshToken);
    
    console.log('✅ Migration completed successfully!');
    
    // Show new state
    console.log('📊 New token state:');
    debugTokenState();
  } else {
    console.log('ℹ️ No tokens found to migrate');
  }
  
  console.groupEnd();
};

/**
 * Auto-run migration on import if tokens need migrating
 */
export const autoMigrate = () => {
  // Check if we have the standard tokens
  const hasStandardTokens = localStorage.getItem('access_token') && 
                           !localStorage.getItem('token') && 
                           !localStorage.getItem('authToken');
  
  if (!hasStandardTokens) {
    // Check if we have any legacy tokens
    const legacyKeys = ['token', 'authToken', 'jwt_token', 'auth_token'];
    const hasLegacyTokens = legacyKeys.some(key => localStorage.getItem(key));
    
    if (hasLegacyTokens) {
      console.log('🔧 Detected legacy tokens, running auto-migration...');
      migrateTokenStorage();
    }
  }
};

/**
 * Force clean all token storage (for debugging)
 */
export const forceCleanTokens = () => {
  console.log('🧹 Force cleaning all token storage...');
  
  const allKeys = [
    'access_token', 'refresh_token', 'token', 'authToken', 
    'jwt_token', 'auth_token', 'userToken', 'bearer_token'
  ];
  
  allKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed: ${key}`);
    }
  });
  
  console.log('✅ All tokens cleared');
};
