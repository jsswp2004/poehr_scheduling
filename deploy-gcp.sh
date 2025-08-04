#!/bin/bash

# Google Cloud Deployment Script for POEHR Scheduling
# This script automates the deployment process to Google Cloud Platform

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="poehr-364520"
REGION="us-central1"
DB_INSTANCE="poehr-db-instance"
REDIS_INSTANCE="poehr-redis"
SERVICE_NAME="poehr-scheduling"

echo -e "${GREEN}🚀 Starting Google Cloud Platform deployment for POEHR Scheduling${NC}"

# Function to check if gcloud is installed
check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ Google Cloud CLI is not installed. Please install it first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Google Cloud CLI is installed${NC}"
}

# Function to set project
set_project() {
    echo -e "${YELLOW}📋 Setting up Google Cloud project...${NC}"
    gcloud config set project $PROJECT_ID
    echo -e "${GREEN}✅ Project set to $PROJECT_ID${NC}"
}

# Function to enable APIs
enable_apis() {
    echo -e "${YELLOW}🔧 Enabling required Google Cloud APIs...${NC}"
    gcloud services enable \
        cloudbuild.googleapis.com \
        run.googleapis.com \
        sql-component.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        secretmanager.googleapis.com \
        monitoring.googleapis.com \
        logging.googleapis.com
    echo -e "${GREEN}✅ APIs enabled${NC}"
}

# Function to create Cloud SQL instance
create_database() {
    echo -e "${YELLOW}🗄️ Setting up Cloud SQL PostgreSQL instance...${NC}"

    # Check if instance already exists
    if gcloud sql instances describe $DB_INSTANCE &> /dev/null; then
        echo -e "${YELLOW}⚠️ Database instance $DB_INSTANCE already exists${NC}"
    else
        # Generate passwords
        DB_ROOT_PASSWORD="$(openssl rand -base64 32)"
        DATABASE_PASSWORD="$(openssl rand -base64 32)"

        # Create Cloud SQL instance with root password
        gcloud sql instances create $DB_INSTANCE \
            --database-version=POSTGRES_15 \
            --tier=db-f1-micro \
            --region=$REGION \
            --root-password="$DB_ROOT_PASSWORD" \
            --storage-auto-increase \
            --backup-start-time=02:00

        gcloud sql databases create poehr_db --instance=$DB_INSTANCE
        gcloud sql users create jsswp2004 \
            --instance=$DB_INSTANCE \
            --password="$DATABASE_PASSWORD"

        # Store passwords in Secret Manager if not already present
        for SECRET_NAME in DB_ROOT_PASSWORD DATABASE_PASSWORD; do
            if gcloud secrets describe $SECRET_NAME --project $PROJECT_ID &> /dev/null; then
                echo -e "${YELLOW}⚠️ Secret $SECRET_NAME already exists in Secret Manager. Not overwriting.${NC}"
            else
                gcloud secrets create $SECRET_NAME --replication-policy=automatic --project $PROJECT_ID
                if [ "$SECRET_NAME" = "DB_ROOT_PASSWORD" ]; then
                    echo -n "$DB_ROOT_PASSWORD" | gcloud secrets versions add $SECRET_NAME --data-file=- --project $PROJECT_ID
                else
                    echo -n "$DATABASE_PASSWORD" | gcloud secrets versions add $SECRET_NAME --data-file=- --project $PROJECT_ID
                fi
                echo -e "${GREEN}✅ Secret $SECRET_NAME created in Secret Manager${NC}"
            fi
        done

        echo -e "${GREEN}✅ Cloud SQL instance created${NC}"
    fi
}

# Function to create Redis instance
create_redis() {
    echo -e "${YELLOW}📦 Setting up Redis (Memorystore) instance...${NC}"
    
    # Check if instance already exists
    if gcloud redis instances describe $REDIS_INSTANCE --region=$REGION &> /dev/null; then
        echo -e "${YELLOW}⚠️ Redis instance $REDIS_INSTANCE already exists${NC}"
    else
        gcloud redis instances create $REDIS_INSTANCE \
            --size=1 \
            --region=$REGION \
            --redis-version=redis_7_0
        echo -e "${GREEN}✅ Redis instance created${NC}"
    fi
}

# Function to build and deploy
build_and_deploy() {
    echo -e "${YELLOW}🏗️ Building and deploying application...${NC}"
    
    # Submit build to Cloud Build
    gcloud builds submit --config cloudbuild.yaml
    
    echo -e "${GREEN}✅ Application deployed to Cloud Run${NC}"
}

# Function to deploy WebSocket service - REMOVED
# WebSocket functionality is now handled by the main service via Uvicorn
deploy_websocket() {
    echo -e "${YELLOW}🔌 WebSocket support is integrated in main service (Uvicorn)${NC}"
    echo -e "${GREEN}✅ No separate WebSocket service needed${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"
    
    # Create and run migration job
    gcloud run jobs create poehr-migrate \
        --image gcr.io/$PROJECT_ID/poehr-scheduling \
        --region $REGION \
        --add-cloudsql-instances $PROJECT_ID:$REGION:$DB_INSTANCE \
        --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
        --set-env-vars DJANGO_ALLOWED_HOSTS=powerhealthcareit.com \
        --task-timeout 3600 \
        --command python,manage.py,migrate
    
    gcloud run jobs execute poehr-migrate --region $REGION
    
    echo -e "${GREEN}✅ Database migrations completed${NC}"
}

# Function to display service URLs
show_urls() {
    echo -e "${GREEN}🌐 Deployment completed! Your service is available at:${NC}"
    
    MAIN_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
    
    echo -e "${GREEN}📱 Main Application: $MAIN_URL${NC}"
    echo -e "${GREEN}🔌 WebSocket Endpoint: $MAIN_URL/ws/presence/${NC}"
}

# Main execution
main() {
    check_gcloud
    set_project
    enable_apis
    create_database
    create_redis
    build_and_deploy
    deploy_websocket
    run_migrations
    show_urls
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo -e "${YELLOW}💡 Don't forget to:${NC}"
    echo -e "${YELLOW}   1. Configure your domain DNS${NC}"
    echo -e "${YELLOW}   2. Set up monitoring alerts${NC}"
    echo -e "${YELLOW}   3. Test all application features${NC}"
}

# Run main function
main "$@"
