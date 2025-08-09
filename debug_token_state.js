/**
 * Debug script to check token state
 * Run this in the browser console on the PatientDetailPage
 */
console.log('🔍 Token Debug Information');
console.log('========================');

// Check localStorage directly
console.log('📦 localStorage contents:');
Object.keys(localStorage).forEach(key => {
  if (key.includes('token') || key.includes('auth')) {
    const value = localStorage.getItem(key);
    console.log(`  ${key}:`, value ? value.substring(0, 50) + '...' : 'null');
  }
});

// Check specific token keys
console.log('\n🔑 Specific token checks:');
const accessToken = localStorage.getItem('access_token');
console.log('access_token (raw):', accessToken ? accessToken.substring(0, 50) + '...' : 'null');

// Try parsing if it's JSON
if (accessToken) {
  try {
    const parsed = JSON.parse(accessToken);
    console.log('access_token (parsed):', parsed);
    console.log('actual token:', parsed.token ? parsed.token.substring(0, 50) + '...' : 'null');
  } catch (e) {
    console.log('access_token is not JSON, using as direct string');
  }
}

// Test the tokenManager functions
console.log('\n🛠️ TokenManager test:');
try {
  // We need to import these, but for debugging we'll simulate
  const getAccessTokenTest = () => {
    const stored = localStorage.getItem('access_token');
    if (!stored) return null;
    
    try {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    } catch {
      return stored;
    }
  };
  
  const token = getAccessTokenTest();
  console.log('getAccessToken() result:', token ? token.substring(0, 50) + '...' : 'null');
  
  // Test token validity
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        console.log('Token payload:', payload);
        console.log('Token expires at:', new Date(payload.exp * 1000));
        console.log('Current time:', new Date());
        console.log('Is expired?', payload.exp < Date.now() / 1000);
      }
    } catch (e) {
      console.log('Error decoding token:', e);
    }
  }
} catch (e) {
  console.log('Error testing token:', e);
}

console.log('\n✅ Debug complete');
