#!/bin/bash

# Deployment Monitor Script
# Monitors Cloud Run deployment and WebSocket setup progress

echo "🔍 Cloud Run Deployment Monitor"
echo "=============================="
echo "$(date): Starting deployment monitoring..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVICE_URL="https://poehr-scheduling-mjf5efdj3a-uc.a.run.app"
HEALTH_ENDPOINT="$SERVICE_URL/health/"
WS_ENDPOINT="$SERVICE_URL/ws/presence/"

# Function to get current deployment timestamp
get_deployment_time() {
    curl -s -I "$HEALTH_ENDPOINT" | grep -i "date:" | cut -d' ' -f2-
}

# Function to check service status
check_service_status() {
    local status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT")
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$HEALTH_ENDPOINT")
    
    echo -e "${BLUE}📡 Service Status Check:${NC}"
    echo "  HTTP Status: $status"
    echo "  Response Time: ${response_time}s"
    echo "  Timestamp: $(date)"
    
    if [ "$status" = "200" ]; then
        echo -e "  ${GREEN}✅ Service is responding${NC}"
        return 0
    else
        echo -e "  ${RED}❌ Service not responding properly${NC}"
        return 1
    fi
}

# Function to check WebSocket endpoint
check_websocket_endpoint() {
    echo -e "${BLUE}🔌 WebSocket Endpoint Check:${NC}"
    
    local ws_response=$(curl -s "$WS_ENDPOINT" | head -1)
    
    if [[ "$ws_response" == *"<!doctype html>"* ]]; then
        echo -e "  ${RED}❌ Still returning HTML (old deployment)${NC}"
        echo "  Response: $ws_response"
        return 1
    elif [[ "$ws_response" == *"WebSocket"* ]] || [[ "$ws_response" == *"upgrade"* ]]; then
        echo -e "  ${GREEN}✅ WebSocket endpoint responding correctly${NC}"
        return 0
    else
        echo -e "  ${YELLOW}⚠️  Unexpected response${NC}"
        echo "  Response: $ws_response"
        return 2
    fi
}

# Function to test WebSocket connection
test_websocket_connection() {
    echo -e "${BLUE}🧪 WebSocket Connection Test:${NC}"
    
    # Try to connect with a simple WebSocket test
    timeout 5 bash -c "exec 3<>/dev/tcp/poehr-scheduling-mjf5efdj3a-uc.a.run.app/443" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✅ Can establish TCP connection to service${NC}"
        exec 3>&-
    else
        echo -e "  ${RED}❌ Cannot establish TCP connection${NC}"
    fi
}

# Function to monitor for a specific time period
monitor_deployment() {
    local max_checks=20
    local check_interval=30
    local check_count=0
    
    echo -e "${YELLOW}🕐 Starting deployment monitoring (${max_checks} checks, ${check_interval}s intervals)${NC}"
    echo ""
    
    while [ $check_count -lt $max_checks ]; do
        echo -e "${BLUE}📋 Check $((check_count + 1))/${max_checks} - $(date)${NC}"
        echo "----------------------------------------"
        
        # Check service status
        if check_service_status; then
            echo ""
            
            # Check WebSocket endpoint
            if check_websocket_endpoint; then
                echo -e "${GREEN}🎉 WebSocket deployment appears successful!${NC}"
                echo ""
                echo -e "${YELLOW}🧪 Next steps:${NC}"
                echo "1. Test WebSocket connection in browser console"
                echo "2. Check application logs for ASGI setup messages"
                echo "3. Verify presence functionality works"
                break
            elif [ $? -eq 2 ]; then
                echo -e "${YELLOW}⚠️  Deployment might be in progress...${NC}"
            fi
            
            echo ""
            test_websocket_connection
        fi
        
        check_count=$((check_count + 1))
        
        if [ $check_count -lt $max_checks ]; then
            echo ""
            echo -e "${YELLOW}⏳ Waiting ${check_interval} seconds for next check...${NC}"
            echo ""
            sleep $check_interval
        fi
    done
    
    if [ $check_count -ge $max_checks ]; then
        echo -e "${RED}⏰ Monitoring period completed. Manual check may be needed.${NC}"
    fi
}

# Main execution
echo "🚀 Initial deployment status:"
check_service_status
echo ""
check_websocket_endpoint
echo ""

echo -e "${YELLOW}💡 Monitoring tips:${NC}"
echo "- New deployments typically take 3-5 minutes"
echo "- Look for changes in response headers or content"
echo "- Check Cloud Run logs for detailed startup messages"
echo ""

read -p "Start continuous monitoring? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    monitor_deployment
else
    echo "Manual monitoring mode. Run this script again to check status."
fi

echo ""
echo -e "${BLUE}📋 Useful links:${NC}"
echo "- Cloud Run Service: https://console.cloud.google.com/run/detail/us-central1/poehr-scheduling?project=poehr-364520"
echo "- Service Logs: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22poehr-scheduling%22?project=poehr-364520"
echo "- Cloud Build: https://console.cloud.google.com/cloud-build/builds?project=poehr-364520"
