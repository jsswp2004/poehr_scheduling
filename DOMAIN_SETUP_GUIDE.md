# Custom Domain Setup Guide: powerhealthcareit.com

This guide walks you through setting up your custom domain `powerhealthcareit.com` with your Azure Container Apps deployment.

## 📋 Prerequisites

1. Domain registered: `powerhealthcareit.com` ✅
2. Azure Container App deployed ✅
3. Azure CLI installed
4. Domain registrar access (to configure DNS)

## 🔧 Configuration Files Updated

The following files have been updated to support your custom domain:

### Backend (Django)
- `settings_azure.py`: Added domain to ALLOWED_HOSTS and CORS_ALLOWED_ORIGINS
- Added CSRF_TRUSTED_ORIGINS for your domain
- Added email configuration for @powerhealthcareit.com

### Frontend (React)
- `config/api.js`: Updated to use your domain in production
- WebSocket configuration updated for domain

### Azure Deployment
- `azure-container-app.yaml`: Added custom domain configuration
- `.env.production`: Environment variables for production

## 🌐 DNS Configuration (REQUIRED FIRST STEP)

**You need to configure DNS at your domain registrar BEFORE Azure setup:**

1. Log into your domain registrar (where you bought powerhealthcareit.com)
2. Go to DNS management/DNS settings
3. Add these DNS records:

```
Type: CNAME
Name: @  (or powerhealthcareit.com)
Value: [YOUR-AZURE-APP-URL].azurecontainerapps.io
TTL: 300 (or minimum allowed)

Type: CNAME  
Name: www
Value: [YOUR-AZURE-APP-URL].azurecontainerapps.io
TTL: 300 (or minimum allowed)
```

**To find your Azure app URL:**
```bash
az containerapp show --name poehr-scheduling --resource-group [YOUR-RESOURCE-GROUP] --query 'properties.configuration.ingress.fqdn' -o tsv
```

## 🚀 Azure Configuration Steps

### 1. Get Your Container App Information
```bash
# List your resource groups
az group list --output table

# List container apps in your resource group
az containerapp list --resource-group [YOUR-RESOURCE-GROUP] --output table

# Get your app's current URL
az containerapp show --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP] --query 'properties.configuration.ingress.fqdn' -o tsv
```

### 2. Add Custom Domain to Azure Container Apps
```bash
# Add the main domain
az containerapp hostname add \
  --hostname powerhealthcareit.com \
  --resource-group [YOUR-RESOURCE-GROUP] \
  --name [YOUR-APP-NAME]

# Add the www subdomain
az containerapp hostname add \
  --hostname www.powerhealthcareit.com \
  --resource-group [YOUR-RESOURCE-GROUP] \
  --name [YOUR-APP-NAME]
```

### 3. Enable SSL Certificates (Managed Certificates)
```bash
# Create managed certificate for main domain
az containerapp ssl upload \
  --hostname powerhealthcareit.com \
  --resource-group [YOUR-RESOURCE-GROUP] \
  --name [YOUR-APP-NAME]

# Create managed certificate for www subdomain  
az containerapp ssl upload \
  --hostname www.powerhealthcareit.com \
  --resource-group [YOUR-RESOURCE-GROUP] \
  --name [YOUR-APP-NAME]
```

### 4. Update Environment Variables
```bash
az containerapp update \
  --name [YOUR-APP-NAME] \
  --resource-group [YOUR-RESOURCE-GROUP] \
  --set-env-vars \
  'DJANGO_ALLOWED_HOSTS=powerhealthcareit.com,www.powerhealthcareit.com,*.azurecontainerapps.io' \
  'REACT_APP_API_URL=https://powerhealthcareit.com' \
  'REACT_APP_WS_URL=wss://powerhealthcareit.com' \
  'SITE_URL=https://powerhealthcareit.com' \
  'FRONTEND_URL=https://powerhealthcareit.com' \
  'DEFAULT_FROM_EMAIL=noreply@powerhealthcareit.com'
```

## ✅ Verification Steps

### 1. Check DNS Propagation
```bash
# Check if DNS is propagating
nslookup powerhealthcareit.com
nslookup www.powerhealthcareit.com

# Online tools:
# https://dnschecker.org/
# https://www.whatsmydns.net/
```

### 2. Test Your Domain
```bash
# Test main domain
curl -I https://powerhealthcareit.com

# Test www subdomain  
curl -I https://www.powerhealthcareit.com

# Test API endpoint
curl -I https://powerhealthcareit.com/api/health/
```

### 3. Verify in Browser
- Visit: https://powerhealthcareit.com
- Visit: https://www.powerhealthcareit.com
- Check that both redirect properly and show your application
- Verify SSL certificate is valid (green lock icon)

## 🔧 Troubleshooting

### DNS Issues
```bash
# Check current DNS settings
dig powerhealthcareit.com
dig www.powerhealthcareit.com

# Check Azure Container App status
az containerapp show --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP]
```

### SSL Certificate Issues
```bash
# List current certificates
az containerapp ssl list --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP]

# Check certificate status
az containerapp hostname list --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP]
```

### Application Issues
```bash
# Check application logs
az containerapp logs show --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP] --follow

# Check environment variables
az containerapp show --name [YOUR-APP-NAME] --resource-group [YOUR-RESOURCE-GROUP] --query 'properties.template.containers[0].env'
```

## 📧 Email Configuration

Your email settings are now configured for `@powerhealthcareit.com`:
- Default from email: `noreply@powerhealthcareit.com`
- Server email: `admin@powerhealthcareit.com`

**To fully enable email:**
1. Set up email hosting for your domain (Gmail for Business, Office 365, etc.)
2. Update Django email settings with your email provider's SMTP details
3. Create the actual email accounts (noreply@, admin@, etc.)

## 🎯 Expected Timeline

1. **DNS Configuration**: 5-10 minutes to set up
2. **DNS Propagation**: 15 minutes - 2 hours (sometimes up to 24 hours)
3. **Azure Domain Setup**: 5-10 minutes after DNS propagates
4. **SSL Certificate**: 5-15 minutes to provision
5. **Testing & Verification**: 10-15 minutes

## 🔒 Security Notes

- SSL certificates are automatically managed by Azure
- HTTPS is enforced for all traffic
- CSRF protection is configured for your domain
- CORS is properly configured for frontend-backend communication

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify DNS configuration at your registrar
3. Check Azure Container Apps documentation
4. Contact Azure support for Azure-specific issues
