#!/bin/bash

# Simple Azure Container App Update Script
# This script updates the container app with the new v7 image

set -e

echo "🔄 Updating Azure Container App with v7 image..."

# Check if we have access to az command
if command -v az >/dev/null 2>&1; then
    echo "✅ Azure CLI found, updating container app..."
    az containerapp update \
        --name poehr-scheduling \
        --resource-group poehr-scheduling-rg \
        --image poehrschedulingacr.azurecr.io/poehr-scheduling:v7
    echo "✅ Container app updated successfully!"
else
    echo "❌ Azure CLI not found"
    echo "📋 Manual steps required:"
    echo ""
    echo "1. Go to Azure Portal: https://portal.azure.com"
    echo "2. Navigate to Container Apps"
    echo "3. Select 'poehr-scheduling' app"
    echo "4. Go to 'Containers' tab"
    echo "5. Edit the container"
    echo "6. Update image to: poehrschedulingacr.azurecr.io/poehr-scheduling:v7"
    echo "7. Save and apply changes"
    echo ""
    echo "📦 Image v7 is ready and pushed to registry"
    echo "🔧 Contains fixes for:"
    echo "   - Static files configuration (STATICFILES_DIRS)"
    echo "   - React build with updated file hashes"
    echo "   - Django template serving for React frontend"
fi
