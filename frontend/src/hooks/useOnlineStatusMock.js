import { useState, useEffect, useCallback } from 'react';

// 🧪 TEMPORARY MOCK - For testing online indicators
// This simulates some users being online for testing purposes
const MOCK_ONLINE_USERS = {
  1: { is_online: true, last_seen: new Date().toISOString() },
  2: { is_online: true, last_seen: new Date().toISOString() },
  3: { is_online: false, last_seen: new Date(Date.now() - 300000).toISOString() }, // 5 min ago
  4: { is_online: true, last_seen: new Date().toISOString() },
  5: { is_online: false, last_seen: new Date(Date.now() - 3600000).toISOString() }, // 1 hour ago
  6: { is_online: true, last_seen: new Date().toISOString() },
  7: { is_online: true, last_seen: new Date().toISOString() },
  8: { is_online: false, last_seen: new Date(Date.now() - 1800000).toISOString() }, // 30 min ago
  9: { is_online: true, last_seen: new Date().toISOString() },
  10: { is_online: false, last_seen: new Date(Date.now() - 7200000).toISOString() }, // 2 hours ago
};

const useOnlineStatusMock = () => {
  const [onlineUsers, setOnlineUsers] = useState(MOCK_ONLINE_USERS);
  const [isConnected, setIsConnected] = useState(true); // Pretend we're connected

  // Simulate some users going online/offline periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineUsers(prev => {
        const newUsers = { ...prev };
        // Randomly toggle some users' online status
        const userIds = Object.keys(newUsers);
        const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
        
        if (newUsers[randomUserId]) {
          newUsers[randomUserId] = {
            ...newUsers[randomUserId],
            is_online: !newUsers[randomUserId].is_online,
            last_seen: new Date().toISOString()
          };
        }
        
        console.log(`🔄 Mock: User ${randomUserId} is now ${newUsers[randomUserId]?.is_online ? 'online' : 'offline'}`);
        return newUsers;
      });
    }, 5000); // Change status every 5 seconds

    return () => clearInterval(interval);
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

  // Mock refresh function
  const refreshOnlineUsers = useCallback(() => {
    console.log('🔄 Mock: Refreshing online users list');
    // In a real implementation, this would request fresh data
  }, []);

  return {
    onlineUsers,
    isConnected,
    getUserOnlineStatus,
    getOnlineUsersList,
    getOnlineUsersCount,
    refreshOnlineUsers
  };
};

export default useOnlineStatusMock;
