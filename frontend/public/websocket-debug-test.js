/**
 * Simple WebSocket Connection Test - Console Version
 * Paste this into your browser console on the app page
 */

console.log('🧪 Starting WebSocket Connection Test...');

// Get token
const token = localStorage.getItem('token') || localStorage.getItem('access_token');
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
