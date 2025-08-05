#!/bin/bash

# Azure Deployment Script for POEHR Scheduling
# This script automates the deployment process to Microsoft Azure

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - Update these values for your Azure environment
SUBSCRIPTION_ID="8b18b754-caeb-447c-9a8d-dd640611b91a"
RESOURCE_GROUP="poehr-scheduling-rg"
LOCATION="eastus"
ACR_NAME="poehrschedulingacr"
CONTAINER_APP_ENV="poehr-scheduling-env"
CONTAINER_APP_NAME="poehr-scheduling"
KEYVAULT_NAME="poehrschedulingkv1"
POSTGRES_SERVER="poehr-scheduling-postgres"
REDIS_CACHE="poehr-scheduling-redis"

# Database configuration
DB_NAME="poehr_db"
DB_USER="poehr_admin"
DB_PASSWORD_SECRET="database-password"

echo -e "${GREEN}🚀 Starting Microsoft Azure deployment for POEHR Scheduling${NC}"

# Function to check if Azure CLI is installed
check_azure_cli() {
    # Use Python Azure CLI module
    AZ_CMD="C:/Users/jsswp/POWER/poehr_scheduling/venv/Scripts/python.exe -m azure.cli"
    
    if ! $AZ_CMD --version &> /dev/null; then
        echo -e "${RED}❌ Azure CLI is not installed. Please install it first.${NC}"
        echo "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    fi
    echo -e "${GREEN}✅ Azure CLI is installed${NC}"
}

# Function to login to Azure
azure_login() {
    echo -e "${YELLOW}🔐 Checking Azure authentication...${NC}"
    
    if ! $AZ_CMD account show &> /dev/null; then
        echo -e "${YELLOW}⚠️  Not logged in to Azure. Starting login process...${NC}"
        $AZ_CMD login
    fi
    
    # Set the subscription
    $AZ_CMD account set --subscription "$SUBSCRIPTION_ID"
    echo -e "${GREEN}✅ Azure authentication confirmed${NC}"
    echo -e "${BLUE}📋 Using subscription: $($AZ_CMD account show --query name -o tsv)${NC}"
}

# Function to create resource group
create_resource_group() {
    echo -e "${YELLOW}📦 Creating resource group...${NC}"
    
    if $AZ_CMD group show --name "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  Resource group $RESOURCE_GROUP already exists${NC}"
    else
        $AZ_CMD group create \
            --name "$RESOURCE_GROUP" \
            --location "$LOCATION"
        echo -e "${GREEN}✅ Resource group created${NC}"
    fi
}

# Function to create Azure Container Registry
create_container_registry() {
    echo -e "${YELLOW}🐳 Setting up Azure Container Registry...${NC}"
    
    if $AZ_CMD acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  Container registry $ACR_NAME already exists${NC}"
    else
        $AZ_CMD acr create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$ACR_NAME" \
            --sku Basic \
            --admin-enabled true
        echo -e "${GREEN}✅ Container registry created${NC}"
    fi
    
    # Login to ACR
    $AZ_CMD acr login --name "$ACR_NAME"
    echo -e "${GREEN}✅ Logged in to Azure Container Registry${NC}"
}

