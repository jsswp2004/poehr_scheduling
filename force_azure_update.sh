#!/bin/bash

echo "🚀 FORCE Azure Container App Update - Aug 11 2025"
echo "=================================================="
echo ""

# Get current commit hash
COMMIT_HASH=$(git rev-parse HEAD)
echo "Current commit: $COMMIT_HASH"
echo ""

echo "🔧 Step 1: Login to Azure (if not already logged in)"
echo "az login"
echo ""

echo "🔧 Step 2: Update container app to use specific commit image"
echo "az containerapp update \\"
echo "  --name poehr-scheduling \\"
echo "  --resource-group poehr-scheduling-rg \\"
echo "  --image poehrschedulingacr.azurecr.io/poehr-scheduling:$COMMIT_HASH \\"
echo "  --revision-suffix $(date +%s) \\"
echo "  --min-replicas 1 \\"
echo "  --max-replicas 1"
echo ""

echo "🔧 Step 3: Alternative - Force update with latest tag"
echo "az containerapp update \\"
echo "  --name poehr-scheduling \\"
echo "  --resource-group poehr-scheduling-rg \\"
echo "  --image poehrschedulingacr.azurecr.io/poehr-scheduling:latest \\"
echo "  --revision-suffix $(date +%s) \\"
echo "  --min-replicas 1 \\"
echo "  --max-replicas 1"
echo ""

echo "🔧 Step 4: Force revision restart"
echo "az containerapp revision restart \\"
echo "  --name poehr-scheduling \\"
echo "  --resource-group poehr-scheduling-rg \\"
echo "  --revision-name \$(az containerapp revision list --name poehr-scheduling --resource-group poehr-scheduling-rg --query '[0].name' -o tsv)"
echo ""

echo "🔧 Step 5: Verify the deployment"
echo "az containerapp show \\"
echo "  --name poehr-scheduling \\"
echo "  --resource-group poehr-scheduling-rg \\"
echo "  --query 'properties.template.containers[0].image' \\"
echo "  --output tsv"
echo ""

echo "🔧 Step 6: Check if new frontend is served"
echo "curl -s 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/' | grep -o 'main\.[a-f0-9]*\.js'"
echo ""

echo "✅ Expected frontend file: main.e4f41ea3.js (contains DEPLOYMENT TEST ACTIVE)"
echo "❌ Current frontend file: main.742304e6.js (old version)"
echo ""

echo "📋 What to look for after update:"
echo "- New JavaScript file: main.e4f41ea3.js"
echo "- Deployment banner: 🚨🚨🚨 DEPLOYMENT TEST ACTIVE - AUG 11 2025"
echo "- Red banner with yellow border on Patient Details page"
