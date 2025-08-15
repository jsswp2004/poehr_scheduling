# Azure Container Apps Environment Variables Setup Guide

## Problem

Getting error: `No such price: 'price_test_basic'` because Azure Container Apps doesn't have the actual Stripe price IDs configured.

## Solution

Add the following environment variables to your Azure Container Apps configuration:

### Steps to Add Environment Variables in Azure Portal:

1. **Login to Azure Portal**: https://portal.azure.com
2. **Navigate to Container Apps**: Search for "Container Apps" in the search bar
3. **Select your app**: Click on "poehr-scheduling"
4. **Go to Configuration**: In the left sidebar, click "Configuration"
5. **Click Environment variables**: Select the "Environment variables" tab
6. **Add the following variables** by clicking "Add":

```
Name: STRIPE_BASIC_PRICE_ID
Value: price_1RwC4aFfk7zi0PnMzpA9gILD

Name: STRIPE_PREMIUM_PRICE_ID
Value: price_1RwC59Ffk7zi0PnM0oOnjBmn

Name: STRIPE_ENTERPRISE_PRICE_ID
Value: price_1RwC60Ffk7zi0PnM7vmJn3P1
```

7. **Save**: Click "Save" button at the top
8. **Restart**: The container will automatically restart with new environment variables

### Alternative: Using Azure CLI (if installed)

Run this PowerShell script:

```powershell
.\scripts\set_azure_stripe_env_vars.ps1
```

Or this Bash script:

```bash
./scripts/set_azure_stripe_env_vars.sh
```

### Verification

After setting the environment variables, test the enrollment functionality. The error should be resolved and Stripe should use your actual price IDs instead of the test ones.

### Important Notes

- The container app will restart automatically when you save environment variables
- It may take 30-60 seconds for the restart to complete
- Make sure you're using the exact price IDs from your Stripe dashboard

## Expected Result

After setting these environment variables, enrollment should work without the "No such price" error.
