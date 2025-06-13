import { useState, useEffect, useCallback, useRef } from 'react';

const useWebSocket = (url, options = {}) => {
  console.log('🟢 [useWebSocket] hook called with url:', url);
  
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
  const reconnectInterval = options.reconnectInterval || 3000;

  // Forward declaration for connect to be used in scheduleReconnect
  const connectRef = useRef(null);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
      reconnectAttemptsRef.current++;
      console.log(`Attempting to reconnect... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (connectRef.current) {
         connectRef.current(); // Use the ref to call the latest connect function
        }
      }, reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1)); // Exponential backoff
    } else {
      console.error('Max reconnect attempts reached.');
      setError(new Error('Max reconnect attempts reached.'));
    }
  }, [maxReconnectAttempts, reconnectInterval]); // connectRef is stable, no need to add to deps

  const connect = useCallback(() => {
    console.log('🟢 [useWebSocket] connect() called with url:', url);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      const wsUrl = token ? `${url}?token=${token}` : url;
      console.log('🟢 [useWebSocket] Creating new WebSocket with wsUrl:', wsUrl);
      const ws = new WebSocket(wsUrl);
      setSocket(ws);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            }));
          }
        }, 30000);
        
        if (optionsRef.current.onOpen) {
          optionsRef.current.onOpen();
        }
      };
      
      ws.onmessage = (event) => {
        try {
          console.log('WebSocket message received (raw):', event.data);
          const data = JSON.parse(event.data);
          setLastMessage(data);
          if (optionsRef.current.onMessage) {
            optionsRef.current.onMessage(data);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
          setError(e);
        }
      };
      
      ws.onerror = (event) => {
        console.error('❌ WebSocket error event:', event);
        console.error('❌ WebSocket error object:', JSON.stringify(event, Object.getOwnPropertyNames(event)));
        setError(event);
        setIsConnected(false);
        if (optionsRef.current.onError) {
          optionsRef.current.onError(event);
        }
        scheduleReconnect(); // scheduleReconnect is now in scope
      };
      
      ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected. Code: ${event.code}, Reason: "${event.reason}", Was Clean: ${event.wasClean}`);
        setIsConnected(false);
        // Do not set socket to null here immediately if reconnecting, 
        // setSocket(null) will be called by connect if a new one is made or if disconnect() is called.

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Only schedule reconnect if it wasn't a clean close (code 1000)
        // and not a manual disconnect where socket would be nullified by disconnect()
        if (event.code !== 1000 && event.code !== 1005 /* No Status Rcvd, often implies manual close by client */) {
          scheduleReconnect();
        }
        
        if (optionsRef.current.onClose) {
          optionsRef.current.onClose(event);
        }
      };
    } catch (err) {
      console.error('❌ Failed to create WebSocket connection:', err);
      setError(err);
      // If connection fails to even be created, schedule a reconnect.
      scheduleReconnect();
    }
  }, [url, scheduleReconnect, maxReconnectAttempts, reconnectInterval]); // Added scheduleReconnect and its deps

  // Assign the connect function to the ref *after* connect is defined.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    console.log('Manual disconnect called');
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (socket) {
      // Set a flag or remove listeners before closing to prevent auto-reconnect on manual close
      socket.onclose = () => { // Override onclose to prevent reconnect for manual disconnect
         console.log('🔌 WebSocket manually disconnected.');
         setIsConnected(false);
         setSocket(null); 
         if (optionsRef.current.onClose) {
          optionsRef.current.onClose({code: 1000, reason: 'Manual disconnect', wasClean: true});
        }
      };
      socket.close(1000, 'Manual disconnect');
    } else {
        // If socket is already null, ensure states are reset
        setIsConnected(false);
        setSocket(null);
    }
    reconnectAttemptsRef.current = maxReconnectAttempts +1; // Prevent auto-reconnect after manual disconnect
  }, [socket, maxReconnectAttempts]);

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message:', message);
      return false;
    }
  }, [socket]);

  useEffect(() => {
    connect(); // Initial connection attempt
    
    return () => {
      // Cleanup on unmount
      console.log('useWebSocket unmounting, cleaning up...');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null; // Prevent any onclose logic during forced close on unmount
        socket.close(1000, 'Component unmounting');
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [connect]); // Rerun connect if the connect function itself changes (e.g. URL change)

  // Expose socket, isConnected, lastMessage, error, sendMessage, and manual connect/disconnect
  return { socket, isConnected, lastMessage, error, sendMessage, connect, disconnect };
};

export default useWebSocket;
