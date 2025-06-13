import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Divider } from '@mui/material';
import useOnlineStatus from '../hooks/useOnlineStatus';

const OnlineStatusDebug = ({ team = [] }) => {
  const { getUserOnlineStatus, isConnected, onlineUsers } = useOnlineStatus();
  const [debugInfo, setDebugInfo] = useState([]);

  useEffect(() => {
    if (team.length > 0) {
      const info = team.map(member => {
        const status = getUserOnlineStatus(member.id);
        return {
          id: member.id,
          name: member.full_name || member.username,
          isOnline: status.isOnline,
          lastSeen: status.lastSeen
        };
      });
      setDebugInfo(info);
    }
  }, [team, getUserOnlineStatus, onlineUsers]);

  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: '#f0f0f0' }}>
      <Typography variant="h6" gutterBottom>
        🔍 Online Status Debug Info
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom>
        WebSocket Connected: {isConnected ? '✅ Yes' : '❌ No'}
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Online Users Data Keys: {Object.keys(onlineUsers).join(', ') || 'None'}
      </Typography>
      
      <Divider sx={{ my: 1 }} />
      
      <Typography variant="subtitle2" gutterBottom>
        Team Members Status:
      </Typography>
      
      {debugInfo.map(member => (
        <Box key={member.id} sx={{ ml: 2, mb: 1 }}>
          <Typography variant="body2">
            👤 {member.name} (ID: {member.id}): {member.isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
            {member.lastSeen && ` (Last seen: ${new Date(member.lastSeen).toLocaleString()})`}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
};

export default OnlineStatusDebug;
