import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  TextField,
  Button,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  IconButton,
  Chip,
  InputAdornment,
  CircularProgress,
  Divider,
  Alert,
  Paper,
  Badge
} from '@mui/material';
import {
  Send as SendIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import ChatConnectionStatus from './ChatConnectionStatus';
import { generateSafeKey } from '../utils/chat/idUtils';
import { createRoomKey } from '../utils/chat/chatUtils';

const ChatModal = ({
  open,
  onClose,
  currentUser,
  teamMembers = [], // List of all team members
  onSendMessage,
  onStartChat,
  getRoomMessages,
  getTypingUsersForRoom,
  isLoading = false,
  connectionStatus = 'connected',
  operationStatus = null,
  chatError = null,
  onRetryConnection = null,
  getUserOnlineStatus,
  getUnreadCount = () => 0,
  onDeleteOfflineMessage = null
}) => {
  const [messageText, setMessageText] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Get filtered users based on search
  const filteredUsers = teamMembers.filter(user => {
    if (user.id === currentUser?.id) return false; // Don't show current user
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const searchTerm = userSearch.toLowerCase();
    return fullName.toLowerCase().includes(searchTerm) ||
      (user.username || '').toLowerCase().includes(searchTerm);
  });

  // Get messages for selected user
  const messages = selectedUser && getRoomMessages ? (() => {
    const roomKey = createRoomKey(currentUser, selectedUser);
    return getRoomMessages(roomKey);
  })() : [];

  // Get typing users for selected user
  const typingUsers = selectedUser && getTypingUsersForRoom ?
    getTypingUsersForRoom(createRoomKey(currentUser, selectedUser)) : [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset message input when user changes
  useEffect(() => {
    setMessageText('');
    handleStopTyping();
  }, [selectedUser]);


  // Clear search when modal closes
  useEffect(() => {
    if (!open) {
      setUserSearch('');
      setSelectedUser(null);
      setMessageText('');
    }
  }, [open]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (messageText && messageText.trim() && selectedUser) {
      const recipientId = selectedUser.id || selectedUser.user_id;
      try {
        // Pass the selectedUser object instead of just recipientId to match useChat expectation
        onSendMessage(selectedUser, messageText.trim());
        setMessageText('');
        handleStopTyping();
      } catch (error) {
        console.error('❌ Error in handleSendMessage:', error);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e) => {
    setMessageText(e.target.value);

    // Handle typing indicators
    if (!isTyping) {
      setIsTyping(true);
      // Emit typing start event here
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(handleStopTyping, 2000);
  };

  const handleStopTyping = () => {
    if (isTyping) {
      setIsTyping(false);
      // Emit typing stop event here
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const getMessageTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'just now';
    }
  };

  const isOwnMessage = (message) => {
    return message.sender_id === currentUser?.id;
  };

  const getInitials = (user) => {
    if (!user) return 'U';
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'U';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserDisplayName = (user) => {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Unknown User';
  };

  const getProfilePictureUrl = (user) => {
    if (!user?.profile_picture) return undefined;
    
    return user.profile_picture.startsWith("http")
      ? user.profile_picture
      : `http://127.0.0.1:8000${user.profile_picture}`;
  };

  const isUserOnline = (user) => {
    const userId = user?.id || user?.user_id || user;
    if (!getUserOnlineStatus) {
      return false;
    }
    const status = getUserOnlineStatus(userId);
    if (typeof status === 'object') {
      return status.isOnline;
    }
    return !!status;
  };

  const getUserUnreadCount = (user) => {
    return getUnreadCount ? getUnreadCount(user.id) : 0;
  };

  const handleDeleteOfflineMessages = () => {
    if (selectedUser && onDeleteOfflineMessage) {
      onDeleteOfflineMessage(selectedUser);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">Team Chat</Typography>
          <ChatConnectionStatus connectionStatus={connectionStatus} />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Error Alert */}
      {chatError && (
        <Alert severity="error" sx={{ m: 2 }}>
          {typeof chatError === 'string' ? chatError : 'Chat system error occurred.'}
        </Alert>
      )}

      {/* Main Content */}
      <DialogContent sx={{ p: 0, flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', width: '100%', height: '100%' }}>
          {/* Left Pane - Users List */}
          <Paper
            sx={{
              width: '300px',
              borderRadius: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Search */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search team members..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Users List */}
            <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {filteredUsers.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {userSearch ? 'No users found' : 'No team members available'}
                  </Typography>
                </Box>
              ) : (
                filteredUsers.map((user) => {
                  const isOnline = isUserOnline(user);
                  const unreadCount = getUserUnreadCount(user);
                  const isSelected = selectedUser?.id === user.id;

                  return (
                    <ListItemButton
                      key={user.id}
                      selected={isSelected}
                      onClick={() => {
                        setSelectedUser(user);
                        if (onStartChat) {
                          onStartChat(user);
                        }
                      }}
                      sx={{
                        px: 2,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <ListItemAvatar>
                        <Badge
                          overlap="circular"
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                          badgeContent={
                            <CircleIcon
                              sx={{
                                width: 12,
                                height: 12,
                                color: isOnline ? '#4caf50' : '#bdbdbd'
                              }}
                            />
                          }
                        >
                          <Avatar
                            src={getProfilePictureUrl(user)}
                            sx={{
                              width: 40,
                              height: 40,
                              bgcolor: user?.profile_picture ? 'transparent' : (isOnline ? 'primary.main' : 'grey.400')
                            }}
                          >
                            {!user?.profile_picture && getInitials(user)}
                          </Avatar>
                        </Badge>
                      </ListItemAvatar>
                      <ListItemText
                        primary={getUserDisplayName(user)}
                        secondary={isOnline ? 'Online' : 'Offline'}
                        sx={{
                          '& .MuiListItemText-primary': {
                            fontWeight: unreadCount > 0 ? 'bold' : 'normal'
                          }
                        }}
                      />
                      {unreadCount > 0 && (
                        <Chip
                          label={unreadCount}
                          size="small"
                          color="error"
                          sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
                        />
                      )}
                    </ListItemButton>
                  );
                })
              )}
            </List>
          </Paper>

          {/* Right Pane - Chat */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!selectedUser ? (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 2,
                  color: 'text.secondary'
                }}
              >
                <Typography variant="h6">Select a team member to start chatting</Typography>
                <Typography variant="body2">Choose someone from the list on the left</Typography>
              </Box>
            ) : (
              <>
                {/* Chat Header */}
                <Box
                  sx={{
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <Badge
                    overlap="circular"
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    badgeContent={
                      <CircleIcon
                        sx={{
                          width: 12,
                          height: 12,
                          color: isUserOnline(selectedUser) ? '#4caf50' : '#bdbdbd'
                        }}
                      />
                    }
                  >
                    <Avatar
                      src={getProfilePictureUrl(selectedUser)}
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: selectedUser?.profile_picture ? 'transparent' : 'primary.main'
                      }}
                    >
                      {!selectedUser?.profile_picture && getInitials(selectedUser)}
                    </Avatar>
                  </Badge>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {getUserDisplayName(selectedUser)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isUserOnline(selectedUser) ? 'Online' : 'Offline'}
                    </Typography>
                  </Box>
                </Box>

                {/* Messages Area */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                  {isLoading ? (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flex: 1,
                        flexDirection: 'column',
                        gap: 2
                      }}
                    >
                      <CircularProgress />
                      <Typography variant="body2" color="text.secondary">
                        {operationStatus === 'loading_history' ? 'Loading chat history...' : 'Loading...'}
                      </Typography>
                    </Box>
                  ) : (
                    <List sx={{ flex: 1, p: 0 }}>
                      {messages.length === 0 ? (
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '200px',
                            flexDirection: 'column',
                            gap: 2
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            No messages yet
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Start a conversation with {getUserDisplayName(selectedUser)}
                          </Typography>
                        </Box>
                      ) : (
                        messages.map((message, index) => (
                          <ListItem
                            key={generateSafeKey(message, index, 'chat-msg')}
                            sx={{
                              display: 'flex',
                              flexDirection: isOwnMessage(message) ? 'row-reverse' : 'row',
                              alignItems: 'flex-start',
                              gap: 1,
                              py: 0.5
                            }}
                          >
                            {!isOwnMessage(message) && (
                              <ListItemAvatar sx={{ minWidth: 'auto', mr: 1 }}>
                                <Avatar
                                  src={getProfilePictureUrl(selectedUser)}
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    bgcolor: selectedUser?.profile_picture ? 'transparent' : 'secondary.main',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  {!selectedUser?.profile_picture && getInitials(selectedUser)}
                                </Avatar>
                              </ListItemAvatar>
                            )}

                            <Box
                              sx={{
                                maxWidth: '70%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isOwnMessage(message) ? 'flex-end' : 'flex-start'
                              }}
                            >
                              <Box
                                sx={{
                                  bgcolor: isOwnMessage(message) ? 'primary.main' : 'grey.100',
                                  color: isOwnMessage(message) ? 'primary.contrastText' : 'text.primary',
                                  px: 2,
                                  py: 1,
                                  borderRadius: 2,
                                  borderTopLeftRadius: isOwnMessage(message) ? 2 : 0.5,
                                  borderTopRightRadius: isOwnMessage(message) ? 0.5 : 2,
                                  mb: 0.5
                                }}
                              >
                                <Typography variant="body2">
                                  {message.content || message.message || 'No content'}
                                </Typography>
                              </Box>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ px: 1 }}
                              >
                                {getMessageTime(message.timestamp)}
                              </Typography>
                            </Box>
                          </ListItem>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </List>
                  )}

                  {/* Typing indicator */}
                  {typingUsers.length > 0 && (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Message Input Area */}
                <Box
                  sx={{
                    p: 2,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                    <TextField
                      fullWidth
                      multiline
                      maxRows={3}
                      size="small"
                      placeholder={
                        isUserOnline(selectedUser)
                          ? `Message ${getUserDisplayName(selectedUser)}...`
                          : `${getUserDisplayName(selectedUser)} is offline. Message will be delivered when they come online.`
                      }
                      value={messageText}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      disabled={connectionStatus !== 'connected'}
                    />
                    <IconButton
                      onClick={handleSendMessage}
                      disabled={!messageText || !messageText.trim() || connectionStatus !== 'connected' || operationStatus === 'sending_message'}
                      color="primary"
                      sx={{ mb: 0.5 }}
                    >
                      {operationStatus === 'sending_message' ? (
                        <CircularProgress size={20} />
                      ) : (
                        <SendIcon />
                      )}
                    </IconButton>
                  </Box>

                  {/* Offline user actions */}
                  {!isUserOnline(selectedUser) && messages.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleDeleteOfflineMessages}
                      >
                        Delete Messages
                      </Button>
                    </Box>
                  )}

                  {connectionStatus !== 'connected' && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Connection lost. Messages will be sent when connection is restored.
                      {onRetryConnection && (
                        <Button size="small" onClick={onRetryConnection} sx={{ ml: 1 }}>
                          Retry
                        </Button>
                      )}
                    </Alert>
                  )}
                </Box>
              </>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ChatModal;
