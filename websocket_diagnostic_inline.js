// Direct WebSocket Azure Diagnostic (Paste this in browser console)

console.log('🔍 WebSocket Azure Container Apps Diagnostic');
console.log('=============================================');

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

// Test 1: HTTP Endpoint Check
console.log('\n🧪 Test 1: HTTP Endpoint Check');
fetch('/ws/presence/')
    .then(response => {
        console.log('   HTTP Response Status:', response.status);
        console.log('   HTTP Response Headers:', Object.fromEntries(response.headers.entries()));
        if (response.status !== 200) {
            console.log('   ❌ HTTP endpoint not returning 200 - this is the problem!');
        }
        return response.text();
    })
    .then(text => {
        console.log('   HTTP Response Preview:', text.substring(0, 200));
        if (text.includes('<!doctype html>') || text.includes('<html>')) {
            console.log('   ❌ Getting HTML response instead of WebSocket upgrade - Django routing issue!');
        }
    })
    .catch(error => {
        console.log('   HTTP Error:', error.message);
    });

// Test 2: WebSocket Connection with detailed monitoring
console.log('\n🧪 Test 2: WebSocket Connection Test');
const ws = new WebSocket(wsUrl);

let connectionStartTime = Date.now();

const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
        console.log('   ⏰ Connection timeout after 10 seconds - definitely a server issue');
        ws.close();
    }
}, 10000);

ws.onopen = function (event) {
    clearTimeout(timeout);
    const connectionTime = Date.now() - connectionStartTime;
    console.log(`   ✅ WebSocket connection opened successfully in ${connectionTime}ms!`);
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

ws.onmessage = function (event) {
    console.log('   📥 Received message:', event.data);
    try {
        const data = JSON.parse(event.data);
        console.log('   📋 Parsed message:', data);
    } catch (e) {
        console.log('   ⚠️ Could not parse message as JSON');
    }
};

ws.onerror = function (event) {
    clearTimeout(timeout);
    const connectionTime = Date.now() - connectionStartTime;
    console.log(`   ❌ WebSocket error occurred after ${connectionTime}ms`);
    console.log('   Error details:', {
        type: event.type,
        target: event.target,
        readyState: ws.readyState,
        url: ws.url
    });

    // Check readyState for specific diagnosis
    if (ws.readyState === 3) {
        console.log('   🔧 ReadyState 3 (CLOSED) - Connection failed immediately');
        console.log('   🔧 This indicates the server rejected the WebSocket upgrade request');
    }
};

ws.onclose = function (event) {
    clearTimeout(timeout);
    const connectionTime = Date.now() - connectionStartTime;
    console.log(`   🔌 WebSocket connection closed after ${connectionTime}ms`);
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
        1006: 'Abnormal closure - likely server crashed or network issue',
        1007: 'Invalid frame payload data',
        1008: 'Policy violation',
        1009: 'Message too big',
        1010: 'Mandatory extension',
        1011: 'Internal server error - Django/ASGI problem',
        1015: 'TLS handshake failure'
    };

    console.log('   📋 Close code meaning:', closeCodes[event.code] || `Unknown code ${event.code}`);

    if (event.code === 1006) {
        console.log('   ❌ DIAGNOSIS: Abnormal closure - Azure Container Apps likely not handling WebSocket upgrades');
        console.log('   💡 SOLUTION: Check ASGI configuration and Azure ingress settings');
    } else if (event.code === 1011) {
        console.log('   ❌ DIAGNOSIS: Internal server error - Django ASGI application problem');
        console.log('   💡 SOLUTION: Check Django logs for ASGI import/setup errors');
    } else if (event.code === 1002) {
        console.log('   ❌ DIAGNOSIS: Protocol error - WebSocket upgrade failed');
        console.log('   💡 SOLUTION: Server is not properly handling WebSocket protocol upgrade');
    }
};

console.log('\n💡 Diagnostic test started. Watch for results above...');
