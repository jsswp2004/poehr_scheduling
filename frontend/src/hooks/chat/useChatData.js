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

    // Helper: compare two messages for near-duplicate equality
    const messagesAreSimilar = (a, b) => {
        if (!a || !b) return false;
        if (a.id && b.id && a.id === b.id) return true;
        try {
            const tsA = new Date(a.timestamp).getTime();
            const tsB = new Date(b.timestamp).getTime();
            const within5s = Math.abs(tsA - tsB) < 5000;
            return (
                a.content === b.content &&
                a.sender_id === b.sender_id &&
                within5s
            );
        } catch (_) {
            return (
                a.content === b.content &&
                a.sender_id === b.sender_id
            );
        }
    };

    // Check if a message would be a duplicate for a room (uses current state via ref)
    const isDuplicateMessage = useCallback((roomKey, message) => {
        const currentRooms = chatRoomsRef.current || {};
        let room = currentRooms[roomKey];

        // Try alternate key (room_B_A) for legacy/alternate key forms
        if (!room && roomKey.startsWith('room_')) {
            const parts = roomKey.split('_');
            if (parts.length === 3) {
                const altKey = `room_${parts[2]}_${parts[1]}`;
                room = currentRooms[altKey];
            }
        }

        if (!room || !Array.isArray(room.messages)) return false;
        return room.messages.some((m) => messagesAreSimilar(m, message));
    }, []);

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
            }
            // Check if message already exists to prevent duplicates
            const messageExists = room.messages.some(existingMessage =>
                messagesAreSimilar(existingMessage, message)
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
        setUnreadCounts(prev => {
            const newCounts = {
                ...prev,
                [userId]: increment
                    ? (prev[userId] || 0) + 1
                    : 0
            };
            return newCounts;
        });
    }, []);

    // Mark room as read
    const markRoomAsRead = useCallback((roomKey) => {
        const room = chatRoomsRef.current[roomKey];
        if (!room) {
            return;
        }

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
        isDuplicateMessage,
        updateUnreadCount,
        markRoomAsRead,
        getRoomMessages,
        getSortedRooms,
    };
};
