/**
 * Simple WebSocket Connection Test - Console Version
 * Paste this into your browser console on the app page
 */

console.log('🧪 Starting WebSocket Connection Test...');

// Helper function to get token properly (handles both JSON and plain string formats)
function getAccessToken() {
    // Try the centralized token manager key first
    const accessTokenData = localStorage.getItem('access_token');
    if (accessTokenData) {
        try {
            const parsed = JSON.parse(accessTokenData);
            return parsed.token || accessTokenData;
        } catch {
            return accessTokenData;
        }
    }

    // Fallback to legacy token key
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

// Get token using proper extraction
const token = getAccessToken();
if (!token) {
    console.error('❌ No authentication token found. Please log in first.');
} else {
    console.log('✅ Token found:', token.substring(0, 30) + '...');

    // Test different WebSocket URL formats
    const testUrls = [
        `wss://${window.location.host}/ws/presence/?token=${token}`,
        `wss://${window.location.host}/ws/presence?token=${token}`,
        `ws://${window.location.host}/ws/presence/?token=${token}`,
        `ws://${window.location.host}/ws/presence?token=${token}`
    ];

    console.log('🔍 Testing multiple WebSocket URL formats...');

    testUrls.forEach((url, index) => {
        console.log(`\n📋 Test ${index + 1}: ${url}`);

        const ws = new WebSocket(url);

        const timeout = setTimeout(() => {
            console.log(`⏱️ Test ${index + 1}: Connection timeout (10s)`);
            ws.close();
        }, 10000);

        ws.onopen = () => {
            clearTimeout(timeout);
            console.log(`✅ Test ${index + 1}: Connected successfully!`);
            ws.send(JSON.stringify({ type: 'heartbeat' }));
            window[`testWs${index + 1}`] = ws;
        };

        ws.onmessage = (event) => {
            console.log(`📨 Test ${index + 1}: Received:`, event.data);
        };

        ws.onerror = (error) => {
            clearTimeout(timeout);
            console.log(`❌ Test ${index + 1}: Error:`, error);
        };

        ws.onclose = (event) => {
            clearTimeout(timeout);
            console.log(`🔌 Test ${index + 1}: Closed: Code ${event.code}, Reason: ${event.reason}`);
        };
    });

    console.log('💡 Successful connections will be stored as window.testWs1, testWs2, etc.');
}
