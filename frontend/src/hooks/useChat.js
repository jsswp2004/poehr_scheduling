/**
 * Refactored useChat hook - Main chat functionality
 * 
 * This is a much more maintainable version of the original 691-line useChat.js
 * - Business logic separated into focused hooks
 * - Utilities extracted for reusability
 * - Better organization and maintainability
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatData } from './chat/useChatData';
import { useChatTyping } from './chat/useChatTyping';
import { useChatNotifications } from './chat/useChatNotifications';
import { initializeChatWithRetry, createRoomKey } from '../utils/chat/chatUtils';
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
        // Chat system initialized successfully
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
    if (!currentUser) {
      return;
    }

    const currentUserId = currentUser.user_id || currentUser.id;

    // Skip processing messages sent by the current user (avoid duplicate handling)
    if (message.sender_id === currentUserId) {
      return;
    }

    // For incoming messages, the other user is always the sender
    const otherUserId = message.sender_id;
    const roomKey = createRoomKey(currentUserId, otherUserId);

    if (!roomKey) {
      console.error('❌ Could not create room key for message:', message);
      return;
    }

    // Add message to room
    chatDataRef.current.addMessageToRoom(roomKey, message);

    // Update unread count for the sender
    chatDataRef.current.updateUnreadCount(message.sender_id);
    chatNotificationsRef.current.handleNewMessageNotification(message);
  }, [currentUser]);

  // Refs to avoid dependency issues
  const chatDataRef = useRef();
  const chatNotificationsRef = useRef();
  const chatTypingRef = useRef();

  chatDataRef.current = chatData;
  chatNotificationsRef.current = chatNotifications;
  chatTypingRef.current = chatTyping;

  // Send message
  const handleSendMessage = useCallback(async (targetUser, content) => {
    if (!currentUser || !targetUser || !content.trim()) {
      console.warn('⚠️ Missing required data for sending message');
      return;
    }

    const currentUserId = currentUser.user_id || currentUser.id;
    const targetUserId = targetUser.user_id || targetUser.id;

    setOperationStatus('sending');
    chatData.setLastError(null);

    try {
      // Create or get room
      const room = chatData.getOrCreateRoom(targetUser);

      if (!room) {
        console.error('❌ Room creation failed - getOrCreateRoom returned null');
        throw new Error('Could not create chat room');
      }

      // Create message object with unique ID
      const message = {
        id: generateUniqueMessageId(), // Unique ID using utility function
        sender_id: currentUserId,
        receiver_id: targetUserId,
        sender_name: `${currentUser.first_name} ${currentUser.last_name}`,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add to local state immediately for optimistic updates
      chatData.addMessageToRoom(room.id, message);

      // Send via websocket with SIMPLE NUMERIC IDs
      if (sendMessage) {
        const wsMessage = {
          type: 'send_message',
          sender_id: currentUserId,    // Use numeric user ID
          recipient_id: targetUserId,  // Use numeric user ID  
          message: content.trim(),
        };

        try {
          const sent = sendMessage(wsMessage);
          if (!sent) {
            throw new Error('WebSocket not connected');
          }
        } catch (wsError) {
          console.error('❌ WebSocket send error:', wsError);
          throw wsError;
        }
      } else {
        console.warn('⚠️ No sendMessage function available - messages will not be sent over WebSocket');
      }
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
        const recipientId = targetUser.user_id || targetUser.id;
        const joinMessage = {
          type: 'join_room',
          recipient_id: recipientId,  // Use numeric user ID directly
        };
        console.log('🏠 Sending join_room message:', joinMessage);
        sendMessage(joinMessage);
      }
    }
  }, [currentUser, chatData, sendMessage]);

  // Handle typing events
  const handleTyping = useCallback((isTyping, targetUserId) => {
    if (!currentUser) return;

    const currentUserId = currentUser.user_id || currentUser.id;

    if (isTyping) {
      chatTyping.handleTypingStart(currentUserId, `${currentUser.first_name} ${currentUser.last_name}`);
    } else {
      chatTyping.handleTypingStop(currentUserId);
    }

    // Send typing indicator via websocket
    if (sendMessage) {
      sendMessage({
        type: 'typing_indicator',
        is_typing: isTyping,
        user_id: currentUserId,
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
      try {
        const messageData = typeof lastMessageFromOnlineStatus === 'string'
          ? JSON.parse(lastMessageFromOnlineStatus)
          : lastMessageFromOnlineStatus;

        if (messageData.type === 'chat_message' || messageData.type === 'new_message') {
          // Handle both 'chat_message' and 'new_message' types
          const actualMessage = messageData.message || messageData;
          handleIncomingMessage(actualMessage);
        } else if (messageData.type === 'typing_indicator') {
          if (messageData.is_typing) {
            chatTypingRef.current.handleTypingStart(messageData.user_id, messageData.user_name);
          } else {
            chatTypingRef.current.handleTypingStop(messageData.user_id);
          }
        }
        // Silently ignore other message types like user_status_update, online_users_list
      } catch (error) {
        console.error('❌ Error processing websocket message:', error);
      }
    }
  }, [lastMessageFromOnlineStatus]);

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