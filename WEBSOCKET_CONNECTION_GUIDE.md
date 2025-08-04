# WebSocket Connection Guide

## Single Service WebSocket Setup ✅

Your application now uses a **single service** approach where the main Cloud Run service handles both HTTP and WebSocket traffic via Uvicorn.

## Frontend Connection

### WebSocket Endpoint
```javascript
// Production WebSocket URL
const wsUrl = `wss://your-cloud-run-url/ws/presence/?token=${jwtToken}`;

// Example connection
const socket = new WebSocket(wsUrl);
```

### Connection URL Format
- **Production**: `wss://poehr-scheduling-mjf5efdj3a-uc.a.run.app/ws/presence/?token=YOUR_JWT_TOKEN`
- **Local Dev**: `ws://localhost:8080/ws/presence/?token=YOUR_JWT_TOKEN`

## Configuration Details

### Server Configuration
- **ASGI Server**: Uvicorn (supports both HTTP and WebSocket)
- **Port**: 8080 (same as HTTP)
- **Authentication**: JWT token via query parameter
- **Channel Layer**: Redis (for scaling)

### Removed Components
- ❌ Separate WebSocket service (Dockerfile.websocket)
- ❌ Daphne server (start_websocket_server.py)
- ❌ Port 9001 WebSocket service

### Benefits
- ✅ Simplified deployment (single service)
- ✅ Easier maintenance
- ✅ Better resource utilization
- ✅ No need for load balancer between HTTP/WS

## Troubleshooting

### Common Issues
1. **Connection Failed**: Check JWT token is valid and not expired
2. **404 on WebSocket**: Ensure using correct URL format with `/ws/presence/`
3. **Authentication Error**: Verify token is passed in query parameter

### Testing WebSocket Connection
```javascript
const testWebSocket = (url, token) => {
  const ws = new WebSocket(`${url}?token=${token}`);
  
  ws.onopen = () => console.log('✅ WebSocket connected');
  ws.onerror = (error) => console.error('❌ WebSocket error:', error);
  ws.onmessage = (event) => console.log('📨 Message:', event.data);
};
```

## Next Steps
1. Update your frontend to use the main service WebSocket endpoint
2. Deploy the updated configuration
3. Test WebSocket functionality
4. Monitor logs for any connection issues
