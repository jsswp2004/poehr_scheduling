import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Chip,
  InputAdornment,
  CircularProgress,
  Divider,
  Alert
} from '@mui/material';
import {
  Send as SendIcon,
  Close as CloseIcon,
  EmojiEmotions as EmojiIcon,
  AttachFile as AttachIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import ChatConnectionStatus from './ChatConnectionStatus';

const ChatModal = ({ 
  open, 
  fallbackOpen = false, // fallback prop
  onClose, 
  chatPartner, 
  currentUser,
  onSendMessage,
  messages = [],
  typingUsers = [],
  isLoading = false,
  connectionStatus = 'disconnected',
  operationStatus = null,
  chatError = null,
  onRetryConnection = null
}) => {
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Debug logging
  useEffect(() => {
    console.log('🔍 ChatModal - Messages updated:', messages.length, messages);
  }, [messages]);

  useEffect(() => {
    console.log('🔍 ChatModal - Props:', {
      open,
      chatPartner: chatPartner?.name || chatPartner?.full_name,
      currentUser: currentUser?.username,
      messagesCount: messages.length,
      typingUsersCount: typingUsers.length,
      isLoading
    });
  }, [open, chatPartner, currentUser, messages.length, typingUsers.length, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const handleSendMessage = () => {
    if (messageText.trim()) {
      console.log('📤 ChatModal handleSendMessage:', messageText.trim());
      try {
        onSendMessage(messageText.trim());
        setMessageText('');
        handleStopTyping();
      } catch (error) {
        console.error('❌ Error in handleSendMessage:', error);
      }
    } else {
      console.warn('⚠️ Attempted to send empty message');
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

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Use fallbackOpen if open is false but fallbackOpen is true
  const effectiveOpen = open || fallbackOpen;

  return (
    <Dialog
      open={effectiveOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          height: '600px',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {/* Show error if chat history failed to load */}
      {chatError && (
        <Alert severity="error" sx={{ m: 2 }}>
          {typeof chatError === 'string' ? chatError : 'Failed to load chat history.'}
        </Alert>
      )}
      
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
      >        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'primary.main'
            }}
          >
            {getInitials(chatPartner?.full_name || chatPartner?.name || `${chatPartner?.first_name} ${chatPartner?.last_name}`)}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 0 }}>
              {chatPartner?.full_name || chatPartner?.name || `${chatPartner?.first_name} ${chatPartner?.last_name}` || 'Unknown User'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {chatPartner?.role || 'Team Member'}
            </Typography>
          </Box>
          <ChatConnectionStatus 
            connectionStatus={connectionStatus}
            operationStatus={operationStatus}
            chatError={chatError}
            onRetry={onRetryConnection}
            compact={true}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>      {/* Messages Area */}
      <DialogContent
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 0,
          overflow: 'hidden'
        }}
      >
        {/* Error Alert */}
        {chatError && connectionStatus !== 'connected' && (
          <Alert 
            severity="error" 
            sx={{ m: 1 }}
            action={
              onRetryConnection && (
                <Button color="inherit" size="small" onClick={onRetryConnection}>
                  Retry
                </Button>
              )
            }
          >
            {chatError}
          </Alert>
        )}
        
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
          <List
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 1
            }}
          >            {messages.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No messages yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Start a conversation with {chatPartner?.full_name || chatPartner?.name || 'this user'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Messages: {messages.length} | Active: {!!chatPartner}
                </Typography>
              </Box>
            ) : (
              messages.map((message, index) => (
                <ListItem
                  key={message.id}
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
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: 'secondary.main',
                          fontSize: '0.875rem'
                        }}
                      >
                        {getInitials(message.sender_name)}
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
                        {message.message}
                      </Typography>
                    </Box>
                    
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1 }}
                    >
                      {getMessageTime(message.timestamp)}
                      {message.is_read && isOwnMessage(message) && (
                        <Chip
                          label="Read"
                          size="small"
                          sx={{ ml: 1, height: '16px', fontSize: '0.6rem' }}
                        />
                      )}
                    </Typography>
                  </Box>
                </ListItem>
              ))
            )}
            
            {/* Typing Indicators */}
            {typingUsers.length > 0 && (
              <ListItem>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[1, 2, 3].map((dot) => (
                      <Box
                        key={dot}
                        sx={{
                          width: 4,
                          height: 4,
                          bgcolor: 'text.secondary',
                          borderRadius: '50%',
                          animation: 'pulse 1.5s infinite',
                          animationDelay: `${dot * 0.2}s`
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </ListItem>
            )}
            
            <div ref={messagesEndRef} />
          </List>
        )}
      </DialogContent>

      {/* Message Input */}
      <DialogActions
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider'
        }}
      >        <TextField
          fullWidth
          multiline
          maxRows={3}
          placeholder={connectionStatus === 'connected' ? "Type a message..." : "Connecting..."}
          value={messageText}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          disabled={connectionStatus !== 'connected' || operationStatus === 'sending_message'}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" disabled>
                    <EmojiIcon />
                  </IconButton>
                  <IconButton size="small" disabled>
                    <AttachIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || connectionStatus !== 'connected' || operationStatus === 'sending_message'}
                    color="primary"
                  >
                    {operationStatus === 'sending_message' ? (
                      <CircularProgress size={20} />
                    ) : (
                      <SendIcon />
                    )}
                  </IconButton>
                </Box>
              </InputAdornment>
            )
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3
            }
          }}
        />
      </DialogActions>
    </Dialog>
  );
};

export default ChatModal;
