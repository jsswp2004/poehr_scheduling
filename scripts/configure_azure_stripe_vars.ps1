# PowerShell script to configure Stripe environment variables in Azure Container Apps
# Run this script to set up the Stripe price IDs in your Azure deployment

$RESOURCE_GROUP = "poehr-scheduling-rg"
$CONTAINER_APP_NAME = "poehr-scheduling"

Write-Host "🔧 Configuring Stripe Price IDs in Azure Container Apps..." -ForegroundColor Blue

# Set the Stripe Price IDs
Write-Host "Setting STRIPE_BASIC_PRICE_ID..." -ForegroundColor Yellow
az containerapp env var set `
  --name $CONTAINER_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --set-env-vars STRIPE_BASIC_PRICE_ID=price_1RwC4aFfk7zi0PnMzpA9gILD

Write-Host "Setting STRIPE_PREMIUM_PRICE_ID..." -ForegroundColor Yellow
az containerapp env var set `
  --name $CONTAINER_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --set-env-vars STRIPE_PREMIUM_PRICE_ID=price_1RwC59Ffk7zi0PnM0oOnjBmn

Write-Host "Setting STRIPE_ENTERPRISE_PRICE_ID..." -ForegroundColor Yellow
az containerapp env var set `
  --name $CONTAINER_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --set-env-vars STRIPE_ENTERPRISE_PRICE_ID=price_1RwC60Ffk7zi0PnM7vmJn3P1

Write-Host "✅ Stripe Price IDs configured successfully!" -ForegroundColor Green

# Verify the configuration
Write-Host "🔍 Verifying configuration..." -ForegroundColor Blue
az containerapp env var list `
  --name $CONTAINER_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "[?contains(name, 'STRIPE')].{Name:name, Value:value}" `
  --output table

Write-Host "🚀 Configuration complete! The container app will restart automatically with the new environment variables." -ForegroundColor Green
