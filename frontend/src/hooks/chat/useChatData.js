/**
 * Main chat data management hook
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { createRoomKey, sortMessagesByTimestamp } from '../../utils/chat/chatUtils';

export const useChatData = (currentUser) => {
    // Core chat state
    const [chatRooms, setChatRooms] = useState({});
    const [activeRoom, setActiveRoom] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [lastError, setLastError] = useState(null);

    // Use ref to track current chatRooms state without causing dependency issues
    const chatRoomsRef = useRef(chatRooms);

    // Update ref whenever chatRooms changes
    useEffect(() => {
        chatRoomsRef.current = chatRooms;
    }, [chatRooms]);

    // Get or create chat room
    const getOrCreateRoom = useCallback((targetUser) => {
        console.log('🔍 getOrCreateRoom called with:', {
            currentUser: currentUser ? `${currentUser.first_name} ${currentUser.last_name} (ID: ${currentUser.user_id})` : 'null',
            targetUser: targetUser ? `${targetUser.first_name || 'No first_name'} ${targetUser.last_name || 'No last_name'} (ID: ${targetUser.user_id})` : 'null'
        });

        if (!currentUser || !targetUser) {
            console.error('❌ getOrCreateRoom: Missing user data', { currentUser, targetUser });
            return null;
        }

        const roomKey = createRoomKey(currentUser.user_id, targetUser.user_id);
        console.log('🔑 Generated room key:', roomKey);

        // Check if room already exists using ref (current state)
        if (chatRoomsRef.current[roomKey]) {
            console.log('✅ Room already exists:', chatRoomsRef.current[roomKey]);
            return chatRoomsRef.current[roomKey];
        }

        // Create new room
        const newRoom = {
            id: roomKey,
            participants: [currentUser, targetUser],
            messages: [],
            lastActivity: new Date().toISOString(),
        };

        console.log('🆕 Creating new room:', newRoom);

        // Update state with new room
        setChatRooms(prev => ({
            ...prev,
            [roomKey]: newRoom
        }));

        return newRoom;
    }, [currentUser]);

    // Add message to room (with deduplication)
    const addMessageToRoom = useCallback((roomKey, message) => {
        setChatRooms(prev => {
            const room = prev[roomKey];
            if (!room) return prev;

            // Check if message already exists to prevent duplicates
            const messageExists = room.messages.some(existingMessage =>
                existingMessage.id === message.id ||
                (existingMessage.content === message.content &&
                    existingMessage.sender_id === message.sender_id &&
                    Math.abs(new Date(existingMessage.timestamp) - new Date(message.timestamp)) < 5000) // Within 5 seconds
            );

            if (messageExists) {
                console.log('⚠️ Duplicate message detected, skipping:', message.id);
                return prev;
            }

            console.log('✅ Adding new message to room:', roomKey, message.id);
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
        const room = chatRoomsRef.current[roomKey];
        if (!room) return;

        // Reset unread count for the other participant
        const otherParticipant = room.participants.find(p => p.user_id !== currentUser?.user_id);
        if (otherParticipant) {
            updateUnreadCount(otherParticipant.user_id, false);
        }
    }, [currentUser, updateUnreadCount]);

    // Get room messages
    const getRoomMessages = useCallback((roomKey) => {
        // This is safe because we're not modifying state, just reading
        return chatRooms[roomKey]?.messages || [];
    }, [chatRooms]);

    // Get sorted rooms by last activity
    const getSortedRooms = useCallback(() => {
        // This is safe because we're not modifying state, just reading
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
