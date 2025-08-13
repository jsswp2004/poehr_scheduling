#!/bin/bash

# Azure Container Apps Custom Domain Configuration Script
# This script configures powerhealthcareit.com for your container app

# Configuration variables
RESOURCE_GROUP="your-resource-group"
CONTAINER_APP_NAME="poehr-scheduling"
DOMAIN_NAME="powerhealthcareit.com"
WWW_DOMAIN="www.powerhealthcareit.com"
ENVIRONMENT_NAME="your-environment-name"

echo "🌐 Configuring custom domain: $DOMAIN_NAME"
echo "📋 This script will help you set up your custom domain with Azure Container Apps"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first:"
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo "🔑 Please log in to Azure first:"
    echo "   az login"
    exit 1
fi

echo "✅ Azure CLI is installed and you are logged in"
echo ""

echo "📋 MANUAL STEPS REQUIRED:"
echo ""
echo "1. 🌐 DNS CONFIGURATION (Do this FIRST):"
echo "   - Log into your domain registrar (where you bought powerhealthcareit.com)"
echo "   - Add these DNS records:"
echo "     • CNAME: powerhealthcareit.com → [your-container-app-url].azurecontainerapps.io"
echo "     • CNAME: www.powerhealthcareit.com → [your-container-app-url].azurecontainerapps.io"
echo ""
echo "   Note: Replace [your-container-app-url] with your actual Azure Container App URL"
echo ""

echo "2. 🔧 GET YOUR CONTAINER APP INFO:"
echo "   Run this command to get your container app URL:"
echo "   az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query 'properties.configuration.ingress.fqdn' -o tsv"
echo ""

echo "3. 📜 ADD CUSTOM DOMAIN TO AZURE:"
echo "   After DNS is configured and propagated (wait 15-30 minutes), run:"
echo "   az containerapp hostname add --hostname $DOMAIN_NAME --resource-group $RESOURCE_GROUP --name $CONTAINER_APP_NAME"
echo "   az containerapp hostname add --hostname $WWW_DOMAIN --resource-group $RESOURCE_GROUP --name $CONTAINER_APP_NAME"
echo ""

echo "4. 🔒 ENABLE SSL CERTIFICATES:"
echo "   az containerapp ssl upload --hostname $DOMAIN_NAME --resource-group $RESOURCE_GROUP --name $CONTAINER_APP_NAME"
echo "   az containerapp ssl upload --hostname $WWW_DOMAIN --resource-group $RESOURCE_GROUP --name $CONTAINER_APP_NAME"
echo ""

echo "5. 🚀 UPDATE ENVIRONMENT VARIABLES:"
echo "   az containerapp update --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP \\"
echo "     --set-env-vars \\"
echo "     'DJANGO_ALLOWED_HOSTS=powerhealthcareit.com,www.powerhealthcareit.com,*.azurecontainerapps.io' \\"
echo "     'REACT_APP_API_URL=https://powerhealthcareit.com'"
echo ""

echo "6. ✅ VERIFY CONFIGURATION:"
echo "   - Visit https://powerhealthcareit.com"
echo "   - Visit https://www.powerhealthcareit.com"
echo "   - Check that both redirect properly and show your application"
echo ""

echo "📝 NEXT STEPS:"
echo "1. Complete the DNS configuration at your domain registrar"
echo "2. Wait for DNS propagation (15-30 minutes)"
echo "3. Run the Azure CLI commands above with your actual resource group and app names"
echo "4. Test your domain!"
echo ""

echo "🔧 TROUBLESHOOTING:"
echo "- Check DNS propagation: nslookup powerhealthcareit.com"
echo "- Verify Azure app status: az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP"
echo "- Check logs: az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP"
