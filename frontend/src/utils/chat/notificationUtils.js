/**
 * Chat notification utilities
 */

// Request notification permission
export const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
};

// Show desktop notification
export const showDesktopNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(`New message from ${message.sender_name}`, {
            body: message.content.length > 100 ? message.content.substring(0, 100) + '...' : message.content,
            icon: '/favicon.ico',
            tag: `message-${message.id}`,
            requireInteraction: false,
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        // Handle click to focus window
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
};

// Play notification sound
export const playNotificationSound = () => {
    try {
        // Create a simple notification sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error('Failed to play notification sound:', error);
    }
};
