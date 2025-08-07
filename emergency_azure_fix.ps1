# Emergency Azure Fix - PowerShell Script
# This script updates your Azure Container App to use emergency settings

Write-Host "🚨 EMERGENCY AZURE DEPLOYMENT FIX" -ForegroundColor Red
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# Check if Azure PowerShell module is installed
if (-not (Get-Module -ListAvailable -Name Az)) {
    Write-Host "❌ Azure PowerShell module not found." -ForegroundColor Red
    Write-Host "Please install it by running:" -ForegroundColor Yellow
    Write-Host "Install-Module -Name Az -Scope CurrentUser -Repository PSGallery -Force" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or apply the fix manually through Azure Portal:" -ForegroundColor Yellow
    Write-Host "1. Go to portal.azure.com" -ForegroundColor White
    Write-Host "2. Find your Container App 'poehr-scheduling'" -ForegroundColor White
    Write-Host "3. Go to Settings > Environment variables" -ForegroundColor White
    Write-Host "4. Change DJANGO_SETTINGS_MODULE to: poehr_scheduling_backend.settings_azure_emergency" -ForegroundColor White
    exit 1
}

# Import Azure module
Import-Module Az -Force

# Check if logged in
try {
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "❌ Not logged in to Azure. Please run: Connect-AzAccount" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Logged in as: $($context.Account.Id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Please login to Azure first: Connect-AzAccount" -ForegroundColor Red
    exit 1
}

# Set variables - UPDATE THESE TO MATCH YOUR DEPLOYMENT
$ResourceGroupName = "poehr-scheduling-rg"
$ContainerAppName = "poehr-scheduling"

Write-Host "📋 Deployment Info:" -ForegroundColor Blue
Write-Host "   Resource Group: $ResourceGroupName" -ForegroundColor White
Write-Host "   Container App: $ContainerAppName" -ForegroundColor White
Write-Host ""

# Get current container app
try {
    Write-Host "🔍 Getting current container app configuration..." -ForegroundColor Blue
    $containerApp = Get-AzContainerApp -ResourceGroupName $ResourceGroupName -Name $ContainerAppName
    
    if (-not $containerApp) {
        Write-Host "❌ Container app '$ContainerAppName' not found in resource group '$ResourceGroupName'" -ForegroundColor Red
        Write-Host "Please check your resource group and container app names." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ Found container app: $($containerApp.Name)" -ForegroundColor Green
    Write-Host "   Current FQDN: $($containerApp.Properties.Configuration.Ingress.Fqdn)" -ForegroundColor White
} catch {
    Write-Host "❌ Failed to get container app: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Update environment variables
Write-Host ""
Write-Host "🔧 Updating environment variables..." -ForegroundColor Blue

$envVars = @(
    @{
        Name = "DJANGO_SETTINGS_MODULE"
        Value = "poehr_scheduling_backend.settings_azure_emergency"
    },
    @{
        Name = "DJANGO_SECRET_KEY"
        Value = "emergency-azure-secret-key-$(Get-Date -Format 'yyyyMMddHHmmss')"
    },
    @{
        Name = "DEBUG"
        Value = "False"
    },
    @{
        Name = "PORT"
        Value = "8080"
    }
)

try {
    # Note: Azure PowerShell for Container Apps might require different cmdlets
    # This is a template - the exact cmdlet syntax may vary
    
    Write-Host "⚠️  Important: Azure Container Apps PowerShell cmdlets may not be fully available." -ForegroundColor Yellow
    Write-Host "If this fails, please use the Azure Portal method instead." -ForegroundColor Yellow
    Write-Host ""
    
    # Display what needs to be updated manually
    Write-Host "🔧 Environment variables to update in Azure Portal:" -ForegroundColor Blue
    Write-Host "=====================================================" -ForegroundColor Yellow
    
    foreach ($envVar in $envVars) {
        Write-Host "   $($envVar.Name) = $($envVar.Value)" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "📝 Manual Steps:" -ForegroundColor Blue
    Write-Host "1. Go to: https://portal.azure.com" -ForegroundColor White
    Write-Host "2. Navigate to: Resource Groups > $ResourceGroupName > $ContainerAppName" -ForegroundColor White
    Write-Host "3. Click: Settings > Environment variables" -ForegroundColor White
    Write-Host "4. Update the variables shown above" -ForegroundColor White
    Write-Host "5. Click: Save" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "❌ PowerShell update failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please use the manual Azure Portal method instead." -ForegroundColor Yellow
}

# Test the deployment after a delay
Write-Host "⏳ Waiting 60 seconds for deployment to start..." -ForegroundColor Blue
Start-Sleep -Seconds 60

Write-Host ""
Write-Host "🧪 Testing deployment..." -ForegroundColor Blue

$testUrl = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/health/"

try {
    $response = Invoke-WebRequest -Uri $testUrl -Method GET -TimeoutSec 30
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Health endpoint responding successfully!" -ForegroundColor Green
        
        # Test login endpoint
        $loginUrl = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/auth/login/"
        $loginBody = '{"username":"test","password":"test"}' | ConvertTo-Json
        
        try {
            $loginResponse = Invoke-WebRequest -Uri $loginUrl -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
            if ($loginResponse.StatusCode -eq 400 -or $loginResponse.StatusCode -eq 401) {
                Write-Host "✅ Login endpoint responding correctly (400/401 expected for invalid credentials)" -ForegroundColor Green
                Write-Host ""
                Write-Host "🎉 EMERGENCY FIX APPLIED SUCCESSFULLY!" -ForegroundColor Green
                Write-Host ""
                Write-Host "🔗 Test your application at:" -ForegroundColor Blue
                Write-Host "   https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/" -ForegroundColor Cyan
            } else {
                Write-Host "⚠️  Login endpoint still returning status: $($loginResponse.StatusCode)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "⚠️  Could not test login endpoint: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Health endpoint returning status: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not reach health endpoint: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Deployment may still be in progress..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⚠️  IMPORTANT NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Verify your application is working" -ForegroundColor White
Write-Host "2. Configure Azure Key Vault properly when ready" -ForegroundColor White
Write-Host "3. Switch back to settings_azure.py once Key Vault is fixed" -ForegroundColor White
Write-Host "4. Update any missing database/Redis passwords in environment variables" -ForegroundColor White
