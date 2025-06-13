import { useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket from './useWebSocket';

const useChat = (currentUser) => {
  const [chatRooms, setChatRooms] = useState({});
  const [activeRoom, setActiveRoom] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const typingTimeouts = useRef({});

  // WebSocket connection for chat
  const { isConnected, sendMessage } = useWebSocket(
    'ws://127.0.0.1:8005/ws/presence/',
    {
      onOpen: () => {
        console.log('✅ Connected to chat WebSocket');
      },
      onMessage: (data) => {
        handleWebSocketMessage(data);
      },
      onError: (error) => {
        console.error('❌ Chat WebSocket error:', error);
      },
      onClose: () => {
        console.log('🔌 Chat WebSocket disconnected');
      }
    }
  );

  const handleWebSocketMessage = useCallback((data) => {
    console.log('🔔 WebSocket message received:', data);
    
    switch (data.type) {
      case 'new_message':
        console.log('📩 Processing new_message:', data.message);
        handleNewMessage(data.message);
        break;
      case 'typing_indicator':
        handleTypingIndicator(data);
        break;
      case 'read_receipt':
        handleReadReceipt(data);
        break;
      case 'chat_history':
        handleChatHistory(data);
        break;
      case 'chat_room_created':
        console.log('🏠 Room created:', data.room);
        handleChatRoomCreated(data.room);
        break;
      case 'message_sent':
        console.log('✅ Message sent confirmation:', data.message);
        handleMessageSent(data.message);
        break;
      case 'error':
        console.error('❌ WebSocket error:', data.error);
        break;
      default:
        console.log('❓ Unknown message type:', data.type, data);
    }
  }, []);

  const handleNewMessage = (message) => {
    console.log('📨 Received new message:', message);
    
    setChatRooms(prev => ({
      ...prev,
      [message.room_id]: {
        ...prev[message.room_id],
        messages: [...(prev[message.room_id]?.messages || []), message]
      }
    }));

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
    
    setChatRooms(prev => ({
      ...prev,
      [room_id]: {
        ...prev[room_id],
        messages: messages
      }
    }));
    
    setIsLoading(false);
  };
  const handleChatRoomCreated = (room) => {
    console.log('🏠 Chat room created:', room);
    
    setChatRooms(prev => ({
      ...prev,
      [room.id]: {
        ...room,
        messages: []
      }
    }));
    
    // Set this as the active room if we don't have one
    if (!activeRoom) {
      console.log('🎯 Setting new room as active:', room.id);
      setActiveRoom(room.id);
    }
  };

  const handleMessageSent = (message) => {
    // Message already added via handleNewMessage when broadcasted
    console.log('✅ Message sent successfully:', message.id);
  };

  // Chat actions
  const sendChatMessage = useCallback((roomId, messageText, recipientId = null) => {
    if (!isConnected || !messageText.trim()) return;

    console.log('🔄 Sending chat message:', { roomId, messageText, recipientId, isConnected });
    
    sendMessage({
      type: 'send_message',
      room_id: roomId,
      message: messageText.trim(),
      recipient_id: recipientId
    });
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
    if (!isConnected) return;

    setIsLoading(true);
    sendMessage({
      type: 'get_chat_history',
      room_id: roomId,
      limit: limit
    });
  }, [isConnected, sendMessage]);

  const createChatRoom = useCallback((participantIds, roomName = '', roomType = 'direct') => {
    if (!isConnected) return;

    sendMessage({
      type: 'create_chat_room',
      participant_ids: participantIds,
      room_name: roomName,
      room_type: roomType
    });
  }, [isConnected, sendMessage]);

  const createDirectMessage = useCallback((userId, userName) => {
    // Check if direct message room already exists
    const existingRoom = Object.values(chatRooms).find(room => 
      room.room_type === 'direct' && 
      room.participants?.some(p => p.id === userId)
    );

    if (existingRoom) {
      setActiveRoom(existingRoom.id);
      return existingRoom.id;
    }

    // Create new direct message room
    createChatRoom([currentUser?.id, userId], `${currentUser?.name || 'You'} & ${userName}`, 'direct');
    return null;
  }, [chatRooms, currentUser, createChatRoom]);

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
  const openChatWithUser = useCallback((user) => {
    console.log('🚀 Opening chat with user:', user);
    
    const roomId = createDirectMessage(user.id, user.name);
    console.log('🏠 Room ID returned:', roomId);
    
    if (roomId) {
      setActiveRoom(roomId);
      loadChatHistory(roomId);
      console.log('✅ Set active room to:', roomId);
    } else {
      console.log('⚠️ No room ID - probably creating new room');
    }
  }, [createDirectMessage, loadChatHistory]);

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
    getRoomInfo
  };
};

export default useChat;
