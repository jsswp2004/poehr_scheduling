/**
 * Chat notifications hook
 */
import { useCallback, useEffect } from 'react';
import {
    requestNotificationPermission,
    showDesktopNotification,
    playNotificationSound
} from '../../utils/chat/notificationUtils';

export const useChatNotifications = (currentUser) => {
    // Request permission on mount
    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // Handle new message notification
    const handleNewMessageNotification = useCallback((message) => {
        // Don't notify for own messages
        if (message.sender_id === currentUser?.user_id) return;

        // Show desktop notification
        showDesktopNotification(message);

        // Play sound if window is not focused (with message ID for deduplication)
        if (document.hidden) {
            playNotificationSound(message.id);
        }
    }, [currentUser]);

    return {
        handleNewMessageNotification,
    };
};
