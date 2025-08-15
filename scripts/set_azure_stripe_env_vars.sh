#!/bin/bash
# Bash script to set Stripe environment variables in Azure Container Apps

RESOURCE_GROUP="poehr-scheduling-rg"
CONTAINER_APP_NAME="poehr-scheduling"

echo "Setting Stripe Price ID environment variables in Azure Container Apps..."

# Set the environment variables
az containerapp update \
    --name $CONTAINER_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --set-env-vars \
        STRIPE_BASIC_PRICE_ID="price_1RwC4aFfk7zi0PnMzpA9gILD" \
        STRIPE_PREMIUM_PRICE_ID="price_1RwC59Ffk7zi0PnM0oOnjBmn" \
        STRIPE_ENTERPRISE_PRICE_ID="price_1RwC60Ffk7zi0PnM7vmJn3P1"

echo "Environment variables set successfully!"
echo "The container app will restart automatically with the new configuration."

# Check the updated configuration
echo ""
echo "Verifying environment variables..."
az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.template.containers[0].env[?name=='STRIPE_BASIC_PRICE_ID']" --output table
az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.template.containers[0].env[?name=='STRIPE_PREMIUM_PRICE_ID']" --output table
az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.template.containers[0].env[?name=='STRIPE_ENTERPRISE_PRICE_ID']" --output table

echo ""
echo "Done! Your Stripe integration should now work with live price IDs."
