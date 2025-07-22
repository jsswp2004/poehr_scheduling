/**
 * Chat utility functions
 */

// Helper function for chat initialization with retry logic
export const initializeChatWithRetry = async (chat, connectToOnlineStatus, websocketConnection, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Initialize chat socket connection
            if (chat && chat.initialize) {
                await chat.initialize();
            }

            // Initialize online status connection
            if (connectToOnlineStatus) {
                await connectToOnlineStatus();
            }

            // Initialize websocket connection
            if (websocketConnection && websocketConnection.connect) {
                await websocketConnection.connect();
            }

            return true;
        } catch (error) {
            console.error(`❌ Chat initialization attempt ${attempt} failed:`, error);

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
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
export const createRoomKey = (user1, user2) => {
    if (!user1 || !user2) {
        console.warn('⚠️ Invalid user(s) for room key:', user1, user2);
        return '';
    }

    // Extract user IDs - handle both objects and direct IDs
    const id1 = typeof user1 === 'object' ? (user1.user_id || user1.id) : user1;
    const id2 = typeof user2 === 'object' ? (user2.user_id || user2.id) : user2;

    if (!id1 || !id2) {
        console.warn('⚠️ Could not extract user IDs:', { user1, user2, id1, id2 });
        return '';
    }

    // Sort by numeric value to ensure consistent room keys
    const users = [id1, id2].sort((a, b) => Number(a) - Number(b));
    const roomKey = `room_${users[0]}_${users[1]}`;

    return roomKey;
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
