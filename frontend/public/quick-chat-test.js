/**
 * Quick Chat System Test - Run this in browser console
 * Tests the key functionality of our chat system
 */

async function quickChatTest() {
  console.log('🚀 Starting Quick Chat System Test');
  
  // Test 1: Check if useChat hook is working
  console.log('📋 Test 1: Checking React components...');
  
  // Test 2: Check WebSocket connection capability
  console.log('📋 Test 2: Testing WebSocket connection...');
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('❌ No auth token found - user needs to be logged in');
      return;
    }
    
    const wsUrl = `ws://localhost:8000/ws/chat/?token=${token}`;
    console.log(`🔌 Attempting WebSocket connection to: ${wsUrl}`);
    
    const testWs = new WebSocket(wsUrl);
    
    testWs.onopen = () => {
      console.log('✅ WebSocket connection successful');
      testWs.close();
    };
    
    testWs.onerror = (error) => {
      console.log('❌ WebSocket connection failed:', error);
    };
    
    testWs.onclose = (event) => {
      console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
    };
    
  } catch (error) {
    console.log('❌ WebSocket test error:', error);
  }
  
  // Test 3: Check if DOM elements exist
  console.log('📋 Test 3: Checking DOM elements...');
  
  const teamTab = document.querySelector('[data-testid="team-tab"], .team-tab, [role="tab"]:has-text("Team")');
  if (teamTab) {
    console.log('✅ Team tab found in DOM');
  } else {
    console.log('⚠️ Team tab not found - might not be on patients page');
  }
  
  // Test 4: Check for chat-related elements
  const chatElements = document.querySelectorAll('[class*="chat"], [id*="chat"]');
  console.log(`📋 Found ${chatElements.length} chat-related DOM elements`);
  
  // Test 5: Check localStorage for any existing data
  console.log('📋 Test 5: Checking localStorage...');
  const authToken = localStorage.getItem('token');
  const userInfo = localStorage.getItem('user') || localStorage.getItem('userInfo');
  
  console.log('💾 Auth token exists:', !!authToken);
  console.log('💾 User info exists:', !!userInfo);
  
  if (userInfo) {
    try {
      const user = JSON.parse(userInfo);
      console.log('👤 Current user:', user?.username || user?.email || 'Unknown');
    } catch (e) {
      console.log('⚠️ Could not parse user info');
    }
  }
  
  // Test 6: Test API endpoint accessibility
  console.log('📋 Test 6: Testing API endpoint...');
  try {
    const response = await fetch('/api/chat/test/', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      console.log('✅ API endpoint accessible');
    } else {
      console.log(`⚠️ API endpoint returned: ${response.status}`);
    }
  } catch (error) {
    console.log('❌ API endpoint test failed:', error.message);
  }
  
  console.log('🎉 Quick test completed! Check results above.');
  console.log('💡 To test full functionality:');
  console.log('   1. Navigate to /patients page');
  console.log('   2. Click on Team tab');  
  console.log('   3. Try opening chat with another user');
  console.log('   4. Check browser console for detailed logs');
}

// Auto-run the test
quickChatTest();

// Also make it available globally
window.quickChatTest = quickChatTest;

console.log('📋 Quick Chat Test loaded. Run quickChatTest() to test again.');