# Function to create Key Vault
create_key_vault() {
    echo -e "${YELLOW}🔐 Setting up Azure Key Vault...${NC}"
    
    if $AZ_CMD keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  Key Vault $KEYVAULT_NAME already exists${NC}"
    else
        $AZ_CMD keyvault create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$KEYVAULT_NAME" \
            --location "$LOCATION"
        echo -e "${GREEN}✅ Key Vault created${NC}"
    fi
    
    # Store secrets (you'll need to update these with actual values)
    echo -e "${YELLOW}🔑 Storing application secrets...${NC}"
    
    # Generate a secure Django secret key
    DJANGO_SECRET=$(python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    
    # Store secrets in Key Vault
    $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "django-secret-key" --value "$DJANGO_SECRET"
    $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "$DB_PASSWORD_SECRET" --value "your-secure-database-password"
    $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "email-host-password" --value "your-email-app-password"
    $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "twilio-auth-token" --value "your-twilio-auth-token"
    $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "stripe-secret-key" --value "your-stripe-secret-key"
    
    echo -e "${GREEN}✅ Secrets stored in Key Vault${NC}"
    echo -e "${YELLOW}⚠️  Remember to update the secret values with your actual credentials${NC}"
}

# Function to create PostgreSQL database
create_database() {
    echo -e "${YELLOW}🗄️  Setting up Azure Database for PostgreSQL...${NC}"
    
    if $AZ_CMD postgres server show --name "$POSTGRES_SERVER" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  PostgreSQL server $POSTGRES_SERVER already exists${NC}"
    else
        # Get database password from Key Vault
        DB_PASSWORD=$($AZ_CMD keyvault secret show --vault-name "$KEYVAULT_NAME" --name "$DB_PASSWORD_SECRET" --query value -o tsv)
        
        # Create PostgreSQL server
        $AZ_CMD postgres server create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$POSTGRES_SERVER" \
            --location "$LOCATION" \
            --admin-user "$DB_USER" \
            --admin-password "$DB_PASSWORD" \
            --sku-name GP_Gen5_2 \
            --version 13
        
        # Create database
        $AZ_CMD postgres db create \
            --resource-group "$RESOURCE_GROUP" \
            --server-name "$POSTGRES_SERVER" \
            --name "$DB_NAME"
        
        # Configure firewall to allow Azure services
        $AZ_CMD postgres server firewall-rule create \
            --resource-group "$RESOURCE_GROUP" \
            --server "$POSTGRES_SERVER" \
            --name AllowAzureServices \
            --start-ip-address 0.0.0.0 \
            --end-ip-address 0.0.0.0
        
        echo -e "${GREEN}✅ PostgreSQL database created${NC}"
    fi
}

# Function to create Redis cache
create_redis() {
    echo -e "${YELLOW}📦 Setting up Azure Cache for Redis...${NC}"
    
    if $AZ_CMD redis show --name "$REDIS_CACHE" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  Redis cache $REDIS_CACHE already exists${NC}"
    else
        $AZ_CMD redis create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$REDIS_CACHE" \
            --location "$LOCATION" \
            --sku Basic \
            --vm-size c0
        echo -e "${GREEN}✅ Redis cache created${NC}"
        
        # Get Redis connection string and store in Key Vault
        REDIS_KEY=$($AZ_CMD redis list-keys --name "$REDIS_CACHE" --resource-group "$RESOURCE_GROUP" --query primaryKey -o tsv)
        $AZ_CMD keyvault secret set --vault-name "$KEYVAULT_NAME" --name "redis-connection-string" --value "$REDIS_KEY"
        echo -e "${GREEN}✅ Redis connection string stored in Key Vault${NC}"
    fi
}

# Function to create Container Apps environment
create_container_apps_environment() {
    echo -e "${YELLOW}🌍 Setting up Container Apps environment...${NC}"
    
    # Install Container Apps extension
    $AZ_CMD extension add --name containerapp --upgrade
    
    # Register providers
    $AZ_CMD provider register --namespace Microsoft.App
    $AZ_CMD provider register --namespace Microsoft.OperationalInsights
    
    if $AZ_CMD containerapp env show --name "$CONTAINER_APP_ENV" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
        echo -e "${YELLOW}⚠️  Container Apps environment $CONTAINER_APP_ENV already exists${NC}"
    else
        $AZ_CMD containerapp env create \
            --name "$CONTAINER_APP_ENV" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION"
        echo -e "${GREEN}✅ Container Apps environment created${NC}"
    fi
}

# Function to build and push Docker image
build_and_push_image() {
    echo -e "${YELLOW}🏗️  Building and pushing Docker image...${NC}"
    
    # Get ACR login server
    ACR_LOGIN_SERVER=$($AZ_CMD acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)
    
    # Build and push image
    $AZ_CMD acr build \
        --registry "$ACR_NAME" \
        --image "poehr-scheduling:latest" \
        --file "Dockerfile.azure" \
        .
    
    echo -e "${GREEN}✅ Docker image built and pushed to ACR${NC}"
}

# Function to deploy container app
deploy_container_app() {
    echo -e "${YELLOW}🚀 Deploying container app...${NC}"
    
    # Get ACR credentials
    ACR_LOGIN_SERVER=$($AZ_CMD acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)
    ACR_USERNAME=$($AZ_CMD acr credential show --name "$ACR_NAME" --query username -o tsv)
    ACR_PASSWORD=$($AZ_CMD acr credential show --name "$ACR_NAME" --query passwords[0].value -o tsv)
    
    # Create or update container app
    $AZ_CMD containerapp create \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$CONTAINER_APP_ENV" \
        --image "$ACR_LOGIN_SERVER/poehr-scheduling:latest" \
        --registry-server "$ACR_LOGIN_SERVER" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --target-port 8080 \
        --ingress external \
        --min-replicas 1 \
        --max-replicas 10 \
        --cpu 1.0 \
        --memory 2Gi \
        --env-vars \
            DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_azure \
            DEBUG=False \
            PORT=8080 \
            AZURE_SUBSCRIPTION_ID="$SUBSCRIPTION_ID" \
            AZURE_RESOURCE_GROUP="$RESOURCE_GROUP" \
            AZURE_KEYVAULT_NAME="$KEYVAULT_NAME" \
            DB_NAME="$DB_NAME" \
            DB_USER="$DB_USER" \
            DB_HOST="$POSTGRES_SERVER.postgres.database.azure.com" \
            DB_PORT=5432 \
            REDIS_HOST="$REDIS_CACHE.redis.cache.windows.net" \
            REDIS_PORT=6380
    
    echo -e "${GREEN}✅ Container app deployed${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"
    
    # Create a job to run migrations
    $AZ_CMD containerapp job create \
        --name "poehr-migrate" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$CONTAINER_APP_ENV" \
        --trigger-type Manual \
        --replica-timeout 3600 \
        --image "$ACR_LOGIN_SERVER/poehr-scheduling:latest" \
        --registry-server "$ACR_LOGIN_SERVER" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --command "python" "manage.py" "migrate" \
        --env-vars \
            DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_azure \
            AZURE_KEYVAULT_NAME="$KEYVAULT_NAME" \
            DB_NAME="$DB_NAME" \
            DB_USER="$DB_USER" \
            DB_HOST="$POSTGRES_SERVER.postgres.database.azure.com" \
            DB_PORT=5432
    
    # Execute the migration job
    $AZ_CMD containerapp job start --name "poehr-migrate" --resource-group "$RESOURCE_GROUP"
    
    echo -e "${GREEN}✅ Database migrations completed${NC}"
}

# Function to display service URLs
show_urls() {
    echo -e "${GREEN}🌐 Deployment completed! Your service is available at:${NC}"
    
    FQDN=$($AZ_CMD containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)
    
    echo -e "${GREEN}📱 Application URL: https://$FQDN${NC}"
    echo -e "${GREEN}🔌 WebSocket URL: wss://$FQDN/ws/presence/${NC}"
    echo -e "${GREEN}🏥 Health Check: https://$FQDN/health/${NC}"
    
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. Update your DNS to point to the application URL"
    echo "2. Configure SSL certificate if using custom domain"
    echo "3. Update your frontend environment variables"
    echo "4. Test the WebSocket connection"
    echo "5. Monitor logs and performance"
}

# Main deployment flow
main() {
    echo -e "${BLUE}🔥 POEHR Scheduling - Azure Deployment${NC}"
    echo "=================================="
    
    check_azure_cli
    azure_login
    create_resource_group
    create_container_registry
    create_key_vault
    create_database
    create_redis
    create_container_apps_environment
    build_and_push_image
    deploy_container_app
    run_migrations
    show_urls
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

# Run main function
main "$@"
