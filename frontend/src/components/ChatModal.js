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
  IconButton,
  CircularProgress,
  Alert,
  Paper
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

const ChatModal = ({
  open,
  onClose,
  currentUser,
  selectedUser = null, // User to chat with (passed from parent)
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
  onDeleteOfflineMessage = null,
  markRoomAsRead = null // Function to mark room as read
}) => {
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
    const roomKey = createRoomKey(currentUser, selectedUser);
    return getRoomMessages(roomKey);
  }, [selectedUser, getRoomMessages, currentUser]);

  // Get typing users for selected user (for future use)
  // const typingUsers = selectedUser && getTypingUsersForRoom ?
  //   getTypingUsersForRoom(createRoomKey(currentUser, selectedUser)) : [];

  // Handle stop typing function
  const handleStopTyping = useCallback(() => {
    setIsTyping(false); // Always set to false, no need to check current state
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []); // No dependencies needed

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset message input when user changes
  useEffect(() => {
    setMessageText('');
    handleStopTyping();
  }, [selectedUser, handleStopTyping]);

  // Clear message when modal closes
  useEffect(() => {
    if (!open) {
      setMessageText('');
    }
  }, [open]);

  // Mark room as read when modal opens with a selected user
  useEffect(() => {
    if (open && selectedUser && markRoomAsRead && currentUser) {
      const roomKey = createRoomKey(currentUser, selectedUser);
      if (roomKey) {
        markRoomAsRead(roomKey);
      }
    }
  }, [open, selectedUser, markRoomAsRead, currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (messageText && messageText.trim() && selectedUser) {
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
  }; const getMessageTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'just now';
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
          <Typography variant="h6">
            {selectedUser ? `Message ${getUserDisplayName(selectedUser)}` : 'Team Messages'}
          </Typography>
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
        {!selectedUser ? (
          /* No user selected state */
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
            <Typography variant="h6">Select a team member to send a message</Typography>
            <Typography variant="body2">Click on a team member's message button to start</Typography>
          </Box>
        ) : (
          /* Chat with selected user */
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
              <Avatar
                src={getProfilePictureUrl(selectedUser)}
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: 'primary.main'
                }}
              >
                {!selectedUser?.profile_picture && getInitials(selectedUser)}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">
                  {getUserDisplayName(selectedUser)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Messaging
                </Typography>
              </Box>
            </Box>

            {/* Messages Area */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
              {operationStatus === 'loading_history' ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100px',
                    flexDirection: 'column',
                    gap: 1
                  }}
                >
                  <CircularProgress size={24} />
                  <Typography variant="body2" color="text.secondary">
                    Loading chat history...
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
                          flexDirection: 'column',
                          alignItems: message.sender_id === currentUser?.id ? 'flex-end' : 'flex-start',
                          py: 0.5,
                          px: 1
                        }}
                      >
                        <Paper
                          sx={{
                            p: 1.5,
                            maxWidth: '70%',
                            bgcolor: message.sender_id === currentUser?.id ? 'primary.main' : 'grey.100',
                            color: message.sender_id === currentUser?.id ? 'primary.contrastText' : 'text.primary',
                            borderRadius: 2,
                            wordBreak: 'break-word'
                          }}
                        >
                          <Typography variant="body2">
                            {message.content}
                          </Typography>
                        </Paper>
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            color: 'text.secondary',
                            fontSize: '0.75rem'
                          }}
                        >
                          {getMessageTime(message.timestamp)}
                        </Typography>
                      </ListItem>
                    ))
                  )}
                </List>
              )}
              <div ref={messagesEndRef} />
            </Box>

            {/* Message Input */}
            <Box
              sx={{
                p: 2,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                gap: 1
              }}
            >
              <TextField
                fullWidth
                multiline
                maxRows={4}
                value={messageText}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={`Message ${getUserDisplayName(selectedUser)}...`}
                disabled={isLoading || operationStatus === 'sending'}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3
                  }
                }}
              />
              <IconButton
                onClick={handleSendMessage}
                disabled={!messageText.trim() || isLoading || operationStatus === 'sending'}
                color="primary"
                sx={{
                  alignSelf: 'flex-end',
                  mb: 0.5
                }}
              >
                {operationStatus === 'sending' ? (
                  <CircularProgress size={20} />
                ) : (
                  <SendIcon />
                )}
              </IconButton>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChatModal;
