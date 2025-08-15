#!/bin/bash

# Script to configure Stripe environment variables in Azure Container Apps
# Run this script to set up the Stripe price IDs in your Azure deployment

RESOURCE_GROUP="poehr-scheduling-rg"
CONTAINER_APP_NAME="poehr-scheduling"

echo "🔧 Configuring Stripe Price IDs in Azure Container Apps..."

# Set the Stripe Price IDs
echo "Setting STRIPE_BASIC_PRICE_ID..."
az containerapp env var set \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars STRIPE_BASIC_PRICE_ID=price_1RwC4aFfk7zi0PnMzpA9gILD

echo "Setting STRIPE_PREMIUM_PRICE_ID..."
az containerapp env var set \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars STRIPE_PREMIUM_PRICE_ID=price_1RwC59Ffk7zi0PnM0oOnjBmn

echo "Setting STRIPE_ENTERPRISE_PRICE_ID..."
az containerapp env var set \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars STRIPE_ENTERPRISE_PRICE_ID=price_1RwC60Ffk7zi0PnM7vmJn3P1

echo "✅ Stripe Price IDs configured successfully!"

# Verify the configuration
echo "🔍 Verifying configuration..."
az containerapp env var list \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "[?contains(name, 'STRIPE')].{Name:name, Value:value}" \
  --output table

echo "🚀 Configuration complete! The container app will restart automatically with the new environment variables."
