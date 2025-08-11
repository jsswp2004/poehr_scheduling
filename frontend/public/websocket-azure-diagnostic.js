/**
 * WebSocket Azure Diagnostic Tool
 * 
 * Run this in your browser console to diagnose WebSocket issues with Azure Container Apps
 */

window.diagnoseWebSocketIssues = function() {
    console.log('🔍 WebSocket Azure Container Apps Diagnostic');
    console.log('=' * 60);
    
    // Environment information
    console.log('\n📋 Environment Information:');
    console.log('   Current URL:', window.location.href);
    console.log('   Protocol:', window.location.protocol);
    console.log('   Host:', window.location.host);
    console.log('   User Agent:', navigator.userAgent);
    
    // Check token
    function getAccessToken() {
        const accessTokenData = localStorage.getItem('access_token');
        if (accessTokenData) {
            try {
                const parsed = JSON.parse(accessTokenData);
                return parsed.token || accessTokenData;
            } catch {
                return accessTokenData;
            }
        }
        return null;
    }
    
    const token = getAccessToken();
    console.log('\n🔑 Authentication:');
    console.log('   Token present:', !!token);
    if (token) {
        console.log('   Token preview:', token.substring(0, 50) + '...');
        
        // Try to decode JWT token
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                console.log('   Token payload:', {
                    user_id: payload.user_id,
                    username: payload.username,
                    exp: new Date(payload.exp * 1000).toISOString(),
                    expired: payload.exp * 1000 < Date.now()
                });
            }
        } catch (e) {
            console.log('   Token decode error:', e.message);
        }
    }
    
    // WebSocket URL construction
    const isProduction = window.location.hostname.includes('azurecontainerapps.io');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseWsUrl = `${protocol}//${window.location.host}`;
    const wsUrl = `${baseWsUrl}/ws/presence/` + (token ? `?token=${token}` : '');
    
    console.log('\n🔗 WebSocket Configuration:');
    console.log('   Environment:', isProduction ? 'Production (Azure)' : 'Development');
    console.log('   Base WS URL:', baseWsUrl);
    console.log('   Full WS URL:', wsUrl.substring(0, 100) + '...');
    
    // Test 1: HTTP Endpoint
    console.log('\n🧪 Test 1: HTTP Endpoint Check');
    fetch('/ws/presence/')
        .then(response => {
            console.log('   HTTP Response Status:', response.status);
            console.log('   HTTP Response Headers:', Object.fromEntries(response.headers.entries()));
            return response.text();
        })
        .then(text => {
            console.log('   HTTP Response Preview:', text.substring(0, 200));
        })
        .catch(error => {
            console.log('   HTTP Error:', error.message);
        });
    
    // Test 2: WebSocket Connection
    console.log('\n🧪 Test 2: WebSocket Connection Test');
    const ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
            console.log('   ⏰ Connection timeout - likely server issue');
            ws.close();
        }
    }, 10000);
    
    ws.onopen = function(event) {
        clearTimeout(timeout);
        console.log('   ✅ WebSocket connection opened successfully!');
        console.log('   Connection details:', {
            readyState: ws.readyState,
            protocol: ws.protocol,
            extensions: ws.extensions,
            url: ws.url
        });
        
        // Send test message
        console.log('   📤 Sending test ping...');
        ws.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
        }));
        
        // Close after 5 seconds
        setTimeout(() => {
            ws.close(1000, 'Diagnostic test completed');
        }, 5000);
    };
    
    ws.onmessage = function(event) {
        console.log('   📥 Received message:', event.data);
        try {
            const data = JSON.parse(event.data);
            console.log('   📋 Parsed message:', data);
        } catch (e) {
            console.log('   ⚠️ Could not parse message as JSON');
        }
    };
    
    ws.onerror = function(event) {
        clearTimeout(timeout);
        console.log('   ❌ WebSocket error occurred');
        console.log('   Error details:', {
            type: event.type,
            target: event.target,
            readyState: ws.readyState,
            url: ws.url
        });
        
        // Azure-specific troubleshooting
        if (wsUrl.includes('azurecontainerapps.io')) {
            console.log('\n🔧 Azure Container Apps Troubleshooting:');
            console.log('   Possible issues:');
            console.log('   1. ASGI application not properly configured for WebSockets');
            console.log('   2. Django settings using wrong configuration (production vs azure)');
            console.log('   3. JWT middleware blocking WebSocket connections');
            console.log('   4. Redis channel layer not properly configured');
            console.log('   5. Azure Container Apps ingress not supporting WebSocket upgrades');
            console.log('   6. Missing django-storages dependency causing ASGI import failure');
        }
    };
    
    ws.onclose = function(event) {
        clearTimeout(timeout);
        console.log('   🔌 WebSocket connection closed');
        console.log('   Close details:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        // Interpret close codes
        const closeCodes = {
            1000: 'Normal closure',
            1001: 'Going away',
            1002: 'Protocol error',
            1003: 'Unsupported data',
            1005: 'No status received',
            1006: 'Abnormal closure',
            1007: 'Invalid frame payload data',
            1008: 'Policy violation',
            1009: 'Message too big',
            1010: 'Mandatory extension',
            1011: 'Internal server error',
            1015: 'TLS handshake'
        };
        
        console.log('   📋 Close code meaning:', closeCodes[event.code] || 'Unknown');
        
        if (event.code === 1006) {
            console.log('   ⚠️ Abnormal closure - likely server-side issue');
        } else if (event.code === 1011) {
            console.log('   ⚠️ Internal server error - check Django logs');
        }
    };
    
    console.log('\n💡 Diagnostic test started. Check the console output above for results.');
    console.log('💡 If WebSocket fails, try checking Azure Container Apps logs for server-side errors.');
    
    return {
        websocket: ws,
        token: token,
        wsUrl: wsUrl
    };
};

// Auto-run if in browser console
if (typeof window !== 'undefined') {
    console.log('🔧 WebSocket diagnostic tool loaded. Run diagnoseWebSocketIssues() to start.');
}
