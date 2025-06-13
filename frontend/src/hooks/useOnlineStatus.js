import { useState, useEffect, useCallback } from 'react';
import useWebSocket from './useWebSocket';

const useOnlineStatus = () => {
  const [onlineUsers, setOnlineUsers] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  // WebSocket connection for presence updates
  const { isConnected: wsConnected, sendMessage, socket, lastMessage } = useWebSocket( // Added lastMessage
    'ws://localhost:8001/ws/presence/',
    {
      onOpen: () => {
        console.log('✅ Connected to presence WebSocket');
        setIsConnected(true);
        
        // Request initial online users list
        sendMessage({
          type: 'get_online_users'
        });
      },
      onClose: () => {
        console.log('🔌 Disconnected from presence WebSocket');
        setIsConnected(false);
      },
      onMessage: (data) => {
        handleWebSocketMessage(data);
      },
      onError: (error) => {
        console.error('❌ Presence WebSocket error:', error);
        setIsConnected(false);
      },
      maxReconnectAttempts: 5,
      reconnectInterval: 3000
    }
  );

  const handleWebSocketMessage = useCallback((data) => {
    switch (data.type) {
      case 'user_status_update':
        // Update specific user\'s online status
        setOnlineUsers(prev => ({
          ...prev,
          [data.user_id]: {
            is_online: data.is_online,
            last_seen: data.last_seen
          }
        }));
        break;
        
      case 'online_users_list':
        // Update the entire online users list
        console.log('🟢 Received online_users_list:', data.users);
        const usersMap = {};
        data.users.forEach(user => {
          usersMap[user.id] = {
            is_online: user.is_online,
            last_seen: user.last_seen,
            user_data: user
          };
        });
        setOnlineUsers(usersMap);
        break;
        
      case 'heartbeat_response':
        // Handle heartbeat response if needed
        break;
        
      default:
        console.log('🔄 Received unknown message type in useOnlineStatus:', data.type, data);
    }
  }, []);
  // Get online status for a specific user
  const getUserOnlineStatus = useCallback((userId) => {
    const userStatus = onlineUsers[userId];
    return {
      isOnline: userStatus?.is_online || false,
      lastSeen: userStatus?.last_seen || null
    };
  }, [onlineUsers]);

  // Get list of all online users
  const getOnlineUsersList = useCallback(() => {
    return Object.entries(onlineUsers)
      .filter(([_, status]) => status.is_online)
      .map(([userId, status]) => ({
        userId: parseInt(userId),
        ...status
      }));
  }, [onlineUsers]);

  // Get count of online users
  const getOnlineUsersCount = useCallback(() => {
    return Object.values(onlineUsers).filter(status => status.is_online).length;
  }, [onlineUsers]);

  // Request updated online users list
  const refreshOnlineUsers = useCallback(() => {
    if (isConnected && sendMessage) {
      sendMessage({
        type: 'get_online_users'
      });
    }
  }, [isConnected, sendMessage]);

  // Update connection status based on WebSocket state
  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  console.log('🟢 useOnlineStatus socket:', socket);
  console.log('📨 useOnlineStatus lastMessage:', lastMessage); // Log the last message

  return {
    onlineUsers,
    isConnected,
    getUserOnlineStatus,
    getOnlineUsersList,
    getOnlineUsersCount,
    refreshOnlineUsers,
    websocketConnection: socket,
    sendMessage,
    lastMessage // Expose lastMessage
  };
};

export default useOnlineStatus;
