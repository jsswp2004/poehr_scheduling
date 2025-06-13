import { useState, useEffect, useCallback, useRef } from 'react';

const useWebSocket = (url, options = {}) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const optionsRef = useRef(options);
  
  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  const maxReconnectAttempts = options.maxReconnectAttempts || 5;
  const reconnectInterval = options.reconnectInterval || 3000;  const connectRef = useRef();
  const disconnectRef = useRef();
  const connect = useCallback(() => {
    try {
      const token = localStorage.getItem('access_token');
      const wsUrl = `${url}?token=${token}`;
      
      console.log(`🔗 Attempting WebSocket connection to: ${wsUrl}`);
      console.log(`🔐 Token: ${token ? 'Present' : 'Missing'}`);
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            }));
          }
        }, 30000); // Send heartbeat every 30 seconds
        
        // Call onOpen callback if provided
        if (optionsRef.current.onOpen) {
          optionsRef.current.onOpen();
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Call onMessage callback if provided
          if (optionsRef.current.onMessage) {
            optionsRef.current.onMessage(data);
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err);
        }
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`🔄 Attempting to reconnect... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, reconnectInterval);
        }
        
        // Call onClose callback if provided
        if (optionsRef.current.onClose) {
          optionsRef.current.onClose(event);
        }
      };
      
      ws.onerror = (errorEvent) => {
        console.error('❌ WebSocket error:', errorEvent);
        // Don't set error state immediately to avoid render loops
        // Only set error if it's a real connection issue
        
        // Call onError callback if provided
        if (optionsRef.current.onError) {
          optionsRef.current.onError(errorEvent);
        }
      };
      
      setSocket(ws);
    } catch (err) {
      console.error('❌ Failed to create WebSocket connection:', err);
      setError(err);
    }
  }, [url, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.close(1000, 'Manual disconnect');
    }
    
    // Clear timeouts and intervals
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    setSocket(null);
    setIsConnected(false);
  }, [socket]);

  // Update refs
  connectRef.current = connect;
  disconnectRef.current = disconnect;

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message');
      return false;
    }
  }, [socket]);  // Connect on mount only
  useEffect(() => {
    connectRef.current();
    
    return () => {
      disconnectRef.current();
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Handle URL changes
  useEffect(() => {
    if (socket) {
      disconnectRef.current();
      // Small delay to ensure cleanup, then reconnect
      const timer = setTimeout(() => {
        connectRef.current();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [url, socket]); // Only reconnect when URL changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  return {
    socket,
    isConnected,
    lastMessage,
    error,
    sendMessage,
    connect,
    disconnect
  };
};

export default useWebSocket;
