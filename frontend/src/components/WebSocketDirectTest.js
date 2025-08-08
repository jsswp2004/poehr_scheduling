import React from 'react';
import { Box, Typography, Card, CardContent, Button } from '@mui/material';

const WebSocketDirectTest = () => {
  const handleDirectTest = () => {
    // Open the direct test in a new window
    window.open('/websocket-direct-test.html', '_blank');
  };

  const currentUrl = window.location.href;
  const isProduction = window.location.hostname.includes('azurewebsites.net') || 
                      window.location.hostname.includes('azurecontainerapps.io') ||
                      window.location.hostname.includes('run.app');
  
  const wsUrl = isProduction 
    ? `wss://${window.location.host}/ws/presence/`
    : 'ws://localhost:8080/ws/presence/';

  return (
    <Box sx={{ maxWidth: 800, margin: 'auto', mt: 4, p: 2 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            🔧 WebSocket Diagnostic Tool
          </Typography>
          
          <Typography variant="body1" paragraph>
            Use this tool to diagnose WebSocket connection issues with Azure deployment.
          </Typography>

          <Box sx={{ mb: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2"><strong>Current URL:</strong> {currentUrl}</Typography>
            <Typography variant="body2"><strong>Environment:</strong> {isProduction ? 'Production (Azure)' : 'Development'}</Typography>
            <Typography variant="body2"><strong>WebSocket URL:</strong> {wsUrl}</Typography>
          </Box>

          <Button 
            variant="contained" 
            onClick={handleDirectTest}
            sx={{ mr: 2 }}
          >
            🚀 Open Direct WebSocket Test
          </Button>

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will open a new window with a direct WebSocket connection test that bypasses React and all framework overhead.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default WebSocketDirectTest;
