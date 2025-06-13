import { useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket from './useWebSocket';

const useChat = (currentUser) => {
  const [chatRooms, setChatRooms] = useState({});
  const [activeRoom, setActiveRoom] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const typingTimeouts = useRef({});
  console.log('🚀 useChat hook initializing with currentUser:', currentUser);
  // WebSocket connection for chat (using presence endpoint since that's what handles chat messages)
  const { isConnected, sendMessage } = useWebSocket(
    'ws://localhost:8000/ws/presence/',
    {
      onOpen: () => {
        console.log('✅ Connected to chat WebSocket via presence endpoint');
      },
      onMessage: (data) => {
        handleWebSocketMessage(data);
      },
      onError: (error) => {
        console.error('❌ Chat WebSocket error:', error);
      },
      onClose: (event) => {
        console.log('🔌 Chat WebSocket disconnected:', event.code, event.reason);
      }
    }
  );
  
  console.log('🔍 Chat WebSocket hook result:', { isConnected, sendMessage: !!sendMessage });
  // Debug connection status
  useEffect(() => {
    console.log('🔍 Chat WebSocket connection status:', isConnected);
  }, [isConnected]);

  // Debug current user
  useEffect(() => {
    console.log('👤 Current user in chat:', currentUser);
  }, [currentUser]);const handleWebSocketMessage = useCallback((data) => {
    console.log('🔔 WebSocket message received:', data);
    
    switch (data.type) {
      case 'new_message':
        console.log('📩 Processing new_message:', data.message);
        handleNewMessage(data.message);
        // Show notification if message is from another user and window is not focused
        if (data.message.sender_id !== currentUser?.id && !document.hasFocus()) {
          // You can add toast notification here if desired
          console.log('🔔 New message notification:', data.message);
        }
        break;
      case 'typing_indicator':
        handleTypingIndicator(data);
        break;
      case 'read_receipt':
        handleReadReceipt(data);
        break;
      case 'chat_history':
        console.log('📚 Processing chat_history');
        setOperationStatus(null); // Clear loading state
        handleChatHistory(data);
        break;
      case 'chat_room_created':
        console.log('🏠 Room created response received:', data.room);
        setOperationStatus(null); // Clear creating room state
        handleChatRoomCreated(data.room);
        break;
      case 'message_sent':
        console.log('✅ Message sent confirmation:', data.message);
        handleMessageSent(data.message);
        break;
      case 'error':
        console.error('❌ WebSocket error received:', data.error || data.message);
        setLastError(data.error || data.message);
        setOperationStatus(null); // Clear any pending operation
        // Also reject pending room creation if exists
        if (window._pendingRoomCreation) {
          clearTimeout(window._pendingRoomCreation.timeout);
          window._pendingRoomCreation.reject(new Error(data.error || data.message));
          delete window._pendingRoomCreation;
        }
        break;
      default:
        console.log('❓ Unknown message type:', data.type, data);
    }
  }, [currentUser]);
  const handleNewMessage = (message) => {
    console.log('📨 Received new message:', message);
    
    setChatRooms(prev => {
      const room = prev[message.room_id] || { messages: [] };
      
      // Check if message already exists to avoid duplicates
      const messageExists = room.messages?.some(msg => msg.id === message.id);
      if (messageExists) {
        console.log('📨 Message already exists, skipping:', message.id);
        return prev;
      }
      
      return {
        ...prev,
        [message.room_id]: {
          ...room,
          messages: [...(room.messages || []), message].sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          )
        }
      };
    });

    // Mark message as read if room is active
    if (activeRoom === message.room_id) {
      markMessageAsRead(message.id);
    }
  };

  const handleTypingIndicator = (data) => {
    const { user_id, user_name, room_id, is_typing } = data;
    
    setTypingUsers(prev => {
      const roomTyping = prev[room_id] || {};
      
      if (is_typing) {
        roomTyping[user_id] = user_name;
        
        // Clear existing timeout
        if (typingTimeouts.current[`${room_id}_${user_id}`]) {
          clearTimeout(typingTimeouts.current[`${room_id}_${user_id}`]);
        }
        
        // Set timeout to remove typing indicator
        typingTimeouts.current[`${room_id}_${user_id}`] = setTimeout(() => {
          setTypingUsers(prevTyping => {
            const newRoomTyping = { ...prevTyping[room_id] };
            delete newRoomTyping[user_id];
            return {
              ...prevTyping,
              [room_id]: newRoomTyping
            };
          });
        }, 3000);
      } else {
        delete roomTyping[user_id];
        if (typingTimeouts.current[`${room_id}_${user_id}`]) {
          clearTimeout(typingTimeouts.current[`${room_id}_${user_id}`]);
          delete typingTimeouts.current[`${room_id}_${user_id}`];
        }
      }
      
      return {
        ...prev,
        [room_id]: roomTyping
      };
    });
  };

  const handleReadReceipt = (data) => {
    const { message_id, reader_id } = data;
    
    setChatRooms(prev => {
      const updated = { ...prev };
      
      // Find and update the message
      Object.keys(updated).forEach(roomId => {
        const room = updated[roomId];
        if (room.messages) {
          const messageIndex = room.messages.findIndex(msg => msg.id === message_id);
          if (messageIndex !== -1) {
            updated[roomId] = {
              ...room,
              messages: room.messages.map(msg => 
                msg.id === message_id ? { ...msg, is_read: true } : msg
              )
            };
          }
        }
      });
      
      return updated;
    });
  };
  const handleChatHistory = (data) => {
    const { room_id, messages } = data;
    
    console.log('📚 Loading chat history for room:', room_id, 'Messages:', messages.length);
    
    setChatRooms(prev => ({
      ...prev,
      [room_id]: {
        ...prev[room_id],
        messages: messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      }
    }));
    
    setIsLoading(false);
  };const handleChatRoomCreated = (room) => {
    console.log('🏠 Chat room created:', room);
    
    setChatRooms(prev => ({
      ...prev,
      [room.id]: {
        ...room,
        messages: []
      }
    }));
    
    // Set this as the active room and load its history
    console.log('🎯 Setting new room as active:', room.id);
    setActiveRoom(room.id);
    
    // Load chat history for the new room
    loadChatHistory(room.id);
    
    // Resolve pending room creation promise if exists
    if (window._pendingRoomCreation) {
      clearTimeout(window._pendingRoomCreation.timeout);
      window._pendingRoomCreation.resolve(room.id);
      delete window._pendingRoomCreation;
    }
  };

  const handleMessageSent = (message) => {
    // Message already added via handleNewMessage when broadcasted
    console.log('✅ Message sent successfully:', message.id);
  };
  // Connection status and user feedback
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting', 'connected', 'disconnected', 'error'
  const [lastError, setLastError] = useState(null);
  const [operationStatus, setOperationStatus] = useState(null); // 'creating_room', 'sending_message', 'loading_history', null

  // Update connection status based on WebSocket state
  useEffect(() => {
    if (isConnected) {
      setConnectionStatus('connected');
      setLastError(null);
    } else {
      setConnectionStatus('disconnected');
    }
  }, [isConnected]);
  // Auto-clear errors after a delay
  useEffect(() => {
    if (lastError) {
      const timer = setTimeout(() => {
        setLastError(null);
      }, 10000); // Clear error after 10 seconds
      
      return () => clearTimeout(timer);
    }
  }, [lastError]);

  // Auto-retry connection on error
  useEffect(() => {
    if (connectionStatus === 'error' && !isConnected) {
      const retryTimer = setTimeout(() => {
        console.log('🔄 Auto-retrying connection...');
        setConnectionStatus('connecting');
        // The WebSocket hook will handle reconnection
      }, 5000); // Retry after 5 seconds
      
      return () => clearTimeout(retryTimer);
    }
  }, [connectionStatus, isConnected]);
  // Chat actions
  const sendChatMessage = useCallback((roomId, messageText, recipientId = null) => {
    if (!isConnected) {
      console.error('❌ Cannot send message: WebSocket not connected');
      return false;
    }
    
    if (!messageText.trim()) {
      console.error('❌ Cannot send empty message');
      return false;
    }
    
    if (!roomId) {
      console.error('❌ Cannot send message: No room ID');
      return false;
    }

    console.log('🔄 Sending chat message:', { roomId, messageText: messageText.trim(), recipientId, isConnected });
    
    sendMessage({
      type: 'send_message',
      room_id: roomId,
      message: messageText.trim(),
      recipient_id: recipientId
    });
    
    return true;
  }, [isConnected, sendMessage]);

  const startTyping = useCallback((roomId) => {
    if (!isConnected) return;

    sendMessage({
      type: 'typing_start',
      room_id: roomId
    });
  }, [isConnected, sendMessage]);

  const stopTyping = useCallback((roomId) => {
    if (!isConnected) return;

    sendMessage({
      type: 'typing_stop',
      room_id: roomId
    });
  }, [isConnected, sendMessage]);

  const markMessageAsRead = useCallback((messageId) => {
    if (!isConnected) return;

    sendMessage({
      type: 'mark_message_read',
      message_id: messageId
    });
  }, [isConnected, sendMessage]);
  const loadChatHistory = useCallback((roomId, limit = 50) => {
    if (!isConnected) {
      setLastError('Cannot load chat history: Not connected');
      return;
    }

    console.log('📚 Loading chat history for room:', roomId);
    setOperationStatus('loading_history');
    setIsLoading(true);
    
    sendMessage({
      type: 'get_chat_history',
      room_id: roomId,
      limit: limit
    });
  }, [isConnected, sendMessage]);
  const createChatRoom = useCallback((participantIds, roomName = '', roomType = 'direct') => {
    console.log('🏠 createChatRoom called with:', { participantIds, roomName, roomType, isConnected });
    
    if (!isConnected) {
      console.error('❌ Cannot create chat room: WebSocket not connected');
      return;
    }

    const message = {
      type: 'create_chat_room',
      participant_ids: participantIds,
      room_name: roomName,
      room_type: roomType
    };
    
    console.log('📤 Sending WebSocket message:', message);
    const sent = sendMessage(message);
    console.log('📡 Message sent successfully:', sent);
  }, [isConnected, sendMessage]);const createDirectMessage = useCallback(async (userId, userName) => {
    console.log('🚀 Creating direct message with:', { userId, userName });
    console.log('🔍 Connection state:', { isConnected, currentUser });
    
    if (!isConnected) {
      console.error('❌ WebSocket not connected, cannot create chat room');
      setLastError('Chat system not connected. Please wait a moment and try again.');
      return null;
    }
    
    if (!currentUser) {
      console.error('❌ No current user, cannot create chat room');
      setLastError('User not logged in properly.');
      return null;
    }
    
    setOperationStatus('creating_room');
    
    try {
      // Check if direct message room already exists
      const existingRoom = Object.values(chatRooms).find(room => 
        room.room_type === 'direct' && 
        room.participants?.some(p => p.id === userId)
      );

      if (existingRoom) {
        console.log('♻️ Found existing room:', existingRoom.id);
        setActiveRoom(existingRoom.id);
        loadChatHistory(existingRoom.id);
        setOperationStatus(null);
        return existingRoom.id;
      }      // Create new direct message room
      console.log('🆕 Creating new direct message room');
      return new Promise((resolve, reject) => {
        // Store resolve function to call when room is created
        const roomCreationTimeout = setTimeout(() => {
          console.error('⏰ Room creation timed out after 10 seconds');
          setOperationStatus(null);
          setLastError('Room creation timed out. Please try again.');
          reject(new Error('Room creation timeout'));
        }, 10000); // 10 second timeout

        // Temporarily store the resolve function
        window._pendingRoomCreation = { resolve, reject, timeout: roomCreationTimeout };
        
        console.log('📡 Sending create_chat_room message to WebSocket...');
        console.log('📋 Participants:', [currentUser?.id, userId]);
        console.log('📋 Room name:', `${currentUser?.first_name || 'You'} & ${userName}`);
        
        createChatRoom([currentUser?.id, userId], `${currentUser?.first_name || 'You'} & ${userName}`, 'direct');
        console.log('✅ create_chat_room message sent, waiting for response...');
      });
    } catch (error) {
      setOperationStatus(null);
      setLastError('Failed to create chat room');
      throw error;
    }
  }, [chatRooms, currentUser, createChatRoom, loadChatHistory]);

  // Get typing users for a room (excluding current user)
  const getRoomTypingUsers = useCallback((roomId) => {
    const roomTyping = typingUsers[roomId] || {};
    return Object.entries(roomTyping)
      .filter(([userId]) => parseInt(userId) !== currentUser?.id)
      .map(([, userName]) => userName);
  }, [typingUsers, currentUser]);

  // Get messages for a room
  const getRoomMessages = useCallback((roomId) => {
    return chatRooms[roomId]?.messages || [];
  }, [chatRooms]);

  // Get room info
  const getRoomInfo = useCallback((roomId) => {
    return chatRooms[roomId] || null;
  }, [chatRooms]);
  // Open chat with user
  const openChatWithUser = useCallback(async (user) => {
    console.log('🚀 Opening chat with user:', user);
    
    try {
      const roomId = await createDirectMessage(user.id, user.name || user.full_name);
      console.log('✅ Room ready for chat:', roomId);
      return roomId;
    } catch (error) {
      console.error('❌ Failed to open chat with user:', error);
      return null;
    }
  }, [createDirectMessage]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(typingTimeouts.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  return {
    // State
    chatRooms,
    activeRoom,
    isLoading,
    isConnected,
    connectionStatus,
    lastError,
    operationStatus,
    
    // Actions
    sendChatMessage,
    startTyping,
    stopTyping,
    markMessageAsRead,
    loadChatHistory,
    createChatRoom,
    createDirectMessage,
    openChatWithUser,
    setActiveRoom,
      // Getters
    getRoomTypingUsers,
    getRoomMessages,
    getRoomInfo,
    
    // Utilities
    clearError: () => setLastError(null)
  };
};

export default useChat;
