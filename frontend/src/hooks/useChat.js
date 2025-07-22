/**
 * Refactored useChat hook - Main chat functionality
 * 
 * This is a much more maintainable version of the original 691-line useChat.js
 * - Business logic separated into focused hooks
 * - Utilities extracted for reusability
 * - Better organization and maintainability
 */
import { useState, useEffect, useCallback } from 'react';
import { useChatData } from './chat/useChatData';
import { useChatTyping } from './chat/useChatTyping';
import { useChatNotifications } from './chat/useChatNotifications';
import { initializeChatWithRetry } from '../utils/chat/chatUtils';
import { generateUniqueMessageId } from '../utils/chat/idUtils';

export const useChat = (currentUser, websocketConnection, sendMessage, lastMessageFromOnlineStatus) => {
  // Initialization state
  const [chatSystemLoading, setChatSystemLoading] = useState(true);
  const [operationStatus, setOperationStatus] = useState(null);

  // Use modular hooks
  const chatData = useChatData(currentUser);
  const chatTyping = useChatTyping();
  const chatNotifications = useChatNotifications(currentUser);

  // Initialize chat system
  const initializeChatSystem = useCallback(async () => {
    setChatSystemLoading(true);
    try {
      const success = await initializeChatWithRetry(
        null, // chat object would be passed here
        null, // connectToOnlineStatus function
        websocketConnection
      );

      if (success) {
        console.log('✅ Chat system initialized successfully');
      } else {
        console.error('❌ Chat system initialization failed');
        chatData.setLastError('Failed to initialize chat system');
      }
    } catch (error) {
      console.error('❌ Chat system initialization error:', error);
      chatData.setLastError('Chat system initialization error');
    } finally {
      setChatSystemLoading(false);
    }
  }, [websocketConnection, chatData.setLastError]);

  // Handle incoming messages
  const handleIncomingMessage = useCallback((message) => {
    console.log('📥 handleIncomingMessage called:', message);

    if (!currentUser) {
      console.warn('⚠️ No current user, ignoring message');
      return;
    }

    console.log('👤 Current user:', {
      id: currentUser.user_id,
      name: `${currentUser.first_name} ${currentUser.last_name}`
    });

    // Determine room key
    const otherUserId = message.sender_id === currentUser.user_id
      ? message.receiver_id
      : message.sender_id;

    const roomKey = `room_${Math.min(currentUser.user_id, otherUserId)}_${Math.max(currentUser.user_id, otherUserId)}`;

    console.log('🔑 Generated room key:', roomKey, {
      senderIsCurrentUser: message.sender_id === currentUser.user_id,
      otherUserId,
      currentUserId: currentUser.user_id
    });

    // Add message to room
    console.log('➕ Adding message to room...');
    chatData.addMessageToRoom(roomKey, message);

    // Update unread count if not the sender
    if (message.sender_id !== currentUser.user_id) {
      console.log('🔔 Updating unread count for sender:', message.sender_id);
      chatData.updateUnreadCount(message.sender_id);
      chatNotifications.handleNewMessageNotification(message);
    } else {
      console.log('ℹ️ Message from current user, not updating unread count');
    }
  }, [currentUser, chatData, chatNotifications]);

  // Send message
  const handleSendMessage = useCallback(async (targetUser, content) => {
    console.log('🚀 useChat handleSendMessage called (SIMPLIFIED NUMERIC APPROACH):', {
      currentUser: currentUser ? `${currentUser.first_name} ${currentUser.last_name} (ID: ${currentUser.user_id})` : 'null',
      targetUser: targetUser ? `${targetUser.first_name} ${targetUser.last_name} (ID: ${targetUser.user_id})` : 'null',
      content: content
    });

    if (!currentUser || !targetUser || !content.trim()) {
      console.warn('⚠️ Missing required data for sending message');
      return;
    }

    setOperationStatus('sending');
    chatData.setLastError(null);

    try {
      // Create or get room
      console.log('🏠 About to call getOrCreateRoom with:', {
        currentUser: currentUser ? `${currentUser.first_name} ${currentUser.last_name} (ID: ${currentUser.user_id})` : 'null',
        targetUser: targetUser ? `${targetUser.first_name || 'No first_name'} ${targetUser.last_name || 'No last_name'} (ID: ${targetUser.user_id})` : 'null'
      });

      const room = chatData.getOrCreateRoom(targetUser);
      console.log('🏠 getOrCreateRoom returned:', room);

      if (!room) {
        console.error('❌ Room creation failed - getOrCreateRoom returned null');
        throw new Error('Could not create chat room');
      }

      console.log('📂 Using room:', room);

      // Create message object with unique ID
      const message = {
        id: generateUniqueMessageId(), // Unique ID using utility function
        sender_id: currentUser.user_id,
        receiver_id: targetUser.user_id,
        sender_name: `${currentUser.first_name} ${currentUser.last_name}`,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      console.log('💬 Created message object:', message);

      // Add to local state immediately for optimistic updates
      chatData.addMessageToRoom(room.id, message);
      console.log('📝 Added message to local room:', room.id);

      // Send via websocket with SIMPLE NUMERIC IDs
      if (sendMessage) {
        const wsMessage = {
          type: 'send_message',
          sender_id: currentUser.user_id,    // Use numeric user ID
          recipient_id: targetUser.user_id,  // Use numeric user ID  
          message: content.trim(),
        };

        console.log('🌐 Sending SIMPLIFIED WebSocket message:', wsMessage);

        try {
          const sent = sendMessage(wsMessage);
          if (sent) {
            console.log('✅ WebSocket message sent successfully');
          } else {
            console.warn('⚠️ WebSocket message failed to send');
            throw new Error('WebSocket not connected');
          }
        } catch (wsError) {
          console.error('❌ WebSocket send error:', wsError);
          throw wsError;
        }
      } else {
        console.warn('⚠️ No sendMessage function available - messages will not be sent over WebSocket');
      }

      console.log('✅ handleSendMessage completed successfully');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      chatData.setLastError('Failed to send message');
    } finally {
      setOperationStatus(null);
    }
  }, [currentUser, sendMessage, chatData]);

  // Start chat with user
  const startChatWithUser = useCallback((targetUser) => {
    if (!currentUser || !targetUser) return;

    const room = chatData.getOrCreateRoom(targetUser);
    if (room) {
      chatData.setActiveRoom(room.id);
      chatData.markRoomAsRead(room.id);

      // Join the room using SIMPLE NUMERIC recipient_id
      if (sendMessage) {
        const joinMessage = {
          type: 'join_room',
          recipient_id: targetUser.user_id,  // Use numeric user ID directly
        };
        console.log('🚪 Joining room with SIMPLIFIED approach:', joinMessage);
        sendMessage(joinMessage);
      }
    }
  }, [currentUser, chatData, sendMessage]);

  // Handle typing events
  const handleTyping = useCallback((isTyping, targetUserId) => {
    if (!currentUser) return;

    if (isTyping) {
      chatTyping.handleTypingStart(currentUser.user_id, `${currentUser.first_name} ${currentUser.last_name}`);
    } else {
      chatTyping.handleTypingStop(currentUser.user_id);
    }

    // Send typing indicator via websocket
    if (sendMessage) {
      sendMessage({
        type: 'typing_indicator',
        is_typing: isTyping,
        user_id: currentUser.user_id,
        target_user_id: targetUserId,
      });
    }
  }, [currentUser, sendMessage, chatTyping]);

  // Initialize on mount
  useEffect(() => {
    if (currentUser) {
      initializeChatSystem();
    }
  }, [currentUser, initializeChatSystem]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessageFromOnlineStatus) {
      console.log('📨 useChat received WebSocket message:', lastMessageFromOnlineStatus);

      try {
        const messageData = typeof lastMessageFromOnlineStatus === 'string'
          ? JSON.parse(lastMessageFromOnlineStatus)
          : lastMessageFromOnlineStatus;

        console.log('📋 Parsed message data:', messageData);

        if (messageData.type === 'chat_message' || messageData.type === 'new_message') {
          console.log('💬 Processing chat message...');
          // Handle both 'chat_message' and 'new_message' types
          const actualMessage = messageData.message || messageData;
          console.log('📨 Actual message to process:', actualMessage);
          handleIncomingMessage(actualMessage);
        } else if (messageData.type === 'typing_indicator') {
          console.log('⌨️ Processing typing indicator...');
          if (messageData.is_typing) {
            chatTyping.handleTypingStart(messageData.user_id, messageData.user_name);
          } else {
            chatTyping.handleTypingStop(messageData.user_id);
          }
        } else {
          console.log('ℹ️ Ignoring message type:', messageData.type);
        }
      } catch (error) {
        console.error('❌ Error processing websocket message:', error);
      }
    }
  }, [lastMessageFromOnlineStatus, handleIncomingMessage, chatTyping]);

  return {
    // State
    chatRooms: chatData.chatRooms,
    activeRoom: chatData.activeRoom,
    typingUsers: chatTyping.typingUsers,
    unreadCounts: chatData.unreadCounts,
    isLoading: chatData.isLoading,
    lastError: chatData.lastError,
    operationStatus,
    chatSystemLoading,

    // Actions
    startChatWithUser,
    sendMessage: handleSendMessage,
    handleTyping,
    setActiveRoom: chatData.setActiveRoom,
    markRoomAsRead: chatData.markRoomAsRead,
    getRoomMessages: chatData.getRoomMessages,
    getSortedRooms: chatData.getSortedRooms,
    getTypingUsersForRoom: chatTyping.getTypingUsersForRoom,
    getTotalUnreadCount: () => {
      return Object.values(chatData.unreadCounts).reduce((total, count) => total + count, 0);
    },
    getUnreadCountForUser: (userId) => {
      return chatData.unreadCounts[userId] || 0;
    }
  };
};

export default useChat;
