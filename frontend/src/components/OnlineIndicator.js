import React from 'react';
import { IconButton, Tooltip, Box } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import { styled } from '@mui/material/styles';

// ✅ Styled component for the online status dot
const StatusDot = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isOnline', // Prevent isOnline from being passed to Box
})(({ theme, isOnline }) => ({
  position: 'absolute',
  top: 2,
  right: 2,
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: isOnline ? '#4caf50' : '#757575', // Green for online, gray for offline
  border: `2px solid ${theme.palette.background.paper}`,
  zIndex: 1,
}));

const OnlineIndicator = ({ 
  user, 
  isOnline = false, 
  lastSeen = null, 
  onClick = () => {},  onChatClick = () => {}  // ✅ New prop for chat functionality
}) => {
  
  const getTooltipText = () => {
    if (isOnline) {
      return `${user?.first_name || user?.username || 'User'} is online - Click to chat`;
    } else if (lastSeen) {
      const lastSeenDate = new Date(lastSeen);
      const now = new Date();
      const diffInMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));
      
      if (diffInMinutes < 1) {
        return `${user?.first_name || user?.username || 'User'} was online just now`;
      } else if (diffInMinutes < 60) {
        return `${user?.first_name || user?.username || 'User'} was online ${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
      } else if (diffInMinutes < 1440) { // Less than 24 hours
        const hours = Math.floor(diffInMinutes / 60);
        return `${user?.first_name || user?.username || 'User'} was online ${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        const days = Math.floor(diffInMinutes / 1440);
        return `${user?.first_name || user?.username || 'User'} was online ${days} day${days > 1 ? 's' : ''} ago`;
      }
    } else {
      return `${user?.first_name || user?.username || 'User'} is offline - Click to chat`;
    }
  };
  const handleClick = (e) => {
    e.stopPropagation(); // Prevent event bubbling
    if (onChatClick && typeof onChatClick === 'function') {
      onChatClick(user);
    } else if (onClick && typeof onClick === 'function') {
      onClick(user);
    }
  };

  return (
    <Tooltip title={getTooltipText()} placement="top" arrow>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <IconButton
          size="small"
          onClick={handleClick}
          sx={{
            width: 36,
            height: 36,
            backgroundColor: isOnline ? '#e8f5e8' : '#f5f5f5',
            '&:hover': {
              backgroundColor: isOnline ? '#d4edda' : '#e9ecef',
            },
            border: `1px solid ${isOnline ? '#4caf50' : '#757575'}`,
            transition: 'all 0.3s ease',
          }}
        >
          <ChatIcon 
            sx={{ 
              fontSize: 18, 
              color: isOnline ? '#2e7d32' : '#616161' 
            }} 
          />
        </IconButton>
        <StatusDot isOnline={isOnline} />
      </Box>
    </Tooltip>
  );
};

export default OnlineIndicator;
