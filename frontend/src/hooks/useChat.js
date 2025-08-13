/**
 * Refactored useChat hook - Main chat functionality
 * 
 * This is a m          });

        console.log('✅ Offline messages loaded successfully');
      } else {
        console.log('📭 No offline messages found');
      }re maintainable version of the original 691-line useChat.js
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
import { getValidToken } from '../utils/auth';
import { API_BASE_URL } from '../config/api';
import axios from 'axios';

export const useChat = (currentUser, websocketConnection, sendMessage, lastMessageFromOnlineStatus) => {
  // Initialization state
  const [chatSystemLoading, setChatSystemLoading] = useState(true);
  const [operationStatus, setOperationStatus] = useState(null);
  const [offlineMessagesFetched, setOfflineMessagesFetched] = useState(false);

  // Use modular hooks
  const chatData = useChatData(currentUser);
  const chatTyping = useChatTyping();
  const chatNotifications = useChatNotifications(currentUser);

  // Fetch offline messages when user logs in
  const fetchOfflineMessages = useCallback(async () => {
    if (!currentUser || offlineMessagesFetched) {
      return;
    }

    try {
      setOfflineMessagesFetched(true); // Set flag to prevent re-fetching

      const token = await getValidToken();
      if (!token) {
        console.error('❌ No valid token for fetching offline messages');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/users/unread-messages/`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { unread_messages, count } = response.data;

      if (count > 0) {
        // Show notification about missed messages
        chatNotifications.handleOfflineMessagesNotification?.(count);

        // Process each offline message
        unread_messages.forEach(message => {
          const currentUserId = currentUser.user_id || currentUser.id;
          const otherUserId = message.sender_id;
          const roomKey = createRoomKey(currentUserId, otherUserId);

          if (roomKey) {
            // Format message for local state
            const formattedMessage = {
              id: message.id,
              sender_id: message.sender_id,
              sender_name: message.sender_name,
              content: message.content,
              timestamp: message.timestamp,
              is_read: false,
              offline: true, // Mark as offline message
            };

            // Add to chat room
            chatData.addMessageToRoom(roomKey, formattedMessage);

            // Update unread count
            chatData.updateUnreadCount(message.sender_id);
          }
        });

        console.log('✅ Offline messages loaded successfully');
      } else {
        console.log('📭 No offline messages found');
      }
    } catch (error) {
      console.error('❌ Error fetching offline messages:', error);
      chatData.setLastError('Failed to load offline messages');
    }
  }, [currentUser, offlineMessagesFetched, setOfflineMessagesFetched, chatData, chatNotifications]);

  // Initialize chat system
  const initializeChatSystem = useCallback(async () => {
    if (chatSystemLoading === false) {
      return;
    }

    setChatSystemLoading(true);
    try {
      const success = await initializeChatWithRetry(
        null, // chat object would be passed here
        null, // connectToOnlineStatus function
        websocketConnection
      );

      if (success) {
        // Chat system initialized successfully
        // Now fetch any offline messages (only if not already fetched)
        if (!offlineMessagesFetched) {
          await fetchOfflineMessages();
        }
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
  }, [websocketConnection, chatData, fetchOfflineMessages, offlineMessagesFetched, chatSystemLoading]);

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

    // Avoid double-processing duplicates (e.g., reconnect replays)
    const isDuplicate = chatDataRef.current?.isDuplicateMessage
      ? chatDataRef.current.isDuplicateMessage(roomKey, message)
      : false;
    if (isDuplicate) {
      return;
    }

    // Add message to room
    chatDataRef.current.addMessageToRoom(roomKey, message);

    // Update unread count for the sender (who we received the message from)
    chatData.updateUnreadCount(message.sender_id);
    
    // Only show notification for real-time messages, not offline messages being loaded
    if (!message.offline) {
      chatNotifications.handleNewMessageNotification(message);
    }
  }, [currentUser, chatData, chatNotifications]);

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
      // Don't mark as read immediately - let the UI decide when to mark as read

      // Join the room using SIMPLE NUMERIC recipient_id
      if (sendMessage) {
        const recipientId = targetUser.user_id || targetUser.id;
        const joinMessage = {
          type: 'join_room',
          recipient_id: recipientId,  // Use numeric user ID directly
        };
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

  // Reset offline messages fetched flag when user changes
  useEffect(() => {
    setOfflineMessagesFetched(false);
    setChatSystemLoading(true);
  }, [currentUser?.id]);

  // Initialize on mount (only once per user)
  useEffect(() => {
    if (currentUser && !offlineMessagesFetched && chatSystemLoading) {
      initializeChatSystem();
    }
  }, [currentUser, offlineMessagesFetched, chatSystemLoading, initializeChatSystem]);

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
  }, [lastMessageFromOnlineStatus, handleIncomingMessage]);

  // Mark messages as read on the server
  const markMessagesReadOnServer = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;

    try {
      const token = await getValidToken();
      if (!token) return;

      await axios.post(`${API_BASE_URL}/api/users/mark-messages-read/`, {
        message_ids: messageIds
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('✅ Messages marked as read on server:', messageIds);
    } catch (error) {
      console.error('❌ Error marking messages as read on server:', error);
    }
  }, []);

  // Enhanced mark room as read function
  const markRoomAsReadEnhanced = useCallback((roomKey) => {
    // Mark as read locally
    chatData.markRoomAsRead(roomKey);

    // Get messages in the room to find offline messages that need to be marked as read on server
    const messages = chatData.getRoomMessages(roomKey);
    const offlineMessageIds = messages
      .filter(msg => msg.offline && !msg.is_read)
      .map(msg => msg.id);

    if (offlineMessageIds.length > 0) {
      markMessagesReadOnServer(offlineMessageIds);
    }
  }, [chatData, markMessagesReadOnServer]);

  // Memoized functions to prevent infinite loops in components
  const getTotalUnreadCount = useCallback(() => {
    const totalCount = Object.values(chatData.unreadCounts).reduce((total, count) => total + count, 0);
    return totalCount;
  }, [chatData.unreadCounts]);

  const getUnreadCountForUser = useCallback((userId) => {
    const count = chatData.unreadCounts[userId] || 0;
    return count;
  }, [chatData.unreadCounts]);

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
    markRoomAsRead: markRoomAsReadEnhanced, // Use enhanced version
    getRoomMessages: chatData.getRoomMessages,
    getSortedRooms: chatData.getSortedRooms,
    getTypingUsersForRoom: chatTyping.getTypingUsersForRoom,
    getTotalUnreadCount,
    getUnreadCountForUser
  };
};

export default useChat;