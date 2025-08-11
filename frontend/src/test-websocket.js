// Simple test to check WebSocket connection in browser console
console.log('Testing WebSocket connection...');

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

const token = getAccessToken();
console.log('Token found:', !!token);
console.log('Token preview:', token ? token.substring(0, 50) + '...' : 'None');

if (token) {
    // Determine WebSocket URL based on environment  
    const isProduction = window.location.hostname.includes('run.app');
    const baseWsUrl = isProduction
        ? `wss://${window.location.host}`
        : 'ws://localhost:8080';  // Updated to unified port 8080

    const wsUrl = `${baseWsUrl}/ws/presence/?token=${token}`;
    console.log('Environment:', isProduction ? 'Production' : 'Development');
    console.log('Attempting to connect to:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        console.log('✅ WebSocket connected successfully!');

        // Test sending a message
        ws.send(JSON.stringify({
            type: 'get_online_users'
        }));
    };

    ws.onmessage = function (event) {
        console.log('📥 Received message:', event.data);
    };

    ws.onerror = function (error) {
        console.log('❌ WebSocket error:', error);
    };

    ws.onclose = function (event) {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
    };

    // Close after 5 seconds
    setTimeout(() => {
        ws.close();
        console.log('🔒 WebSocket connection test completed');
    }, 5000);
} else {
    console.log('❌ No authentication token found');
}
