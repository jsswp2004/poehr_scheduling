#!/bin/bash

# WebSocket Connection Test Script
# This script tests WebSocket connectivity to your deployed service

echo "🧪 WebSocket Connection Test"
echo "=============================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="poehr-364520"
SERVICE_NAME="poehr-scheduling"
REGION="us-central1"

echo -e "${YELLOW}📋 Test Configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Service: $SERVICE_NAME"
echo "  Region: $REGION"
echo ""

# Test 1: Check if service is deployed
echo -e "${YELLOW}🔍 Test 1: Checking service deployment...${NC}"
if command -v gcloud &> /dev/null; then
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)" 2>/dev/null)
    if [ $? -eq 0 ] && [ ! -z "$SERVICE_URL" ]; then
        echo -e "${GREEN}✅ Service is deployed at: $SERVICE_URL${NC}"
    else
        echo -e "${RED}❌ Service not found or not accessible${NC}"
        SERVICE_URL="https://poehr-scheduling-mjf5efdj3a-uc.a.run.app"
        echo -e "${YELLOW}⚠️  Using fallback URL: $SERVICE_URL${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  gcloud CLI not available, using fallback URL${NC}"
    SERVICE_URL="https://poehr-scheduling-mjf5efdj3a-uc.a.run.app"
fi

# Convert HTTP URL to WebSocket URL
WS_URL=$(echo $SERVICE_URL | sed 's/https:/wss:/' | sed 's/http:/ws:/')
WS_ENDPOINT="${WS_URL}/ws/presence/"

echo ""
echo -e "${YELLOW}🔌 WebSocket Test Endpoint: $WS_ENDPOINT${NC}"
echo ""

# Test 2: Check HTTP health
echo -e "${YELLOW}🔍 Test 2: Checking HTTP health...${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health/" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ HTTP health check passed (Status: $HTTP_STATUS)${NC}"
elif [ "$HTTP_STATUS" = "000" ]; then
    echo -e "${RED}❌ HTTP connection failed (curl error)${NC}"
else
    echo -e "${YELLOW}⚠️  HTTP health check returned status: $HTTP_STATUS${NC}"
fi

# Test 3: WebSocket connectivity test
echo ""
echo -e "${YELLOW}🔍 Test 3: WebSocket connectivity test...${NC}"
echo -e "${YELLOW}📝 To test WebSocket manually:${NC}"
echo ""
echo "1. Open your browser developer console"
echo "2. Navigate to: $SERVICE_URL"
echo "3. Run this JavaScript code:"
echo ""
echo "// WebSocket Connection Test"
echo "const testWebSocket = () => {"
echo "  const token = localStorage.getItem('token');"
echo "  if (!token) {"
echo "    console.log('❌ Please log in first to get auth token');"
echo "    return;"
echo "  }"
echo "  "
echo "  const wsUrl = '$WS_ENDPOINT?token=' + token;"
echo "  console.log('🔌 Connecting to:', wsUrl);"
echo "  "
echo "  const ws = new WebSocket(wsUrl);"
echo "  "
echo "  ws.onopen = () => {"
echo "    console.log('✅ WebSocket connected successfully!');"
echo "    ws.send(JSON.stringify({ type: 'heartbeat' }));"
echo "  };"
echo "  "
echo "  ws.onmessage = (event) => {"
echo "    console.log('📨 Received:', JSON.parse(event.data));"
echo "  };"
echo "  "
echo "  ws.onerror = (error) => {"
echo "    console.log('❌ WebSocket error:', error);"
echo "  };"
echo "  "
echo "  ws.onclose = (event) => {"
echo "    console.log('🔌 WebSocket closed:', event.code, event.reason);"
echo "  };"
echo "  "
echo "  // Store reference for manual testing"
echo "  window.testWs = ws;"
echo "  console.log('💡 WebSocket stored in window.testWs');"
echo "};"
echo ""
echo "testWebSocket();"
echo ""

# Test 4: Check Cloud Run logs
echo -e "${YELLOW}🔍 Test 4: Recent service logs...${NC}"
if command -v gcloud &> /dev/null; then
    echo "Recent logs from the service:"
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit=10 --format="table(timestamp,textPayload)" 2>/dev/null || echo "Could not fetch logs (check permissions)"
else
    echo "gcloud CLI not available - cannot fetch logs"
fi

echo ""
echo -e "${GREEN}🎯 WebSocket Test Summary:${NC}"
echo -e "${GREEN}  Main Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}  WebSocket Endpoint: $WS_ENDPOINT${NC}"
echo -e "${GREEN}  Expected WebSocket URL format: ${WS_ENDPOINT}?token=YOUR_JWT_TOKEN${NC}"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "1. Log into your application to get an auth token"
echo "2. Use the browser console test above to verify WebSocket connection"
echo "3. Check the WebSocket test page at: $SERVICE_URL/websocket-test"
echo "4. Monitor logs for any connection issues"
echo ""
