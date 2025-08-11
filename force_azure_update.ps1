# Force Azure Container App Update - Aug 11 2025
Write-Host "🚀 FORCE Azure Container App Update - Aug 11 2025" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

# Get current commit hash
$commitHash = git rev-parse HEAD
Write-Host "Current commit: $commitHash" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔧 Step 1: Login to Azure (if not already logged in)" -ForegroundColor Cyan
Write-Host "az login" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Step 2: Update container app to use specific commit image" -ForegroundColor Cyan
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Write-Host "az containerapp update \\" -ForegroundColor White
Write-Host "  --name poehr-scheduling \\" -ForegroundColor White
Write-Host "  --resource-group poehr-scheduling-rg \\" -ForegroundColor White
Write-Host "  --image poehrschedulingacr.azurecr.io/poehr-scheduling:$commitHash \\" -ForegroundColor White
Write-Host "  --revision-suffix $timestamp \\" -ForegroundColor White
Write-Host "  --min-replicas 1 \\" -ForegroundColor White
Write-Host "  --max-replicas 1" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Step 3: Alternative - Force update with latest tag" -ForegroundColor Cyan
Write-Host "az containerapp update \\" -ForegroundColor White
Write-Host "  --name poehr-scheduling \\" -ForegroundColor White
Write-Host "  --resource-group poehr-scheduling-rg \\" -ForegroundColor White
Write-Host "  --image poehrschedulingacr.azurecr.io/poehr-scheduling:latest \\" -ForegroundColor White
Write-Host "  --revision-suffix $timestamp \\" -ForegroundColor White
Write-Host "  --min-replicas 1 \\" -ForegroundColor White
Write-Host "  --max-replicas 1" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Step 4: Verify the deployment" -ForegroundColor Cyan
Write-Host "az containerapp show \\" -ForegroundColor White
Write-Host "  --name poehr-scheduling \\" -ForegroundColor White
Write-Host "  --resource-group poehr-scheduling-rg \\" -ForegroundColor White
Write-Host "  --query 'properties.template.containers[0].image' \\" -ForegroundColor White
Write-Host "  --output tsv" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Step 5: Check if new frontend is served" -ForegroundColor Cyan
Write-Host "curl -s 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/' | Select-String 'main\.[a-f0-9]*\.js'" -ForegroundColor White
Write-Host ""

Write-Host "✅ Expected frontend file: main.e4f41ea3.js (contains DEPLOYMENT TEST ACTIVE)" -ForegroundColor Green
Write-Host "❌ Current frontend file: main.742304e6.js (old version)" -ForegroundColor Red
Write-Host ""

Write-Host "📋 What to look for after update:" -ForegroundColor Yellow
Write-Host "- New JavaScript file: main.e4f41ea3.js" -ForegroundColor White
Write-Host "- Deployment banner: 🚨🚨🚨 DEPLOYMENT TEST ACTIVE - AUG 11 2025" -ForegroundColor White
Write-Host "- Red banner with yellow border on Patient Details page" -ForegroundColor White

Write-Host ""
Write-Host "💡 Quick test command:" -ForegroundColor Magenta
Write-Host "Invoke-WebRequest -Uri 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/' | Select-String 'main\.[a-f0-9]*\.js'" -ForegroundColor White
