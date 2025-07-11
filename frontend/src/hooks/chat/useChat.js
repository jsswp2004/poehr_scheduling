/**
 * Refactored useChat hook - Main chat functionality
 * 
 * This is a much more maintainable version of the original 691-line useChat.js
 * - Business logic separated into focused hooks
 * - Utilities extracted for reusability
 * - Better organization and maintainability
 */
import { useState, useEffect, useCallback } from 'react';
import { useChatData } from './useChatData';
import { useChatTyping } from './useChatTyping';
import { useChatNotifications } from './useChatNotifications';
import { initializeChatWithRetry } from '../../utils/chat/chatUtils';

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
  }, [websocketConnection, chatData]);

  // Handle incoming messages
  const handleIncomingMessage = useCallback((message) => {
    if (!currentUser) return;

    // Determine room key
    const otherUserId = message.sender_id === currentUser.user_id 
      ? message.receiver_id 
      : message.sender_id;
    
    const roomKey = `room_${Math.min(currentUser.user_id, otherUserId)}_${Math.max(currentUser.user_id, otherUserId)}`;
    
    // Add message to room
    chatData.addMessageToRoom(roomKey, message);
    
    // Update unread count if not the sender
    if (message.sender_id !== currentUser.user_id) {
      chatData.updateUnreadCount(message.sender_id);
      chatNotifications.handleNewMessageNotification(message);
    }
  }, [currentUser, chatData, chatNotifications]);

  // Send message
  const handleSendMessage = useCallback(async (targetUser, content) => {
    if (!currentUser || !targetUser || !content.trim()) return;

    setOperationStatus('sending');
    chatData.setLastError(null);

    try {
      // Create or get room
      const room = chatData.getOrCreateRoom(targetUser);
      if (!room) {
        throw new Error('Could not create chat room');
      }

      // Create message object
      const message = {
        id: Date.now(), // Temporary ID
        sender_id: currentUser.user_id,
        receiver_id: targetUser.user_id,
        sender_name: `${currentUser.first_name} ${currentUser.last_name}`,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add to local state immediately for optimistic updates
      chatData.addMessageToRoom(room.id, message);

      // Send via websocket if available
      if (sendMessage) {
        await sendMessage({
          type: 'chat_message',
          ...message,
        });
      }

      console.log('✅ Message sent successfully');
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
    }
  }, [currentUser, chatData]);

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
      try {
        const messageData = typeof lastMessageFromOnlineStatus === 'string' 
          ? JSON.parse(lastMessageFromOnlineStatus) 
          : lastMessageFromOnlineStatus;

        if (messageData.type === 'chat_message') {
          handleIncomingMessage(messageData);
        } else if (messageData.type === 'typing_indicator') {
          if (messageData.is_typing) {
            chatTyping.handleTypingStart(messageData.user_id, messageData.user_name);
          } else {
            chatTyping.handleTypingStop(messageData.user_id);
          }
        }
      } catch (error) {
        console.error('Error processing websocket message:', error);
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
  };
};
