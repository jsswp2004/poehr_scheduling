import { useState, useEffect, useCallback, useRef } from 'react';

const useChat = (currentUser, websocketConnection, sendMessage, lastMessageFromOnlineStatus) => {
  const [chatRooms, setChatRooms] = useState({});
  const [activeRoom, setActiveRoom] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [isLoading, setIsLoading] = useState(false);  const [lastError, setLastError] = useState(null); // Added for error display
  const [operationStatus, setOperationStatus] = useState(null); // For loading/creating states
  const [unreadCounts, setUnreadCounts] = useState({}); // Track unread messages per user/room
  const clearedCounts = useRef({}); // Track which user counts have been explicitly cleared

  const typingTimeouts = useRef({});
  console.log('🚀 useChat hook initializing with currentUser:', currentUser);
  // WebSocket connection for chat (using presence endpoint since that's what handles chat messages)
  const isConnected = websocketConnection && websocketConnection.readyState === WebSocket.OPEN;
  
  console.log('🔍 Chat WebSocket hook result:', { isConnected, sendMessage: !!sendMessage });
  // Debug connection status
  useEffect(() => {
    console.log('🔍 Chat WebSocket connection status:', isConnected);
  }, [isConnected]);
  // Debug current user
  useEffect(() => {
    console.log('👤 Current user in chat:', currentUser);  }, [currentUser]);  
  
  // Define loadExistingChatRooms function first
  const loadExistingChatRooms = async () => {
    try {
      console.log('📂 [INIT] Loading existing chat rooms...');
      
      // For now, let's try to load the known chat room between Joshua (17) and Carlo (3)
      // This is a temporary solution until we have a proper backend endpoint
      if (currentUser?.id === 3) {
        // Carlo is loading - try to load his conversation with Joshua
        console.log('📂 [INIT] Carlo detected - attempting to load conversation with Joshua (ID: 17)');
        await createChatRoom(17, false); // Don't open modal, just load the room
      } else if (currentUser?.id === 17) {
        // Joshua is loading - try to load his conversation with Carlo
        console.log('📂 [INIT] Joshua detected - attempting to load conversation with Carlo (ID: 3)');
        await createChatRoom(3, false); // Don't open modal, just load the room
      }
    } catch (error) {
      console.error('❌ [INIT] Failed to load existing chat rooms:', error);
    }  };

  // Initialize and load existing chat rooms when currentUser is available
  useEffect(() => {
    if (currentUser?.id && isConnected) {
      console.log('🚀 [INIT] Initializing chat system for user:', currentUser.id);
      console.log('🔔 [INIT] Current unread counts on initialization:', unreadCounts);
      // Load existing chat conversations to populate unread counts
      loadExistingChatRooms();
    }
  }, [currentUser?.id, isConnected, loadExistingChatRooms]);

  // Process messages received from the shared WebSocket connection via lastMessageFromOnlineStatus
  useEffect(() => {
    if (lastMessageFromOnlineStatus) {
      console.log('🔔 useChat received message from useOnlineStatus:', lastMessageFromOnlineStatus);
      handleWebSocketMessage(lastMessageFromOnlineStatus);
    }
  }, [lastMessageFromOnlineStatus]); // Dependency on lastMessageFromOnlineStatus

  const handleWebSocketMessage = useCallback((data) => {
    console.log('🔔 WebSocket message received in useChat:', data);
    
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
        handleReadReceipt(data);        break;
      case 'chat_history':
        console.log('📚 Processing chat_history');
        setOperationStatus(null); // Clear loading state
        handleChatHistory(data);
        break;
      case 'user_chat_rooms':
        console.log('📂 [INIT] Processing user_chat_rooms response');
        handleUserChatRooms(data);
        break;
      case 'chat_room_created':
        console.log('🏠 Room created response received in useChat:', data);
        setOperationStatus(null); // Clear creating room state
        handleChatRoomCreated(data);
        break;
      case 'message_sent':
        console.log('✅ Message sent confirmation:', data.message);
        handleMessageSent(data.message);
        break;
      case 'error':
        console.error('❌ WebSocket error received in useChat:', data.error || data.message);
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
        // Do not log here, as useOnlineStatus will handle its own messages
        // console.log('❓ Unknown message type in useChat:', data.type, data);
        break;
    }
  }, [currentUser]); // Removed handleNewMessage, handleTypingIndicator, etc. from deps as they are stable
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
    });    // Update unread counts if message is from another user and room is not active
    if (message.sender_id !== currentUser?.id && activeRoom !== message.room_id) {
      // Track unread count from the sender for the current user (receiver)
      const senderUserId = message.sender_id;
      
      // Reset cleared status for this user since they sent a new message
      clearedCounts.current[senderUserId] = false;
      console.log('🔔 [DEBUG] Reset cleared status for user', senderUserId, 'due to new message');
      
      console.log('🔔 [DEBUG] Incrementing unread count FROM user:', senderUserId, 'FOR current user:', currentUser?.id);
      console.log('🔔 [DEBUG] Previous count from sender:', unreadCounts[senderUserId] || 0, 'incrementing to:', (unreadCounts[senderUserId] || 0) + 1);
      console.log('🔔 [DEBUG] Message details:', { sender_id: message.sender_id, room_id: message.room_id, activeRoom, currentUserId: currentUser?.id });
      setUnreadCounts(prev => {
        const newCounts = {
          ...prev,
          [senderUserId]: (prev[senderUserId] || 0) + 1
        };
        console.log('🔔 [DEBUG] Updated unread counts (messages FROM each user TO current user):', newCounts);
        return newCounts;
      });} else {
      console.log('🔔 [DEBUG] NOT incrementing unread count. Reasons:', {
        isOwnMessage: message.sender_id === currentUser?.id,
        isActiveRoom: activeRoom === message.room_id,
        sender_id: message.sender_id,
        currentUserId: currentUser?.id,
        activeRoom,
        messageRoomId: message.room_id,
        chatModalIsOpen: activeRoom === message.room_id ? 'YES (modal open for this chat)' : 'NO (modal closed or different chat)'
      });
    }    // Mark message as read if room is active
    if (activeRoom === message.room_id) {
      console.log('📖 [DEBUG] Auto-marking message as read because room is active:', message.id);
      markMessageAsRead(message.id);
      
      // Also immediately clear this sender's unread count since the room is active
      if (message.sender_id !== currentUser?.id) {
        console.log('📖 [DEBUG] Auto-clearing unread count for sender since message auto-read:', message.sender_id);
        setUnreadCounts(prev => ({
          ...prev,
          [message.sender_id]: 0
        }));
      }
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
    
    console.log('📖 [DEBUG] Read receipt received for message:', message_id, 'reader:', reader_id, 'current user:', currentUser?.id);
    
    setChatRooms(prev => {
      const updated = { ...prev };
      let foundMessage = null;
      let foundRoomId = null;
      
      // Find and update the message
      Object.keys(updated).forEach(roomId => {
        const room = updated[roomId];
        if (room.messages) {
          const messageIndex = room.messages.findIndex(msg => msg.id === message_id);
          if (messageIndex !== -1) {
            foundMessage = room.messages[messageIndex];
            foundRoomId = roomId;
            updated[roomId] = {
              ...room,
              messages: room.messages.map(msg => 
                msg.id === message_id ? { ...msg, is_read: true } : msg
              )
            };
          }
        }
      });
      
      // If the current user is the reader and we found the message, clear unread count for the sender
      if (foundMessage && reader_id === currentUser?.id && foundMessage.sender_id !== currentUser?.id) {
        console.log('📖 [DEBUG] Current user read message from sender:', foundMessage.sender_id, '- clearing unread count');
        setUnreadCounts(prevCounts => {
          const newCounts = {
            ...prevCounts,
            [foundMessage.sender_id]: Math.max(0, (prevCounts[foundMessage.sender_id] || 0) - 1)
          };
          console.log('📖 [DEBUG] Updated unread counts after read receipt:', newCounts);
          return newCounts;
        });
      }
      
      return updated;
    });
  };
  const handleChatHistory = (data) => {
    const { room_id, messages } = data;
    
    console.log('📚 Loading chat history for room:', room_id, 'Messages:', messages.length);
    
    // Count unread messages FROM other users TO current user
    if (currentUser?.id) {
      const unreadMessages = messages.filter(msg => 
        msg.recipient_id === currentUser.id && 
        !msg.is_read &&
        msg.sender_id !== currentUser.id
      );
      
      console.log('🔔 [DEBUG] Processing chat history - found', unreadMessages.length, 'unread messages TO current user');
      
      // Group unread messages by sender
      const unreadBySender = {};
      unreadMessages.forEach(msg => {
        const senderId = msg.sender_id;
        unreadBySender[senderId] = (unreadBySender[senderId] || 0) + 1;
        console.log('🔔 [DEBUG] Unread message FROM user:', senderId, 'TO current user:', currentUser.id, 'message:', msg.message.substring(0, 20) + '...');
      });        // Update unread counts - but preserve cleared counts
      setUnreadCounts(prev => {
        const updated = { ...prev };
        Object.keys(unreadBySender).forEach(senderId => {
          const newCount = unreadBySender[senderId];
          const currentCount = prev[senderId] || 0;
          
          console.log(`🔔 [DEBUG] Chat history processing - senderId: ${senderId}, newCount: ${newCount}, currentCount: ${currentCount}`);
          console.log(`🔔 [DEBUG] User ${senderId} cleared status:`, clearedCounts.current[senderId] || false);
          
          // Don't overwrite if this user's count was explicitly cleared
          if (clearedCounts.current[senderId]) {
            console.log(`🔔 [DEBUG] Preserving CLEARED count for user ${senderId}: keeping at 0 (not overwriting with ${newCount})`);
          } else if (newCount > currentCount) {
            // Only update if the new count is higher than current count
            updated[senderId] = newCount;
            console.log('🔔 [DEBUG] Updated unread count FROM user:', senderId, 'TO current user - new count:', updated[senderId]);
          } else {
            console.log(`🔔 [DEBUG] Preserving current unread count for user ${senderId}: ${currentCount} (not overwriting with ${newCount})`);
          }
        });
        console.log('🔔 [DEBUG] Final unreadCounts after chat history:', updated);
        return updated;
      });
    }
    
    setChatRooms(prev => ({
      ...prev,
      [room_id]: {
        ...prev[room_id],
        messages: messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      }
    }));
      setIsLoading(false);
  };

  const handleUserChatRooms = (data) => {
    console.log('📂 [INIT] Received user chat rooms:', data);
    
    if (data.rooms && Array.isArray(data.rooms)) {
      // For each room, request its chat history to get unread messages
      data.rooms.forEach(room => {
        console.log('📂 [INIT] Loading history for room:', room.id);
        loadChatHistory(room.id);
      });
    }
  };

  // Add these function definitions before they are used
  const handleChatRoomCreated = (data) => {
    // Log the full payload for debugging
    console.log('🏠 DEBUG: chat_room_created payload received:', data);
    
    // Extract room data - server sends room_id instead of id
    const room = {
      id: data.room_id,
      name: data.name,
      participants: data.participants,
      room_type: data.chat_type
    };
    
    console.log('🏠 Room ID:', room?.id, 'Type:', typeof room?.id);
    console.log('🏠 Room participants:', room?.participants);
    
    if (!room || !room.id) {
      console.error('❌ Invalid room data received in chat_room_created:', data);
      if (window._pendingRoomCreation) {
        clearTimeout(window._pendingRoomCreation.timeout);
        window._pendingRoomCreation.reject(new Error('Invalid room data received from server'));
        delete window._pendingRoomCreation;
      }
      return;
    }
    
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
    
    // Don't immediately load chat history to avoid the error
    // loadChatHistory(room.id);
    
    // Try to match pending room creation by participants
    if (window._pendingRoomCreation) {
      const pending = window._pendingRoomCreation;
      console.log('🔍 Matching room creation:', {
        pendingParticipants: pending.participants,
        roomParticipants: room.participants
      });
      
      // Compare sorted participant IDs as strings
      const roomParticipantIds = (room.participants || []).map(p => p.id || p).sort((a, b) => a - b).map(String);
      const pendingParticipantIds = (pending.participants || []).map(String).sort();
      const isMatch = JSON.stringify(roomParticipantIds) === JSON.stringify(pendingParticipantIds);
      
      console.log('🔍 Participant match check:', {
        roomParticipantIds,
        pendingParticipantIds,
        isMatch
      });
      
      if (isMatch) {
        console.log('✅ Room creation matched, resolving promise with room ID:', room.id);
        clearTimeout(pending.timeout);
        pending.resolve(room.id);
        delete window._pendingRoomCreation;
      } else {
        console.warn('⚠️ Received chat_room_created for a different room than expected or no pending creation.', { 
          expected: pendingParticipantIds, 
          actual: roomParticipantIds 
        });
      }
    } else {
      console.warn('⚠️ No pending room creation found when room was created');
    }
  };

  const handleMessageSent = (message) => {
    // This confirms the message was processed by the backend.    // The message should already be in local state if optimistic updates are used,
    // or this can be used to add/update it.
    console.log('✅ Message successfully sent and processed by backend:', message);
    // Optionally, update message state here if not doing optimistic updates
    // For example, marking a message as 'sent' or updating its ID if it was provisional.
  };

  // When creating a chat room, store the sorted participants array for matching
  const createChatRoom = useCallback(async (userId, shouldOpenModal = true) => {
    console.log('>>> useChat createChatRoom - START'); // Log start
    console.log('>>> useChat createChatRoom - currentUser:', JSON.stringify(currentUser));
    console.log('>>> useChat createChatRoom - userId:', userId);
    console.log('>>> useChat createChatRoom - shouldOpenModal:', shouldOpenModal);

    if (!currentUser || !currentUser.id) {
      console.error('❌ Current user or currentUser.id is not available for creating chat room. currentUser:', currentUser);
      return Promise.reject(new Error('Current user not available.'));
    }
    if (userId === undefined || userId === null) { // More explicit check for userId
        console.error('❌ Target userId is not available (undefined or null) for creating chat room. userId:', userId);
        return Promise.reject(new Error('Target user ID not available.'));
    }

    if (!isConnected || !sendMessage) {
      console.error('❌ WebSocket not connected, cannot create chat room.');
      return Promise.reject(new Error('WebSocket not connected.'));
    }

    // Ensure IDs are numbers if possible, or handle nulls appropriately if backend expects them.
    // For now, assume backend handles non-numeric or null IDs if they are part of a valid list.
    const currentUserId = currentUser.id;
    const targetUserId = userId;

    const participantsArray = [currentUserId, targetUserId].sort((a, b) => {
      // Handle null/undefined robustly for sorting, though they should be caught by checks above.
      if (a === null || a === undefined) return 1; // Push nulls/undefined to the end
      if (b === null || b === undefined) return -1;
      return a - b;
    });

    console.log('>>> useChat createChatRoom - currentUserId:', currentUserId, 'targetUserId:', targetUserId);    console.log('>>> useChat createChatRoom - Constructed participantsArray:', JSON.stringify(participantsArray));
    console.log('>>> useChat createChatRoom - Current chatRooms:', Object.keys(chatRooms));
    console.log('>>> useChat createChatRoom - Checking existing rooms...');

    const existingRoomId = Object.keys(chatRooms).find(roomId => {
      const room = chatRooms[roomId];
      console.log('>>> Checking room:', roomId, 'participants:', room.participants);
      if (room.participants && room.participants.length === 2) {
        const roomParticipantIds = room.participants.map(p => p.id || p).sort((a,b) => a - b);
        console.log('>>> Room participant IDs:', roomParticipantIds, 'vs target:', participantsArray);
        // Ensure comparison is consistent, e.g. both are numbers or strings
        const match = String(roomParticipantIds[0]) === String(participantsArray[0]) && String(roomParticipantIds[1]) === String(participantsArray[1]);
        console.log('>>> Room match result:', match);
        return match;
      }
      return false;
    });

    console.log('>>> useChat createChatRoom - Existing room search result:', existingRoomId);    if (existingRoomId) {
      console.log('🚪 Existing room found:', existingRoomId, 'with participants:', chatRooms[existingRoomId].participants);
      if (shouldOpenModal) {
        setActiveRoom(existingRoomId);
      }
      return Promise.resolve(existingRoomId);
    }

    console.log('⏳ Creating chat room with participantsArray:', JSON.stringify(participantsArray));
    setOperationStatus('creating_room');
    
    const messagePayload = {
      type: 'create_chat_room',
      participants: participantsArray,
    };
    console.log('>>> useChat createChatRoom - messagePayload to be sent:', JSON.stringify(messagePayload));
    sendMessage(messagePayload);
    return new Promise((resolve, reject) => {
      const newRoomIdentifier = participantsArray.join('_'); // Define identifier here
      window._pendingRoomCreation = {
        resolve,
        reject,
        participants: participantsArray, // Store for matching
        identifier: newRoomIdentifier, // Store identifier for timeout check
        timeout: setTimeout(() => {
          console.error('❌ Chat room creation timed out.');
          setOperationStatus(null);
          if (window._pendingRoomCreation && window._pendingRoomCreation.identifier === newRoomIdentifier) {
            window._pendingRoomCreation.reject('Chat room creation timed out.');
            delete window._pendingRoomCreation;
          }
        }, 10000) // 10 seconds timeout
      };
    });
  }, [currentUser, isConnected, sendMessage, chatRooms]);

  const sendChatMessage = useCallback((roomId, content) => {
    if (!currentUser || !currentUser.id) {
      console.error('❌ Current user not available for sending message.');
      return;
    }
    if (!isConnected || !sendMessage) {
      console.error('❌ WebSocket not connected, cannot send message.');
      return;
    }
    if (!roomId || !content.trim()) {
      console.warn('⚠️ Cannot send empty message or message without room ID.');
      return;
    }
    
    const messagePayload = {
      type: 'send_message',
      room_id: roomId,
      message: content.trim(),
      sender_id: currentUser.id,
      // recipient_id can be determined by the backend from the room participants
    };    console.log('📤 Sending chat message:', messagePayload);
    const success = sendMessage(messagePayload);
    
    if (success) {
      console.log('✅ Message sent successfully via WebSocket');
      // Don't add to local state - wait for backend confirmation
    } else {
      console.error('❌ Failed to send chat message via WebSocket.');
      // Handle send failure (e.g., show error to user)
    }
  }, [currentUser, isConnected, sendMessage]);

  const sendTypingIndicator = useCallback((roomId, isTyping) => {
    if (!currentUser || !currentUser.id) return;
    if (!isConnected || !sendMessage) return;

    sendMessage({
      type: 'typing_indicator',
      room_id: roomId,
      user_id: currentUser.id,
      user_name: currentUser.username || 'User',
      is_typing: isTyping
    });
  }, [currentUser, isConnected, sendMessage]);

  const markMessageAsRead = useCallback((messageId) => {
    if (!currentUser || !currentUser.id) return;
    if (!isConnected || !sendMessage) return;

    sendMessage({
      type: 'read_receipt',
      message_id: messageId,
      reader_id: currentUser.id
    });
  }, [currentUser, isConnected, sendMessage]);

  const loadChatHistory = useCallback((roomId) => {
    if (!isConnected || !sendMessage) {
      console.warn('⚠️ WebSocket not connected, cannot load chat history.');
      return;
    }
    console.log('⏳ Loading chat history for room:', roomId);
    setIsLoading(true);
    sendMessage({
      type: 'get_chat_history',
      room_id: roomId
    });  }, [isConnected, sendMessage]);

  // Effect to load chat history when active room changes
  useEffect(() => {
    if (activeRoom) {
      console.log('🔄 Active room changed to:', activeRoom, '. Loading history...');
      loadChatHistory(activeRoom);
    } else {
      console.log('🔄 Active room is null. Not loading history.');
    }  }, [activeRoom, loadChatHistory]);
  
  // Clear unread count when activeRoom changes (user opens a chat) - BUT ONLY if chat modal is actually open
  useEffect(() => {
    // Do NOT clear unread counts just because a room becomes active
    // Only clear when user explicitly opens chat modal
    console.log('🔔 [DEBUG] activeRoom changed, but NOT clearing unread counts automatically. Room:', activeRoom);
  }, [activeRoom, currentUser, chatRooms]);
  
  // Clear unread count when opening a chat with a specific user
  const clearUnreadCount = useCallback((userId) => {
    console.log('🔔 [DEBUG] clearUnreadCount called - FROM user:', userId, 'TO current user.');
    
    // Mark this user's count as explicitly cleared
    clearedCounts.current[userId] = true;
    console.log('🔔 [DEBUG] Marked user', userId, 'as explicitly cleared. clearedCounts:', clearedCounts.current);
    
    setUnreadCounts(prev => {
      console.log('🔔 [DEBUG] Previous unread counts:', prev);
      console.log('🔔 [DEBUG] Previous count for user', userId, ':', prev[userId] || 0);
      
      const newCounts = {
        ...prev,
        [userId]: 0
      };
      console.log('🔔 [DEBUG] NEW unread counts after clearing user', userId, ':', newCounts);
      return newCounts;
    });
  }, []); // Removed unreadCounts dependency to avoid stale closure
  
  // Get unread count for a specific user (messages FROM that user TO current user)
  const getUnreadCount = useCallback((userId) => {
    const count = unreadCounts[userId] || 0;
    console.log('🔔 [DEBUG] getUnreadCount called for messages FROM user:', userId, 'TO current user, returning:', count, 'from unreadCounts:', unreadCounts);
    return count;
  }, [unreadCounts]);
  // Get total unread count across all users (total messages TO current user)
  const getTotalUnreadCount = useCallback(() => {
    const total = Object.values(unreadCounts).reduce((total, count) => total + count, 0);
    console.log('🔔 [DEBUG] getTotalUnreadCount called, returning total messages TO current user:', total, 'from unreadCounts:', unreadCounts);
    return total;
  }, [unreadCounts]);

  // Cleanup typing timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(typingTimeouts.current).forEach(clearTimeout);
    };
  }, []);

  return {
    chatRooms,
    activeRoom,
    setActiveRoom,
    typingUsers,
    isLoading,
    lastError, // Expose lastError
    operationStatus, // Expose operationStatus
    unreadCounts,
    clearUnreadCount,
    getUnreadCount,
    getTotalUnreadCount,
    createChatRoom,
    sendChatMessage,
    sendTypingIndicator,
    markMessageAsRead,
    loadChatHistory,
    isConnected // Expose connection status for UI updates
  };
};

export default useChat;
