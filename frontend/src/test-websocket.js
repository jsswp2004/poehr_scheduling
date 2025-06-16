// Simple test to check WebSocket connection in browser console
console.log('Testing WebSocket connection...');

const token = localStorage.getItem('token') || localStorage.getItem('access_token');
console.log('Token found:', !!token);
console.log('Token preview:', token ? token.substring(0, 50) + '...' : 'None');

if (token) {
    const wsUrl = `ws://localhost:9001/ws/presence/?token=${token}`;
    console.log('Attempting to connect to:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('✅ WebSocket connected successfully!');
        
        // Test sending a message
        ws.send(JSON.stringify({
            type: 'get_online_users'
        }));
    };
    
    ws.onmessage = function(event) {
        console.log('📥 Received message:', event.data);
    };
    
    ws.onerror = function(error) {
        console.log('❌ WebSocket error:', error);
    };
    
    ws.onclose = function(event) {
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
