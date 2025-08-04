#!/bin/bash

echo "🔍 Checking deployment status and WebSocket setup..."
echo ""

# Test 1: Check if service is running
echo "📡 Testing main service..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://poehr-scheduling-mjf5efdj3a-uc.a.run.app/health/")
echo "Service status: $STATUS"

# Test 2: Check WebSocket endpoint response
echo ""
echo "🔌 Testing WebSocket endpoint..."
WS_RESPONSE=$(curl -s "https://poehr-scheduling-mjf5efdj3a-uc.a.run.app/ws/presence/" | head -1)
echo "WebSocket endpoint returns: $WS_RESPONSE"

# Test 3: Check if it's returning HTML (wrong) or WebSocket response
if [[ "$WS_RESPONSE" == *"<!doctype html>"* ]]; then
    echo "❌ WebSocket endpoint returning HTML - routing issue detected"
    echo ""
    echo "🔧 This means:"
    echo "  - WebSocket routing is not working"
    echo "  - Requests are falling back to Django's default URL handling"
    echo "  - ASGI ProtocolTypeRouter may not be configured correctly"
else
    echo "✅ WebSocket endpoint responding correctly"
fi

echo ""
echo "🔍 To check deployment logs:"
echo "1. Go to: https://console.cloud.google.com/run/detail/us-central1/poehr-scheduling?project=poehr-364520"
echo "2. Click the 'LOGS' tab"
echo "3. Look for messages starting with:"
echo "   - '🔧 Setting up Django...'"
echo "   - '📦 Testing channels import...'"
echo "   - '✅ ASGI Protocol Router configured...'"
echo "   - '❌ Import error in ASGI setup...'"
echo ""
echo "🧪 To test WebSocket manually:"
echo "1. Open browser console on your app"
echo "2. Run: testWebSocket()"
echo "3. Check for connection errors"
