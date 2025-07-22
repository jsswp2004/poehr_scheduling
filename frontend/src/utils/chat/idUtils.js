/**
 * Utility functions for generating unique IDs in chat system
 */

/**
 * Generate a unique ID for chat messages
 * Combines timestamp with random string to ensure uniqueness
 * @returns {string} Unique ID string
 */
export const generateUniqueMessageId = () => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substr(2, 9);
    return `msg-${timestamp}-${randomString}`;
};

/**
 * Generate a unique ID for chat rooms
 * @param {number} userId1 First user ID
 * @param {number} userId2 Second user ID
 * @returns {string} Unique room ID
 */
export const generateRoomId = (userId1, userId2) => {
    const sortedIds = [userId1, userId2].sort((a, b) => a - b);
    return `room-${sortedIds[0]}-${sortedIds[1]}`;
};

/**
 * Generate a safe React key for list items
 * @param {Object} item The item being rendered
 * @param {number} index The array index
 * @param {string} prefix Optional prefix for the key
 * @returns {string} Safe React key
 */
export const generateSafeKey = (item, index, prefix = 'item') => {
    let key;
    if (item.id) {
        key = `${prefix}-${item.id}`;
    } else if (item.timestamp) {
        key = `${prefix}-${item.timestamp}-${index}`;
    } else {
        key = `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }

    console.log('🔑 Generated key:', key, 'for item:', item);
    return key;
};
