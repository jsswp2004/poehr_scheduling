import React from 'react';
import { Box, Typography, Chip, CircularProgress } from '@mui/material';
import {
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  Wifi as ConnectingIcon
} from '@mui/icons-material';

const ChatConnectionStatus = ({ 
  connectionStatus, 
  operationStatus, 
  lastError, 
  onRetry,
  compact = false 
}) => {
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'success';
      case 'connecting': return 'warning';
      case 'disconnected': return 'error';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <ConnectedIcon fontSize="small" />;
      case 'connecting': return <ConnectingIcon fontSize="small" />;
      case 'disconnected': return <ErrorIcon fontSize="small" />;
      case 'error': return <ErrorIcon fontSize="small" />;
      default: return null;
    }
  };

  const getStatusText = () => {
    if (operationStatus) {
      switch (operationStatus) {
        case 'creating_room': return 'Creating chat room...';
        case 'sending_message': return 'Sending message...';
        case 'loading_history': return 'Loading messages...';
        default: return operationStatus;
      }
    }

    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection Error';
      default: return 'Unknown';
    }
  };

  if (compact) {
    return (
      <Chip
        icon={operationStatus ? <CircularProgress size={12} /> : getStatusIcon()}
        label={getStatusText()}
        color={getStatusColor()}
        size="small"
        variant="outlined"
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
      {operationStatus ? (
        <CircularProgress size={16} />
      ) : (
        getStatusIcon()
      )}
      <Typography variant="caption" color="text.secondary">
        {getStatusText()}
      </Typography>
      
      {lastError && (
        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
          {lastError}
        </Typography>
      )}
      
      {connectionStatus === 'disconnected' && onRetry && (
        <Typography 
          variant="caption" 
          color="primary" 
          sx={{ cursor: 'pointer', textDecoration: 'underline', ml: 1 }}
          onClick={onRetry}
        >
          Retry
        </Typography>
      )}
    </Box>
  );
};

export default ChatConnectionStatus;
