/**
 * WebSocket Connection Test
 * Run this in browser console to test WebSocket connections
 */

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

async function testWebSocketConnections() {
  console.log('🚀 Testing WebSocket connections...');
  
  // Get auth token using proper extraction
  const token = getAccessToken();
  if (!token) {
    console.log('❌ No auth token found. Please log in first.');
    return;
  }
  
  console.log('✅ Auth token found:', token.substring(0, 20) + '...');
  
  // Determine WebSocket URL based on environment
  const isProduction = window.location.hostname.includes('run.app');
  const baseWsUrl = isProduction 
    ? `wss://${window.location.host}` 
    : 'ws://localhost:8080';  // Updated to use port 8080
  
  console.log('🌍 Environment:', isProduction ? 'Production' : 'Development');
  console.log('🔗 Base WebSocket URL:', baseWsUrl);
  
  // Test 1: Presence WebSocket
  console.log('\n📋 Test 1: Presence WebSocket Connection');
  const presenceWsUrl = `${baseWsUrl}/ws/presence/?token=${token}`;
  console.log('🔌 Connecting to:', presenceWsUrl);
  
  const presenceWs = new WebSocket(presenceWsUrl);
  
  presenceWs.onopen = () => {
    console.log('✅ Presence WebSocket connected successfully');
    
    // Request online users list
    presenceWs.send(JSON.stringify({
      type: 'get_online_users'
    }));
  };
  
  presenceWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('📨 Presence message received:', data);
    
    if (data.type === 'online_users_list') {
      console.log(`👥 Online users count: ${data.users ? data.users.length : 0}`);
      if (data.users && data.users.length > 0) {
        data.users.forEach(user => {
          console.log(`  - ${user.username} (ID: ${user.id}) - ${user.is_online ? 'ONLINE' : 'OFFLINE'}`);
        });
      }
    }
  };
  
  presenceWs.onerror = (error) => {
    console.log('❌ Presence WebSocket error:', error);
  };
  
  presenceWs.onclose = (event) => {
    console.log(`🔌 Presence WebSocket closed: ${event.code} - ${event.reason}`);
  };
  
  // Test 2: Chat WebSocket (after a short delay)
  setTimeout(() => {
    console.log('\n📋 Test 2: Chat WebSocket Connection');
    const chatWsUrl = `${baseWsUrl}/ws/chat/?token=${token}`;
    console.log('🔌 Connecting to:', chatWsUrl);
    
    const chatWs = new WebSocket(chatWsUrl);
    
    chatWs.onopen = () => {
      console.log('✅ Chat WebSocket connected successfully');
    };
    
    chatWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 Chat message received:', data);
    };
    
    chatWs.onerror = (error) => {
      console.log('❌ Chat WebSocket error:', error);
    };
    
    chatWs.onclose = (event) => {
      console.log(`🔌 Chat WebSocket closed: ${event.code} - ${event.reason}`);
    };
    
    // Store references for manual testing
    window.testPresenceWs = presenceWs;
    window.testChatWs = chatWs;
    
  }, 2000);
  
  console.log('\n💡 WebSocket test started. References stored in:');
  console.log('   window.testPresenceWs - Presence WebSocket');
  console.log('   window.testChatWs - Chat WebSocket');
  console.log('   Use these to send test messages manually.');
}

// Auto-run the test
testWebSocketConnections();

// Make it available globally
window.testWebSocketConnections = testWebSocketConnections;

console.log('📋 WebSocket test loaded. Run testWebSocketConnections() to test again.');
