/**
 * Main chat data management hook
 */
import { useState, useCallback } from 'react';
import { createRoomKey, sortMessagesByTimestamp } from '../../utils/chat/chatUtils';

export const useChatData = (currentUser) => {
    // Core chat state
    const [chatRooms, setChatRooms] = useState({});
    const [activeRoom, setActiveRoom] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastError, setLastError] = useState(null);

    // Get or create chat room
    const getOrCreateRoom = useCallback((targetUser) => {
        if (!currentUser || !targetUser) return null;

        const roomKey = createRoomKey(currentUser.user_id, targetUser.user_id);

        if (!chatRooms[roomKey]) {
            const newRoom = {
                id: roomKey,
                participants: [currentUser, targetUser],
                messages: [],
                lastActivity: new Date().toISOString(),
            };

            setChatRooms(prev => ({
                ...prev,
                [roomKey]: newRoom
            }));

            return newRoom;
        }

        return chatRooms[roomKey];
    }, [currentUser, chatRooms]);

    // Add message to room
    const addMessageToRoom = useCallback((roomKey, message) => {
        setChatRooms(prev => {
            const room = prev[roomKey];
            if (!room) return prev;

            const updatedMessages = [...room.messages, message];
            const sortedMessages = sortMessagesByTimestamp(updatedMessages);

            return {
                ...prev,
                [roomKey]: {
                    ...room,
                    messages: sortedMessages,
                    lastActivity: message.timestamp || new Date().toISOString(),
                }
            };
        });
    }, []);

    // Update unread count
    const updateUnreadCount = useCallback((userId, increment = true) => {
        setUnreadCounts(prev => ({
            ...prev,
            [userId]: increment
                ? (prev[userId] || 0) + 1
                : 0
        }));
    }, []);

    // Mark room as read
    const markRoomAsRead = useCallback((roomKey) => {
        const room = chatRooms[roomKey];
        if (!room) return;

        // Reset unread count for the other participant
        const otherParticipant = room.participants.find(p => p.user_id !== currentUser?.user_id);
        if (otherParticipant) {
            updateUnreadCount(otherParticipant.user_id, false);
        }
    }, [chatRooms, currentUser, updateUnreadCount]);

    // Get room messages
    const getRoomMessages = useCallback((roomKey) => {
        const room = chatRooms[roomKey];
        return room ? room.messages : [];
    }, [chatRooms]);

    // Get sorted rooms by last activity
    const getSortedRooms = useCallback(() => {
        return Object.values(chatRooms).sort((a, b) =>
            new Date(b.lastActivity) - new Date(a.lastActivity)
        );
    }, [chatRooms]);

    return {
        // State
        chatRooms,
        activeRoom,
        unreadCounts,
        isLoading,
        lastError,

        // Actions
        setActiveRoom,
        setIsLoading,
        setLastError,
        getOrCreateRoom,
        addMessageToRoom,
        updateUnreadCount,
        markRoomAsRead,
        getRoomMessages,
        getSortedRooms,
    };
};
