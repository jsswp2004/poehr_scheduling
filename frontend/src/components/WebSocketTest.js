import React, { useEffect } from 'react';
import { Card, CardContent, Typography, Box, Chip } from '@mui/material';
import useWebSocket from '../hooks/useWebSocket';

const WebSocketTest = () => {
  // Determine WebSocket URL based on environment
  const isProduction = window.location.hostname.includes('run.app');
  const wsUrl = isProduction 
    ? `wss://${window.location.host}/ws/presence/`
    : 'ws://localhost:8080/ws/presence/';  // Updated to unified port 8080
  
  const { isConnected, lastMessage, error, sendMessage } = useWebSocket(
    wsUrl,
    {
      onOpen: () => console.log('🔗 WebSocket connection opened'),
      onMessage: (data) => console.log('📨 Message received:', data),
      onClose: (event) => console.log('🔌 WebSocket connection closed:', event),
      onError: (error) => console.log('❌ WebSocket error:', error),
      maxReconnectAttempts: 3,
      reconnectInterval: 2000
    }
  );

  useEffect(() => {
    console.log(`Connection status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);
  }, [isConnected]);

  useEffect(() => {
    if (lastMessage) {
      console.log('Last message updated:', lastMessage);
    }
  }, [lastMessage]);

  return (
    <Card sx={{ maxWidth: 600, margin: 'auto', mt: 4 }}>
      <CardContent>
        <Typography variant="h5" component="h2" gutterBottom>
          WebSocket Connection Test
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" component="span">
            Status: 
          </Typography>
          <Chip 
            label={isConnected ? 'Connected' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
            sx={{ ml: 1 }}
          />
        </Box>

        {error && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" color="error">
              Error: {error.toString()}
            </Typography>
          </Box>
        )}

        {lastMessage && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" component="div">
              <strong>Last Message:</strong>
            </Typography>
            <Box component="pre" sx={{ 
              backgroundColor: '#f5f5f5', 
              padding: 1, 
              borderRadius: 1,
              fontSize: '0.8rem',
              overflow: 'auto'
            }}>
              {JSON.stringify(lastMessage, null, 2)}
            </Box>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary">
          This component tests the WebSocket connection without causing infinite re-renders.
          Check the browser console for detailed logs.
        </Typography>
      </CardContent>
    </Card>
  );
};

export default WebSocketTest;
