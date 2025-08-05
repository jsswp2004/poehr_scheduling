#!/bin/bash

echo "🚀 Monitoring WebSocket Deployment Progress..."
echo "============================================="

# Monitor function
monitor_deployment() {
    local check_count=0
    local max_checks=60  # 30 minutes max
    
    while [ $check_count -lt $max_checks ]; do
        echo ""
        echo "📊 Check #$((check_count + 1)) - $(date)"
        
        # Check service status
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://poehr-scheduling-mjf5efdj3a-uc.a.run.app/health/")
        echo "🏥 Health Status: $STATUS"
        
        # Check for new deployment by looking at frontend hash
        FRONTEND_HASH=$(curl -s "https://poehr-scheduling-mjf5efdj3a-uc.a.run.app/" | grep -o 'main\.[a-z0-9]*\.js' | head -1)
        echo "🎨 Frontend Hash: $FRONTEND_HASH"
        
        # Check WebSocket endpoint
        WS_TEST=$(curl -s "https://poehr-scheduling-mjf5efdj3a-uc.a.run.app/ws/presence/" | head -c 50)
        if [[ "$WS_TEST" == *"<!doctype html>"* ]]; then
            echo "🔌 WebSocket: Still returning HTML (not deployed yet)"
        else
            echo "🔌 WebSocket: ✅ Routing working!"
            break
        fi
        
        # Wait 30 seconds between checks
        sleep 30
        check_count=$((check_count + 1))
    done
}

# Run monitoring
monitor_deployment

echo ""
echo "🎯 Monitoring completed!"
echo "💡 You can also check Cloud Build progress at:"
echo "   https://console.cloud.google.com/cloud-build/builds?project=poehr-364520"
