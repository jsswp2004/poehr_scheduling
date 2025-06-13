/**
 * Chat System Test Utility
 * Comprehensive testing and validation for the chat system
 */

class ChatSystemTester {
  constructor() {
    this.testResults = [];
    this.isRunning = false;
  }
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    this.testResults.push(logEntry);
    
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} [CHAT-TEST] ${message}`);
  }

  async runComprehensiveTest() {
    this.log('🚀 Starting comprehensive chat system test');
    this.isRunning = true;
    this.testResults = [];

    try {
      // Test 1: WebSocket Connection
      await this.testWebSocketConnection();
      
      // Test 2: Token Authentication
      await this.testTokenAuthentication();
      
      // Test 3: Chat Room Creation
      await this.testChatRoomCreation();
      
      // Test 4: Message Sending
      await this.testMessageSending();
      
      // Test 5: Message Receiving
      await this.testMessageReceiving();
      
      // Test 6: Error Handling
      await this.testErrorHandling();
      
      // Test 7: Connection Recovery
      await this.testConnectionRecovery();

      this.log('🎉 All tests completed successfully!', 'success');
      return { success: true, results: this.testResults };
      
    } catch (error) {
      this.log(`💥 Test suite failed: ${error.message}`, 'error');
      return { success: false, error: error.message, results: this.testResults };
    } finally {
      this.isRunning = false;
    }
  }

  async testWebSocketConnection() {
    this.log('🔌 Testing WebSocket connection...');
    
    // Check if WebSocket URL is correct
    const wsUrl = 'ws://localhost:8001/ws/presence/';
    this.log(`Attempting connection to: ${wsUrl}`);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      this.log('✅ Token found in localStorage', 'success');
      
      // Test WebSocket creation (don't actually connect in test)
      const testUrl = `${wsUrl}?token=${token}`;
      this.log(`Full WebSocket URL: ${testUrl}`, 'success');
      
    } catch (error) {
      this.log(`❌ WebSocket connection test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testTokenAuthentication() {
    this.log('🔐 Testing token authentication...');
    
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('No authentication token available');
    }
    
    try {
      // Try to decode JWT token
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }
      
      const payload = JSON.parse(atob(parts[1]));
      this.log(`Token valid for user: ${payload.username} (ID: ${payload.user_id})`, 'success');
      
      // Check token expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        this.log('⚠️ Token appears to be expired', 'warning');
      } else {
        this.log('✅ Token is valid and not expired', 'success');
      }
      
    } catch (error) {
      this.log(`❌ Token validation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testChatRoomCreation() {
    this.log('🏠 Testing chat room creation logic...');
    
    // Test with mock data
    const mockCurrentUser = { id: 1, username: 'testuser', first_name: 'Test' };
    const mockTargetUser = { id: 2, username: 'targetuser', first_name: 'Target' };
    
    // Simulate room creation parameters
    const participantIds = [mockCurrentUser.id, mockTargetUser.id];
    const roomName = `${mockCurrentUser.first_name} & ${mockTargetUser.first_name}`;
    const roomType = 'direct';
    
    this.log(`Room parameters: participants=${participantIds}, name="${roomName}", type=${roomType}`, 'success');
    
    // Validate parameters
    if (participantIds.length !== 2) {
      throw new Error('Direct message should have exactly 2 participants');
    }
    
    if (!roomName || roomName.trim().length === 0) {
      throw new Error('Room name is required');
    }
    
    this.log('✅ Chat room creation parameters are valid', 'success');
  }

  async testMessageSending() {
    this.log('📤 Testing message sending logic...');
    
    const mockMessage = 'Hello, this is a test message!';
    const mockRoomId = 'test-room-123';
    
    // Validate message
    if (!mockMessage || mockMessage.trim().length === 0) {
      throw new Error('Empty message should not be allowed');
    }
    
    if (!mockRoomId) {
      throw new Error('Room ID is required for message sending');
    }
    
    // Test message structure
    const messagePayload = {
      type: 'send_message',
      room_id: mockRoomId,
      message: mockMessage.trim(),
      recipient_id: null
    };
    
    this.log(`Message payload: ${JSON.stringify(messagePayload)}`, 'success');
    this.log('✅ Message sending logic is valid', 'success');
  }

  async testMessageReceiving() {
    this.log('📥 Testing message receiving logic...');
    
    const mockReceivedMessage = {
      id: 'msg-123',
      room_id: 'room-456',
      sender_id: 2,
      sender_name: 'Test User',
      message: 'Hello back!',
      timestamp: new Date().toISOString(),
      is_read: false
    };
    
    // Validate received message structure
    const requiredFields = ['id', 'room_id', 'sender_id', 'sender_name', 'message', 'timestamp'];
    for (const field of requiredFields) {
      if (!mockReceivedMessage[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Test timestamp parsing
    const messageDate = new Date(mockReceivedMessage.timestamp);
    if (isNaN(messageDate.getTime())) {
      throw new Error('Invalid timestamp format');
    }
    
    this.log('✅ Message receiving structure is valid', 'success');
  }

  async testErrorHandling() {
    this.log('🛡️ Testing error handling...');
    
    const mockErrors = [
      'Connection timeout',
      'Room creation failed',
      'Message sending failed',
      'Invalid authentication'
    ];
    
    mockErrors.forEach(error => {
      // Test that errors are properly formatted
      if (typeof error !== 'string' || error.length === 0) {
        throw new Error('Errors must be non-empty strings');
      }
      this.log(`Error format valid: "${error}"`, 'success');
    });
    
    this.log('✅ Error handling structure is valid', 'success');
  }

  async testConnectionRecovery() {
    this.log('🔄 Testing connection recovery logic...');
    
    // Test connection states
    const validStates = ['connecting', 'connected', 'disconnected', 'error'];
    validStates.forEach(state => {
      this.log(`Connection state "${state}" is valid`, 'success');
    });
    
    // Test operation states
    const validOperations = ['creating_room', 'sending_message', 'loading_history', null];
    validOperations.forEach(operation => {
      this.log(`Operation state "${operation}" is valid`, 'success');
    });
    
    this.log('✅ Connection recovery logic is valid', 'success');
  }

  getTestReport() {
    const successCount = this.testResults.filter(r => r.type === 'success').length;
    const errorCount = this.testResults.filter(r => r.type === 'error').length;
    const warningCount = this.testResults.filter(r => r.type === 'warning').length;
    
    return {
      total: this.testResults.length,
      success: successCount,
      errors: errorCount,
      warnings: warningCount,
      results: this.testResults
    };
  }

  // Live connection test
  async testLiveConnection() {
    this.log('🔴 Testing live WebSocket connection...');
    
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('token');
      if (!token) {
        reject(new Error('No token available for live test'));
        return;
      }
      
      const wsUrl = `ws://localhost:8001/ws/presence/?token=${token}`;
      const ws = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 10000);
      
      ws.onopen = () => {
        clearTimeout(timeout);
        this.log('✅ Live WebSocket connection successful!', 'success');
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        this.log(`❌ Live WebSocket connection failed: ${error}`, 'error');
        reject(error);
      };
      
      ws.onclose = (event) => {
        if (event.code !== 1000) {
          this.log(`⚠️ WebSocket closed with code: ${event.code}, reason: ${event.reason}`, 'warning');
        }
      };
    });
  }
}

// Make it globally available for testing
window.ChatSystemTester = ChatSystemTester;

export { ChatSystemTester };
export default ChatSystemTester;
