/**
 * Chat typing indicators hook
 */
import { useState, useCallback, useRef } from 'react';

export const useChatTyping = () => {
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeouts = useRef({});

  // Handle typing start
  const handleTypingStart = useCallback((userId, userName) => {
    setTypingUsers(prev => ({
      ...prev,
      [userId]: userName
    }));

    // Clear existing timeout
    if (typingTimeouts.current[userId]) {
      clearTimeout(typingTimeouts.current[userId]);
    }

    // Set timeout to clear typing indicator
    typingTimeouts.current[userId] = setTimeout(() => {
      setTypingUsers(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
      delete typingTimeouts.current[userId];
    }, 3000); // Clear after 3 seconds of inactivity
  }, []);

  // Handle typing stop
  const handleTypingStop = useCallback((userId) => {
    if (typingTimeouts.current[userId]) {
      clearTimeout(typingTimeouts.current[userId]);
      delete typingTimeouts.current[userId];
    }

    setTypingUsers(prev => {
      const updated = { ...prev };
      delete updated[userId];
      return updated;
    });
  }, []);

  // Get typing users for a room
  const getTypingUsersForRoom = useCallback((roomKey, excludeUserId) => {
    return Object.entries(typingUsers)
      .filter(([userId]) => userId !== excludeUserId?.toString())
      .map(([userId, userName]) => ({ userId, userName }));
  }, [typingUsers]);

  // Clear all typing indicators
  const clearAllTyping = useCallback(() => {
    Object.values(typingTimeouts.current).forEach(timeout => clearTimeout(timeout));
    typingTimeouts.current = {};
    setTypingUsers({});
  }, []);

  return {
    typingUsers,
    handleTypingStart,
    handleTypingStop,
    getTypingUsersForRoom,
    clearAllTyping,
  };
};
