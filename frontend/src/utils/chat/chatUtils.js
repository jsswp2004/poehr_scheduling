/**
 * Chat utility functions
 */

// Helper function for chat initialization with retry logic
export const initializeChatWithRetry = async (chat, connectToOnlineStatus, websocketConnection, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Chat initialization attempt ${attempt}/${maxRetries}`);
      
      // Initialize chat socket connection
      if (chat && chat.initialize) {
        console.log('🔌 Connecting chat socket...');
        await chat.initialize();
      }
      
      // Initialize online status connection
      if (connectToOnlineStatus) {
        console.log('🟢 Connecting online status...');
        await connectToOnlineStatus();
      }
      
      // Initialize websocket connection
      if (websocketConnection && websocketConnection.connect) {
        console.log('🔗 Connecting websocket...');
        await websocketConnection.connect();
      }
      
      console.log('✅ Chat system initialization completed successfully');
      return true;
    } catch (error) {
      console.error(`❌ Chat initialization attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ All chat initialization attempts failed');
        return false;
      }
    }
  }
  return false;
};

// Create room key for consistent room identification
export const createRoomKey = (currentUserId, targetUserId) => {
  const users = [currentUserId, targetUserId].sort((a, b) => a - b);
  return `room_${users[0]}_${users[1]}`;
};

// Format timestamp for display
export const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

// Sort messages by timestamp
export const sortMessagesByTimestamp = (messages) => {
  return [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

// Get latest message from room
export const getLatestMessage = (messages) => {
  if (!messages || messages.length === 0) return null;
  return messages.reduce((latest, current) => {
    return new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest;
  });
};
