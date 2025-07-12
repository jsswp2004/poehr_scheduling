import { renderHook, act } from '@testing-library/react';
import { useChat } from '../chat/useChat';

// Mock the modular hooks
jest.mock('../chat/useChatData');
jest.mock('../chat/useChatTyping');
jest.mock('../chat/useChatNotifications');
jest.mock('../../utils/chat/chatUtils');

import { useChatData } from '../chat/useChatData';
import { useChatTyping } from '../chat/useChatTyping';
import { useChatNotifications } from '../chat/useChatNotifications';
import { initializeChatWithRetry } from '../../utils/chat/chatUtils';

describe('useChat Hook', () => {
    // Mock implementations
    const mockChatData = {
        conversations: [],
        messages: {},
        activeRoom: null,
        setActiveRoom: jest.fn(),
        setLastError: jest.fn(),
        unreadCounts: {},
        updateUnreadCount: jest.fn(),
    };

    const mockChatTyping = {
        typingUsers: {},
        isTyping: false,
        startTyping: jest.fn(),
        stopTyping: jest.fn(),
    };

    const mockChatNotifications = {
        notificationSound: true,
        playNotificationSound: jest.fn(),
        handleNewMessageNotification: jest.fn(),
    };

    const mockCurrentUser = {
        id: 1,
        username: 'testuser',
    };

    const mockWebsocketConnection = {
        send: jest.fn(),
        readyState: 1,
    };

    const mockSendMessage = jest.fn();

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock implementations
        useChatData.mockReturnValue(mockChatData);
        useChatTyping.mockReturnValue(mockChatTyping);
        useChatNotifications.mockReturnValue(mockChatNotifications);
        initializeChatWithRetry.mockResolvedValue(true);
    });

    describe('Initialization', () => {
        it('should initialize with loading state', () => {
            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            expect(result.current.chatSystemLoading).toBe(true);
        });

        it('should call initializeChatWithRetry on mount', async () => {
            renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            await act(async () => {
                // Wait for initialization to complete
            });

            expect(initializeChatWithRetry).toHaveBeenCalledWith(
                null,
                null,
                mockWebsocketConnection
            );
        });

        it('should set loading to false after successful initialization', async () => {
            initializeChatWithRetry.mockResolvedValue(true);

            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            await act(async () => {
                // Wait for initialization to complete
            });

            expect(result.current.chatSystemLoading).toBe(false);
        });

        it('should handle initialization failure', async () => {
            initializeChatWithRetry.mockResolvedValue(false);

            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            await act(async () => {
                // Wait for initialization to complete
            });

            expect(mockChatData.setLastError).toHaveBeenCalledWith('Failed to initialize chat system');
            expect(result.current.chatSystemLoading).toBe(false);
        });

        it('should handle initialization error', async () => {
            const error = new Error('Network error');
            initializeChatWithRetry.mockRejectedValue(error);

            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            await act(async () => {
                // Wait for initialization to complete
            });

            expect(mockChatData.setLastError).toHaveBeenCalledWith('Chat system initialization error');
            expect(result.current.chatSystemLoading).toBe(false);
        });
    });

    describe('Modular Hook Integration', () => {
        it('should integrate all modular hooks correctly', () => {
            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            // Should call all modular hooks
            expect(useChatData).toHaveBeenCalledWith(mockCurrentUser);
            expect(useChatTyping).toHaveBeenCalled();
            expect(useChatNotifications).toHaveBeenCalledWith(mockCurrentUser);

            // Should expose modular hook data
            expect(result.current.conversations).toBe(mockChatData.conversations);
            expect(result.current.messages).toBe(mockChatData.messages);
            expect(result.current.typingUsers).toBe(mockChatTyping.typingUsers);
            expect(result.current.notificationSound).toBe(mockChatNotifications.notificationSound);
        });
    });

    describe('WebSocket Integration', () => {
        it('should handle websocket connection changes', () => {
            const { rerender } = renderHook(
                ({ websocket }) => useChat(mockCurrentUser, websocket, mockSendMessage, null),
                { initialProps: { websocket: mockWebsocketConnection } }
            );

            // Change websocket connection
            const newWebsocket = { send: jest.fn(), readyState: 1 };
            rerender({ websocket: newWebsocket });

            // Should reinitialize with new websocket
            expect(initializeChatWithRetry).toHaveBeenCalledTimes(2);
        });
    });

    describe('Return Values', () => {
        it('should return all required properties and methods', async () => {
            const { result } = renderHook(() =>
                useChat(mockCurrentUser, mockWebsocketConnection, mockSendMessage, null)
            );

            await act(async () => {
                // Wait for initialization
            });

            // Check that all expected properties are returned
            const returnedProps = Object.keys(result.current);
            const expectedProps = [
                'chatSystemLoading',
                'operationStatus',
                'conversations',
                'messages',
                'activeRoom',
                'unreadCounts',
                'typingUsers',
                'isTyping',
                'notificationSound',
                'setActiveRoom',
                'updateUnreadCount',
                'startTyping',
                'stopTyping',
                'playNotificationSound',
                'handleNewMessageNotification',
                'initializeChatSystem'
            ];

            expectedProps.forEach(prop => {
                expect(returnedProps).toContain(prop);
            });
        });
    });
});
