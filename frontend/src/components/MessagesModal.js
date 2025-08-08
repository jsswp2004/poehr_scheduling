import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    Box,
    TextField,
    Typography,
    Avatar,
    List,
    ListItem,
    ListItemButton,
    ListItemAvatar,
    ListItemText,
    IconButton,
    CircularProgress,
    Alert,
    Paper,
    Badge,
} from '@mui/material';
import {
    Send as SendIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { API_BASE_URL } from '../config/api';
import ChatConnectionStatus from './ChatConnectionStatus';
import { generateSafeKey } from '../utils/chat/idUtils';
import { createRoomKey } from '../utils/chat/chatUtils';

const MessagesModal = ({
    open,
    onClose,
    currentUser,
    teamMembers = [], // List of all team members
    onSendMessage,
    getRoomMessages,
    getTypingUsersForRoom,
    isLoading = false,
    connectionStatus = 'connected',
    operationStatus = null,
    chatError = null,
    onRetryConnection = null,
    getUserOnlineStatus,
    getUnreadCountForUser = () => 0,
    markRoomAsRead = null,
    getAllUnreadCount = () => 0,
}) => {
    const [selectedUser, setSelectedUser] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    // Helper functions for user display
    const getUserDisplayName = (user) => {
        if (!user) return 'Unknown User';
        return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Unknown User';
    };

    const getProfilePictureUrl = (user) => {
        if (!user?.profile_picture) return null;
        const baseUrl = API_BASE_URL.replace('/api', '');
        return user.profile_picture.startsWith('http')
            ? user.profile_picture
            : `${baseUrl}${user.profile_picture}`;
    };

    const getInitials = (user) => {
        if (!user) return '?';
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || user.username?.charAt(0).toUpperCase() || '?';
    };

    // Get messages for selected user
    const messages = useMemo(() => {
        if (!selectedUser || !getRoomMessages) return [];
        const currentId = currentUser?.user_id || currentUser?.id;
        const otherId = selectedUser?.user_id || selectedUser?.id;
        const roomKey = createRoomKey(currentId, otherId);
        return getRoomMessages(roomKey);
    }, [selectedUser, getRoomMessages, currentUser]);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Mark room as read when user is selected
    useEffect(() => {
        if (selectedUser && markRoomAsRead) {
            const currentId = currentUser?.user_id || currentUser?.id;
            const otherId = selectedUser?.user_id || selectedUser?.id;
            const roomKey = createRoomKey(currentId, otherId);
            console.log('🔢 MessagesModal: Marking room as read:', roomKey, 'for user:', selectedUser.id);
            markRoomAsRead(roomKey);
        }
    }, [selectedUser, markRoomAsRead, currentUser]);

    // Handle sending message
    const handleSendMessage = useCallback(async (e) => {
        e.preventDefault();
        if (!messageText.trim() || !selectedUser || !onSendMessage) return;

        try {
            await onSendMessage(selectedUser, messageText.trim());
            setMessageText('');
            setIsTyping(false);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }, [messageText, selectedUser, onSendMessage]);

    // Handle typing detection
    const handleInputChange = useCallback((e) => {
        setMessageText(e.target.value);

        if (!isTyping) {
            setIsTyping(true);
        }

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set new timeout to stop typing
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
        }, 1000);
    }, [isTyping]);

    // Clean up timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);

    // Filter team members who have conversations or unread messages
    const conversationList = useMemo(() => {
        if (!teamMembers || !Array.isArray(teamMembers)) return [];

        console.log('🔍 MessagesModal: Processing team members:', teamMembers);

        return teamMembers
            .filter(member => member.id !== currentUser?.id) // Exclude current user
            .map(member => {
                const unreadCount = getUnreadCountForUser(member.id);
                const currentId = currentUser?.user_id || currentUser?.id;
                const otherId = member?.user_id || member?.id;
                const roomKey = createRoomKey(currentId, otherId);
                const roomMessages = getRoomMessages ? getRoomMessages(roomKey) : [];
                const lastMessage = roomMessages[roomMessages.length - 1];

                console.log(`🔍 Member ${member.id} (${member.first_name} ${member.last_name}):`, {
                    unreadCount,
                    roomKey,
                    messageCount: roomMessages.length,
                    lastMessage
                });

                return {
                    ...member,
                    unreadCount,
                    lastMessage,
                    hasConversation: roomMessages.length > 0 || unreadCount > 0
                };
            })
            .sort((a, b) => {
                // Sort by: unread messages first, then by last message time, then alphabetically
                if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
                if (a.unreadCount === 0 && b.unreadCount > 0) return 1;

                if (a.lastMessage && b.lastMessage) {
                    return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
                }
                if (a.lastMessage && !b.lastMessage) return -1;
                if (!a.lastMessage && b.lastMessage) return 1;

                return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
            });
    }, [teamMembers, currentUser, getUnreadCountForUser, getRoomMessages]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    height: '80vh',
                    maxHeight: '600px',
                }
            }}
        >
            <DialogTitle sx={{ pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Messages</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ChatConnectionStatus status={connectionStatus} />
                        <IconButton onClick={onClose} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ p: 0, height: 'calc(100% - 64px)', display: 'flex' }}>
                {/* Left Pane - Conversations List */}
                <Box sx={{
                    width: 300,
                    borderRight: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Typography variant="subtitle2" sx={{ p: 2, fontWeight: 'bold' }}>
                        Conversations
                    </Typography>

                    <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
                        {conversationList.length === 0 ? (
                            <ListItem>
                                <ListItemText
                                    primary="No conversations yet"
                                    secondary="Start a conversation by selecting a team member"
                                    sx={{ textAlign: 'center' }}
                                />
                            </ListItem>
                        ) : (
                            conversationList.map((member) => (
                                <ListItemButton
                                    key={member.id}
                                    selected={selectedUser?.id === member.id}
                                    onClick={() => setSelectedUser(member)}
                                    sx={{
                                        borderBottom: 1,
                                        borderColor: 'divider',
                                        '&.Mui-selected': {
                                            bgcolor: 'action.selected',
                                        }
                                    }}
                                >
                                    <ListItemAvatar>
                                        <Badge
                                            badgeContent={member.unreadCount > 0 ? member.unreadCount : null}
                                            color="error"
                                        >
                                            <Avatar
                                                src={getProfilePictureUrl(member)}
                                                sx={{ width: 36, height: 36 }}
                                            >
                                                {getInitials(member)}
                                            </Avatar>
                                        </Badge>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: member.unreadCount > 0 ? 'bold' : 'normal',
                                                    color: member.unreadCount > 0 ? 'primary.main' : 'text.primary'
                                                }}
                                            >
                                                {getUserDisplayName(member)}
                                            </Typography>
                                        }
                                        secondary={
                                            member.lastMessage ? (
                                                <Typography variant="caption" color="textSecondary" noWrap>
                                                    {member.lastMessage.content.substring(0, 30)}
                                                    {member.lastMessage.content.length > 30 ? '...' : ''}
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" color="textSecondary">
                                                    {member.role || 'Team Member'}
                                                </Typography>
                                            )
                                        }
                                    />
                                </ListItemButton>
                            ))
                        )}
                    </List>
                </Box>

                {/* Right Pane - Chat Area */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {!selectedUser ? (
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'text.secondary'
                        }}>
                            <Typography variant="h6">
                                Select a conversation to start messaging
                            </Typography>
                        </Box>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <Box sx={{
                                p: 2,
                                borderBottom: 1,
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2
                            }}>
                                <Avatar
                                    src={getProfilePictureUrl(selectedUser)}
                                    sx={{ width: 32, height: 32 }}
                                >
                                    {getInitials(selectedUser)}
                                </Avatar>
                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                        {getUserDisplayName(selectedUser)}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                        {selectedUser.role || 'Team Member'}
                                    </Typography>
                                </Box>
                            </Box>

                            {/* Messages Area */}
                            <Box sx={{
                                flex: 1,
                                overflow: 'auto',
                                p: 1,
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {isLoading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                        <CircularProgress size={20} />
                                    </Box>
                                ) : chatError ? (
                                    <Alert severity="error" sx={{ m: 1 }}>
                                        {chatError}
                                        {onRetryConnection && (
                                            <IconButton onClick={onRetryConnection} size="small">
                                                Retry
                                            </IconButton>
                                        )}
                                    </Alert>
                                ) : messages.length === 0 ? (
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flex: 1,
                                        color: 'text.secondary'
                                    }}>
                                        <Typography>
                                            No messages yet. Start the conversation!
                                        </Typography>
                                    </Box>
                                ) : (
                                    messages.map((message) => (
                                        <Box
                                            key={generateSafeKey(message)}
                                            sx={{
                                                display: 'flex',
                                                justifyContent: message.sender_id === currentUser?.id ? 'flex-end' : 'flex-start',
                                                mb: 1,
                                            }}
                                        >
                                            <Paper
                                                elevation={1}
                                                sx={{
                                                    maxWidth: '70%',
                                                    p: 1.5,
                                                    bgcolor: message.sender_id === currentUser?.id ? 'primary.main' : 'grey.100',
                                                    color: message.sender_id === currentUser?.id ? 'primary.contrastText' : 'text.primary',
                                                }}
                                            >
                                                <Typography variant="body2">
                                                    {message.content}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        display: 'block',
                                                        mt: 0.5,
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    {formatDistanceToNow(new Date(message.timestamp))} ago
                                                </Typography>
                                            </Paper>
                                        </Box>
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </Box>

                            {/* Message Input */}
                            <Box
                                component="form"
                                onSubmit={handleSendMessage}
                                sx={{
                                    p: 2,
                                    borderTop: 1,
                                    borderColor: 'divider',
                                    display: 'flex',
                                    gap: 1,
                                }}
                            >
                                <TextField
                                    fullWidth
                                    placeholder="Type your message..."
                                    value={messageText}
                                    onChange={handleInputChange}
                                    variant="outlined"
                                    size="small"
                                    disabled={isLoading}
                                />
                                <IconButton
                                    type="submit"
                                    disabled={!messageText.trim() || isLoading}
                                    color="primary"
                                >
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </>
                    )}
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default MessagesModal;
