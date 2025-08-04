// WebSocket test for Cloud Run deployment
console.log('🧪 Testing WebSocket connection to Cloud Run...');

const token = localStorage.getItem('token') || localStorage.getItem('access_token');
console.log('🔑 Token found:', !!token);
console.log('🔍 Token preview:', token ? token.substring(0, 20) + '...' : 'None');

if (token) {
    // Update URL to use Cloud Run service URL
    const wsUrl = `wss://poehr-scheduling-mjf5efdj3a-uc.a.run.app/ws/presence/?token=${token}`;
    console.log('🌐 Attempting to connect to:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        console.log('✅ WebSocket connected successfully to Cloud Run!');
        console.log('📡 Connection state:', ws.readyState);

        // Test sending a message
        const testMessage = {
            type: 'get_online_users'
        };
        console.log('📤 Sending test message:', testMessage);
        ws.send(JSON.stringify(testMessage));
    };

    ws.onmessage = function (event) {
        console.log('📥 Received message:', event.data);
        try {
            const data = JSON.parse(event.data);
            console.log('📋 Parsed data:', data);
        } catch (e) {
            console.log('📄 Raw message (not JSON):', event.data);
        }
    };

    ws.onerror = function (error) {
        console.log('❌ WebSocket error:', error);
        console.log('🔍 Error details:', {
            readyState: ws.readyState,
            url: ws.url,
            protocol: ws.protocol
        });
    };

    ws.onclose = function (event) {
        console.log('🔌 WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });

        // Log common close codes
        const closeCodes = {
            1000: 'Normal closure',
            1001: 'Going away',
            1002: 'Protocol error',
            1003: 'Unsupported data type',
            1006: 'Abnormal closure',
            1011: 'Server error',
            1012: 'Service restart',
            1013: 'Try again later',
            1014: 'Bad gateway',
            1015: 'TLS handshake error'
        };

        console.log(`📖 Close code meaning: ${closeCodes[event.code] || 'Unknown'}`);
    };

    // Store WebSocket reference for manual testing
    window.testWS = ws;

    // Close after 10 seconds to allow for testing
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            console.log('⏰ Auto-closing WebSocket connection after 10 seconds');
            ws.close(1000, 'Test completed');
        }
        console.log('🔒 WebSocket connection test completed');
    }, 10000);
} else {
    console.log('❌ No authentication token found');
    console.log('💡 Please login first to get an authentication token');
}
