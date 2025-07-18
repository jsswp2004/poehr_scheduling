/**
 * Browser Console Script: Fix Token Storage Issues
 * 
 * Paste this into your browser console to fix authentication token issues.
 * This will standardize your token storage and should resolve any
 * "user appears offline" or authentication problems.
 */

(function() {
  console.group('🔧 Token Storage Fix Script');
  
  // 1. Show current token state
  console.log('📊 Current localStorage state:');
  const allKeys = Object.keys(localStorage);
  const tokenKeys = allKeys.filter(key => 
    key.includes('token') || key.includes('auth') || key.includes('jwt')
  );
  
  if (tokenKeys.length === 0) {
    console.log('❌ No tokens found in localStorage');
    console.groupEnd();
    return;
  }
  
  tokenKeys.forEach(key => {
    const value = localStorage.getItem(key);
    console.log(`🔑 ${key}: ${value ? value.substring(0, 50) + '...' : 'null'}`);
  });
  
  // 2. Find the best tokens
  let bestAccessToken = null;
  let bestRefreshToken = null;
  
  // Look for access tokens
  const accessCandidates = ['access_token', 'authToken', 'token', 'jwt_token'];
  for (const key of accessCandidates) {
    const token = localStorage.getItem(key);
    if (token && !bestAccessToken) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.token_type === 'access' || !payload.token_type) {
            bestAccessToken = token;
            console.log(`✅ Found access token: ${key}`);
            break;
          }
        }
      } catch (e) {
        console.warn(`⚠️ Could not decode ${key}`);
      }
    }
  }
  
  // Look for refresh tokens
  const refreshCandidates = ['refresh_token'];
  for (const key of refreshCandidates) {
    const token = localStorage.getItem(key);
    if (token && !bestRefreshToken) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.token_type === 'refresh') {
            bestRefreshToken = token;
            console.log(`✅ Found refresh token: ${key}`);
            break;
          }
        }
      } catch (e) {
        console.warn(`⚠️ Could not decode ${key}`);
      }
    }
  }
  
  if (!bestAccessToken) {
    console.error('❌ No valid access token found');
    console.log('💡 Try logging in again to get fresh tokens');
    console.groupEnd();
    return;
  }
  
  // 3. Clean up all tokens
  console.log('🧹 Cleaning up all token storage...');
  tokenKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️ Removed: ${key}`);
  });
  
  // 4. Set standardized tokens
  console.log('💾 Setting standardized tokens...');
  localStorage.setItem('access_token', bestAccessToken);
  if (bestRefreshToken) {
    localStorage.setItem('refresh_token', bestRefreshToken);
  }
  
  // 5. Decode and show user info
  try {
    const payload = JSON.parse(atob(bestAccessToken.split('.')[1]));
    console.log('👤 Your user info:');
    console.log(`   ID: ${payload.user_id}`);
    console.log(`   Username: ${payload.username}`);
    console.log(`   Name: ${payload.first_name} ${payload.last_name}`);
    console.log(`   Role: ${payload.role}`);
    console.log(`   Expires: ${new Date(payload.exp * 1000).toLocaleString()}`);
  } catch (e) {
    console.warn('⚠️ Could not decode user info from token');
  }
  
  // 6. Instructions
  console.log('✅ Token storage fixed!');
  console.log('🔄 Please reload the page for changes to take effect:');
  console.log('   window.location.reload();');
  
  console.groupEnd();
  
  // Auto-reload option
  if (confirm('Token storage has been fixed. Reload the page now?')) {
    window.location.reload();
  }
})();

// Also export functions for manual use
window.fixTokenStorage = function() {
  window.location.reload();
};

window.debugTokens = function() {
  console.group('🔍 Token Debug');
  Object.keys(localStorage).forEach(key => {
    if (key.includes('token') || key.includes('auth')) {
      console.log(`${key}:`, localStorage.getItem(key));
    }
  });
  console.groupEnd();
};

console.log('💡 Available commands:');
console.log('   fixTokenStorage() - Fix and reload');
console.log('   debugTokens() - Show all tokens');
