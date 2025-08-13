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
import axios from 'axios';
import { getValidToken } from '../utils/auth';
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
    const [searchQuery, setSearchQuery] = useState('');
    const [allTeamMembers, setAllTeamMembers] = useState([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [teamMembersFetched, setTeamMembersFetched] = useState(false); // Add flag to prevent re-fetching
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const markedAsReadRef = useRef(new Set()); // Track which rooms we've already marked as read

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

    // Mark room as read when user is selected - with deduplication to prevent loops
    useEffect(() => {
        if (selectedUser && markRoomAsRead) {
            const currentId = currentUser?.user_id || currentUser?.id;
            const otherId = selectedUser?.user_id || selectedUser?.id;
            const roomKey = createRoomKey(currentId, otherId);
            
            // Only mark as read if we haven't already done so for this room
            if (!markedAsReadRef.current.has(roomKey)) {
                console.log('🔢 MessagesModal: Marking room as read:', roomKey, 'for user:', selectedUser.id);
                markedAsReadRef.current.add(roomKey);
                markRoomAsRead(roomKey);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUser, currentUser]); // Intentionally excluding markRoomAsRead to prevent loops

    // Handle sending message
    // Fetch full team list (paginated) when modal opens - ONLY ONCE
    useEffect(() => {
        const fetchAllTeamMembers = async () => {
            // Prevent multiple fetches
            if (teamMembersFetched || loadingMembers) {
                console.log('🚫 Skipping team fetch - already fetched or loading');
                return;
            }

            setLoadingMembers(true);
            setTeamMembersFetched(true); // Set flag early to prevent race conditions
            
            try {
                const token = await getValidToken();
                if (!token) {
                    setLoadingMembers(false);
                    return;
                }

                console.log('📥 Fetching team members...');
                const firstUrl = `${API_BASE_URL}/api/users/team/?page_size=100`;
                const results = [];
                let nextUrl = firstUrl;

                while (nextUrl) {
                    const res = await axios.get(nextUrl, {
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    const data = res.data;
                    const pageResults = (data.results || data) // support both paginated and full arrays
                        .map(u => ({
                            ...u,
                            full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown User',
                        }));
                    results.push(...pageResults);

                    nextUrl = data.next || null;
                }
                console.log('✅ Team members fetched:', results.length);
                setAllTeamMembers(results);
            } catch (e) {
                console.error('Failed to fetch full team list:', e);
                setTeamMembersFetched(false); // Reset flag on error so it can retry
            } finally {
                setLoadingMembers(false);
            }
        };

        if (open && !teamMembersFetched) {
            fetchAllTeamMembers();
        }
    }, [open, teamMembersFetched, loadingMembers]);

    // Reset fetch flag when modal closes
    useEffect(() => {
        if (!open) {
            setTeamMembersFetched(false);
            setAllTeamMembers([]);
            markedAsReadRef.current.clear(); // Clear marked as read tracking
        }
    }, [open]);

    const handleSendMessage = useCallback(async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!messageText.trim()) {
            console.warn('⚠️ handleSendMessage: empty message');
            return;
        }
        if (!selectedUser) {
            console.warn('⚠️ handleSendMessage: no selectedUser');
            return;
        }
        if (!onSendMessage) {
            console.error('❌ handleSendMessage: onSendMessage not provided');
            return;
        }

        try {
            console.log('📤 MessagesModal sending message:', { to: selectedUser, content: messageText.trim() });
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

    // Source of truth: use full team if available, else fallback to prop
    const teamListSource = useMemo(() => {
        const base = Array.isArray(allTeamMembers) && allTeamMembers.length > 0 ? allTeamMembers : (teamMembers || []);
        // Exclude current user
        return base.filter(m => (m.id || m.user_id) !== (currentUser?.id || currentUser?.user_id));
    }, [allTeamMembers, teamMembers, currentUser]);

    // Filter team members by search and map conversation info
    const conversationList = useMemo(() => {
        const search = (searchQuery || '').toLowerCase();
        const filtered = teamListSource.filter(member => {
            if (!search) return true;
            const first = (member.first_name || '').toLowerCase();
            const last = (member.last_name || '').toLowerCase();
            const user = (member.username || '').toLowerCase();
            const full = (member.full_name || `${member.first_name || ''} ${member.last_name || ''}`).toLowerCase();
            return first.includes(search) || last.includes(search) || user.includes(search) || full.includes(search);
        });

        console.log('🔍 MessagesModal: Processing team members:', filtered);

        return filtered
            .map(member => {
                const memberId = member.id || member.user_id;
                
                return {
                    ...member,
                    id: memberId,
                    // We'll compute unread counts and messages outside of useMemo
                    hasConversation: false // Placeholder
                };
            })
            .sort((a, b) => {
                // Simple alphabetical sort for now
                return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
            });
    }, [teamListSource, searchQuery]);

    // Compute conversation data separately to avoid infinite loops
    const conversationListWithData = useMemo(() => {
        console.log('🔄 conversationListWithData useMemo triggered, deps:', {
            conversationListLength: conversationList.length,
            hasGetUnreadCountForUser: !!getUnreadCountForUser,
            hasGetRoomMessages: !!getRoomMessages,
            currentUserId: currentUser?.user_id || currentUser?.id
        });
        
        if (!getUnreadCountForUser || !getRoomMessages || conversationList.length === 0) {
            return conversationList;
        }

        return conversationList.map(member => {
            const memberId = member.id;
            const unreadCount = getUnreadCountForUser(memberId);
            const currentId = currentUser?.user_id || currentUser?.id;
            const otherId = member?.user_id || member?.id;
            const roomKey = createRoomKey(currentId, otherId);
            const roomMessages = getRoomMessages(roomKey) || [];
            const lastMessage = roomMessages[roomMessages.length - 1];

            return {
                ...member,
                unreadCount,
                lastMessage,
                hasConversation: roomMessages.length > 0 || unreadCount > 0
            };
        }).sort((a, b) => {
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
    }, [conversationList, getUnreadCountForUser, getRoomMessages, currentUser?.user_id, currentUser?.id]);

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
                        <ChatConnectionStatus connectionStatus={connectionStatus} />
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

                    {/* Search input for team members */}
                    <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search team members..."
                            size="small"
                            fullWidth
                        />
                        {loadingMembers && <CircularProgress size={18} />}
                    </Box>

                    <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
                        {conversationListWithData.length === 0 ? (
                            <ListItem>
                                <ListItemText
                                    primary="No conversations yet"
                                    secondary="Start a conversation by selecting a team member"
                                    sx={{ textAlign: 'center' }}
                                />
                            </ListItem>
                        ) : (
                            conversationListWithData.map((member) => (
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
                                                    position: 'relative',
                                                }}
                                            >
                                                {/* Offline message indicator */}
                                                {message.offline && (
                                                    <Box
                                                        sx={{
                                                            position: 'absolute',
                                                            top: -8,
                                                            right: -8,
                                                            bgcolor: 'warning.main',
                                                            color: 'warning.contrastText',
                                                            borderRadius: '50%',
                                                            width: 16,
                                                            height: 16,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '10px',
                                                            fontWeight: 'bold',
                                                        }}
                                                        title="Received while you were offline"
                                                    >
                                                        📧
                                                    </Box>
                                                )}
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
                                                    {message.offline && (
                                                        <span style={{ fontStyle: 'italic', marginLeft: 4 }}>
                                                            (while offline)
                                                        </span>
                                                    )}
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
                                    onClick={handleSendMessage}
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
