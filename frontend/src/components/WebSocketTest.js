import React, { useEffect, useCallback } from 'react';
import { Card, CardContent, Typography, Box, Chip, Button } from '@mui/material';
import useWebSocket from '../hooks/useWebSocket';

const WebSocketTest = () => {
  // Determine WebSocket URL based on environment
  const isProduction = window.location.hostname.includes('azurewebsites.net') || 
                      window.location.hostname.includes('azurecontainerapps.io') ||
                      window.location.hostname.includes('run.app');
  const wsUrl = isProduction 
    ? `wss://${window.location.host}/ws/presence/`
    : 'ws://localhost:8080/ws/presence/';  // Updated to unified port 8080

  // Debug logging
  console.log('🔧 WebSocket Environment Debug:', {
    hostname: window.location.hostname,
    isProduction,
    wsUrl,
    protocol: window.location.protocol,
    host: window.location.host
  });
  
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

  // Ping test function
  const sendPing = useCallback(() => {
    if (sendMessage) {
      const result = sendMessage({ type: 'ping' });
      console.log('🏓 Ping sent to backend - result:', result);
      if (result) {
        console.log('✅ Ping message sent successfully');
      } else {
        console.log('❌ Failed to send ping message');
      }
    } else {
      console.log('❌ No sendMessage function available');
    }
  }, [sendMessage]);

  // Test direct message function
  const testDirectMessage = useCallback(() => {
    if (sendMessage) {
      const testMessage = {
        type: 'send_message',
        sender_id: 12, // registrarsuny
        recipient_id: 16, // adminsuny  
        message: 'Test direct message from WebSocket test component'
      };
      const result = sendMessage(testMessage);
      console.log('📤 Direct message test sent - result:', result);
      console.log('📤 Message data:', testMessage);
    } else {
      console.log('❌ No sendMessage function available');
    }
  }, [sendMessage]);

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

        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
          <Button 
            variant="contained" 
            onClick={sendPing}
            disabled={!isConnected}
            size="small"
          >
            🏓 Send Ping Test
          </Button>
          <Button 
            variant="outlined" 
            onClick={testDirectMessage}
            disabled={!isConnected}
            size="small"
          >
            📤 Test Direct Message
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WebSocketTest;
