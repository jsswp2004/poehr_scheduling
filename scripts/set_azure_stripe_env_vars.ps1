# PowerShell script to set Stripe environment variables in Azure Container Apps

$ResourceGroup = "poehr-scheduling-rg"
$ContainerAppName = "poehr-scheduling"

Write-Host "Setting Stripe Price ID environment variables in Azure Container Apps..." -ForegroundColor Green

# Set the environment variables
az containerapp update `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --set-env-vars `
        STRIPE_BASIC_PRICE_ID="price_1RwC4aFfk7zi0PnMzpA9gILD" `
        STRIPE_PREMIUM_PRICE_ID="price_1RwC59Ffk7zi0PnM0oOnjBmn" `
        STRIPE_ENTERPRISE_PRICE_ID="price_1RwC60Ffk7zi0PnM7vmJn3P1"

Write-Host "Environment variables set successfully!" -ForegroundColor Green
Write-Host "The container app will restart automatically with the new configuration." -ForegroundColor Yellow

# Check the updated configuration
Write-Host "`nVerifying environment variables..." -ForegroundColor Blue
az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.template.containers[0].env[?name=='STRIPE_BASIC_PRICE_ID']" --output table
az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.template.containers[0].env[?name=='STRIPE_PREMIUM_PRICE_ID']" --output table
az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query "properties.template.containers[0].env[?name=='STRIPE_ENTERPRISE_PRICE_ID']" --output table

Write-Host "`nDone! Your Stripe integration should now work with live price IDs." -ForegroundColor Green
