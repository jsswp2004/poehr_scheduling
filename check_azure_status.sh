#!/bin/bash

# Azure Container App Status Check
# Monitors deployment and migration status

echo "🔍 Checking Azure Container App status..."

# Check deployment status
echo "📋 Current deployments:"
az containerapp revision list \
    --name poehr-scheduling-backend \
    --resource-group rg-poehr-scheduling \
    --query "[].{Name:name,Active:properties.active,CreationTime:properties.createdTime,State:properties.provisioningState}" \
    --output table

echo ""
echo "📊 Getting latest logs..."

# Get the latest logs from the container app
az containerapp logs show \
    --name poehr-scheduling-backend \
    --resource-group rg-poehr-scheduling \
    --follow false \
    --tail 50

echo ""
echo "🔧 If migrations haven't run, you can manually trigger them by running:"
echo "az containerapp exec --name poehr-scheduling-backend --resource-group rg-poehr-scheduling --command 'python manage.py migrate communicator'"

echo ""
echo "📝 Or run the Django shell to check table status:"
echo "az containerapp exec --name poehr-scheduling-backend --resource-group rg-poehr-scheduling --command 'python manage.py shell'"
