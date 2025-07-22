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
        const currentUserId = currentUser?.user_id || currentUser?.id;
        const targetUserId = targetUser?.user_id || targetUser?.id;

        if (!currentUser || !targetUser || !currentUserId || !targetUserId) {
            console.error('❌ getOrCreateRoom: Missing user data', { currentUser, targetUser, currentUserId, targetUserId });
            return null;
        }

        const roomKey = createRoomKey(currentUserId, targetUserId);

        // Check if room already exists using ref (current state)
        if (chatRoomsRef.current[roomKey]) {
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

    // Add message to room (with deduplication and auto-room creation)
    const addMessageToRoom = useCallback((roomKey, message) => {
        setChatRooms(prev => {
            let room = prev[roomKey];

            // If room doesn't exist, create it automatically
            if (!room) {
                // Extract participant information from message and current user
                const currentUserId = currentUser?.user_id || currentUser?.id;
                const otherUserId = message.sender_id === currentUserId ? message.receiver_id : message.sender_id;

                if (!currentUserId || !otherUserId) {
                    console.error('❌ Cannot create room - missing user IDs:', { currentUserId, otherUserId, message });
                    return prev;
                }

                // Create a minimal room structure
                // We'll need to get the full user object later when the chat modal opens
                room = {
                    id: roomKey,
                    participants: [
                        currentUser,
                        {
                            id: otherUserId,
                            user_id: otherUserId,
                            first_name: message.sender_name?.split(' ')[0] || 'Unknown',
                            last_name: message.sender_name?.split(' ').slice(1).join(' ') || 'User'
                        }
                    ],
                    messages: [],
                    lastActivity: new Date().toISOString(),
                };
            }            // Check if message already exists to prevent duplicates
            const messageExists = room.messages.some(existingMessage =>
                existingMessage.id === message.id ||
                (existingMessage.content === message.content &&
                    existingMessage.sender_id === message.sender_id &&
                    Math.abs(new Date(existingMessage.timestamp) - new Date(message.timestamp)) < 5000) // Within 5 seconds
            );

            if (messageExists) {
                return prev;
            }

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
    }, [currentUser]);

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

        const currentUserId = currentUser?.user_id || currentUser?.id;
        // Reset unread count for the other participant
        const otherParticipant = room.participants.find(p => {
            const participantId = p.user_id || p.id;
            return participantId !== currentUserId;
        });
        if (otherParticipant) {
            const otherParticipantId = otherParticipant.user_id || otherParticipant.id;
            updateUnreadCount(otherParticipantId, false);
        }
    }, [currentUser, updateUnreadCount]);

    // Get room messages with duplicate room consolidation
    const getRoomMessages = useCallback((roomKey) => {
        let messages = chatRooms[roomKey]?.messages || [];

        // Check for potential duplicate rooms with different key formats
        // This handles legacy messages that might have been stored with different room key logic
        if (roomKey.startsWith('room_')) {
            const [, id1, id2] = roomKey.split('_');
            const alternateRoomKey = `room_${id2}_${id1}`;

            if (alternateRoomKey !== roomKey && chatRooms[alternateRoomKey]) {
                // Merge messages from both rooms
                const alternateMessages = chatRooms[alternateRoomKey].messages || [];
                const allMessages = [...messages, ...alternateMessages];

                // Remove duplicates and sort by timestamp
                const uniqueMessages = allMessages.filter((message, index, array) =>
                    array.findIndex(m =>
                        m.id === message.id ||
                        (m.content === message.content &&
                            m.sender_id === message.sender_id &&
                            Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 5000)
                    ) === index
                );

                messages = sortMessagesByTimestamp(uniqueMessages);


            }
        }

        return messages;
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
