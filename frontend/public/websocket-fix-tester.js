/**
 * WebSocket Connection Fix Tester
 * 
 * This script tests both the old (broken) and new (fixed) methods
 * to demonstrate the token format issue and verify the fix.
 * 
 * Run this in your browser console while logged into the application.
 */

console.log('🔧 WebSocket Token Format Fix Tester');
console.log('=====================================');

// Test 1: Show the token format issue
console.log('\n1️⃣ Token Format Comparison:');

const rawAccessToken = localStorage.getItem('access_token');
const rawLegacyToken = localStorage.getItem('token');

console.log('📋 Raw access_token from localStorage:', rawAccessToken);
console.log('📋 Raw legacy token from localStorage:', rawLegacyToken);

// Helper function to get token properly (same as our fix)
function getAccessToken() {
    const accessTokenData = localStorage.getItem('access_token');
    if (accessTokenData) {
        try {
            const parsed = JSON.parse(accessTokenData);
            return parsed.token || accessTokenData;
        } catch {
            return accessTokenData;
        }
    }

    const tokenData = localStorage.getItem('token');
    if (tokenData) {
        try {
            const parsed = JSON.parse(tokenData);
            return parsed.token || tokenData;
        } catch {
            return tokenData;
        }
    }

    return null;
}

const extractedToken = getAccessToken();

console.log('\n2️⃣ Token Extraction Results:');
console.log('✅ Properly extracted JWT token:', extractedToken ? extractedToken.substring(0, 50) + '...' : 'None');

// Test 2: Compare WebSocket URLs
console.log('\n3️⃣ WebSocket URL Comparison:');

const isProduction = window.location.hostname.includes('azurewebsites.net') ||
    window.location.hostname.includes('azurecontainerapps.io') ||
    window.location.hostname.includes('run.app');

const baseWsUrl = isProduction
    ? `wss://${window.location.host}`
    : 'ws://localhost:8080';

if (rawAccessToken && extractedToken) {
    const brokenUrl = `${baseWsUrl}/ws/presence/?token=${rawAccessToken}`;
    const fixedUrl = `${baseWsUrl}/ws/presence/?token=${extractedToken}`;

    console.log('❌ BROKEN URL (old method):', brokenUrl.substring(0, 100) + '...');
    console.log('✅ FIXED URL (new method):', fixedUrl.substring(0, 100) + '...');

    // Test 3: Actually try connecting
    console.log('\n4️⃣ Connection Tests:');

    // Test broken connection first
    console.log('🔴 Testing BROKEN connection...');
    const brokenWs = new WebSocket(brokenUrl);

    brokenWs.onopen = () => {
        console.log('😱 UNEXPECTED: Broken connection opened (this should fail!)');
        brokenWs.close();
    };

    brokenWs.onerror = (error) => {
        console.log('✅ EXPECTED: Broken connection failed as expected');
    };

    brokenWs.onclose = (event) => {
        console.log(`🔴 Broken connection closed: ${event.code} - ${event.reason}`);

        // Now test the fixed connection
        setTimeout(() => {
            console.log('\n🟢 Testing FIXED connection...');
            const fixedWs = new WebSocket(fixedUrl);

            fixedWs.onopen = () => {
                console.log('🎉 SUCCESS: Fixed connection opened successfully!');
                console.log('💚 WebSocket authentication is now working properly');

                // Test sending a message
                fixedWs.send(JSON.stringify({
                    type: 'get_online_users'
                }));

                // Close after 5 seconds
                setTimeout(() => {
                    fixedWs.close(1000, 'Test completed successfully');
                }, 5000);
            };

            fixedWs.onmessage = (event) => {
                console.log('📨 Received message:', event.data);
            };

            fixedWs.onerror = (error) => {
                console.log('❌ Fixed connection error (unexpected):', error);
            };

            fixedWs.onclose = (event) => {
                console.log(`🟢 Fixed connection closed: ${event.code} - ${event.reason}`);
            };

        }, 2000);
    };

} else {
    console.log('❌ Cannot test - no tokens found. Please log in first.');
}

console.log('\n💡 Summary:');
console.log('- The issue was token format mismatch');
console.log('- Tokens are stored as JSON: {"token":"JWT_HERE"}');
console.log('- WebSocket needs just the JWT string, not the JSON object');
console.log('- Fixed by extracting the JWT from the JSON before using in WebSocket URL');
