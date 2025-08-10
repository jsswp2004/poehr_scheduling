/**
 * Enhanced debug script to check token state and test the API
 * Run this in the browser console on the PatientDetailPage
 */
console.log('🔍 Enhanced Token Debug Information');
console.log('=======================================');

// Check localStorage directly
console.log('📦 localStorage contents:');
Object.keys(localStorage).forEach(key => {
    if (key.includes('token') || key.includes('auth')) {
        const value = localStorage.getItem(key);
        console.log(`  ${key}:`, value ? value.substring(0, 50) + '...' : 'null');
    }
});

// Check specific token keys
console.log('\n🔑 Token extraction test:');
const accessToken = localStorage.getItem('access_token');
console.log('Raw access_token:', accessToken ? accessToken.substring(0, 50) + '...' : 'null');

// Try the tokenManager extraction
let extractedToken = null;
if (accessToken) {
    try {
        const parsed = JSON.parse(accessToken);
        extractedToken = parsed.token || null;
        console.log('Extracted token:', extractedToken ? extractedToken.substring(0, 50) + '...' : 'null');
    } catch (e) {
        extractedToken = accessToken; // Direct string
        console.log('Using direct string format');
    }
}

// Test token validity
if (extractedToken) {
    try {
        const parts = extractedToken.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            console.log('\n🎫 Token Details:');
            console.log('  User ID:', payload.user_id);
            console.log('  Username:', payload.username);
            console.log('  Role:', payload.role);
            console.log('  Issued at:', new Date(payload.iat * 1000));
            console.log('  Expires at:', new Date(payload.exp * 1000));
            console.log('  Current time:', new Date());

            const isExpired = payload.exp < Date.now() / 1000;
            const timeLeft = payload.exp - (Date.now() / 1000);
            console.log('  Is expired?', isExpired);
            console.log('  Time left:', Math.floor(timeLeft / 60), 'minutes');
        }
    } catch (e) {
        console.log('❌ Error decoding token:', e);
    }
}

// Test the API call manually
console.log('\n🧪 Manual API Test:');
if (extractedToken) {
    console.log('Testing API call with extracted token...');
    fetch('https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/users/organizations/', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${extractedToken}`,
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            console.log('📊 Manual API Response:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', response.headers);
            return response.json().catch(() => response.text());
        })
        .then(data => {
            console.log('  Response Data:', data);
        })
        .catch(error => {
            console.log('  Error:', error);
        });
} else {
    console.log('❌ No token available for manual test');
}

console.log('\n✅ Enhanced debug complete');