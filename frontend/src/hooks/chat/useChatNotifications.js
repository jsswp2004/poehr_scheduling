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

    // Handle offline messages notification
    const handleOfflineMessagesNotification = useCallback((count) => {
        if (count > 0) {
            const title = '💬 Missed Messages';
            const body = `You have ${count} unread message${count > 1 ? 's' : ''} waiting for you.`;

            // Show desktop notification
            if (Notification.permission === 'granted') {
                new Notification(title, {
                    body: body,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: 'offline-messages', // Prevent duplicate notifications
                });
            }

            // Play notification sound
            playNotificationSound('offline-messages');

            console.log(`📬 Offline message notification: ${count} messages`);
        }
    }, []);

    return {
        handleNewMessageNotification,
        handleOfflineMessagesNotification,
    };
};
