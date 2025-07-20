#!/bin/bash

# 🔐 AWS Secrets Setup Script for POEHR Healthcare
# This script creates all necessary secrets in AWS Secrets Manager

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

AWS_REGION="us-east-1"

echo -e "${BLUE}🔐 Setting up AWS Secrets Manager for POEHR Healthcare${NC}"

# Function to create secret if it doesn't exist
create_secret() {
    local secret_name=$1
    local secret_value=$2
    local description=$3
    
    if aws secretsmanager describe-secret --secret-id "$secret_name" --region $AWS_REGION >/dev/null 2>&1; then
        echo -e "${YELLOW}Secret $secret_name already exists, updating...${NC}"
        aws secretsmanager update-secret --secret-id "$secret_name" --secret-string "$secret_value" --region $AWS_REGION
    else
        echo -e "${BLUE}Creating secret: $secret_name${NC}"
        aws secretsmanager create-secret --name "$secret_name" --description "$description" --secret-string "$secret_value" --region $AWS_REGION
    fi
}

# Generate Django secret key
echo -e "${YELLOW}Generating Django secret key...${NC}"
DJANGO_SECRET=$(python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')

# Create secrets
echo -e "${BLUE}Creating secrets in AWS Secrets Manager...${NC}"

create_secret "poehr/django-secret-key" "$DJANGO_SECRET" "Django SECRET_KEY for POEHR Healthcare"

echo -e "${RED}⚠️  Please manually set the following secrets with your actual values:${NC}"
echo -e "${YELLOW}aws secretsmanager put-secret-value --secret-id 'poehr/db-password' --secret-string 'YourSecureDBPassword123!'${NC}"
echo -e "${YELLOW}aws secretsmanager put-secret-value --secret-id 'poehr/db-host' --secret-string 'your-rds-endpoint.amazonaws.com'${NC}"
echo -e "${YELLOW}aws secretsmanager put-secret-value --secret-id 'poehr/db-name' --secret-string 'poehr_db'${NC}"
echo -e "${YELLOW}aws secretsmanager put-secret-value --secret-id 'poehr/db-user' --secret-string 'poehr_admin'${NC}"
echo -e "${YELLOW}aws secretsmanager put-secret-value --secret-id 'poehr/redis-host' --secret-string 'your-elasticache-endpoint.amazonaws.com'${NC}"

# Create empty secrets that will be filled later
aws secretsmanager create-secret --name "poehr/db-password" --description "RDS PostgreSQL password" --secret-string "PLACEHOLDER" --region $AWS_REGION || echo "Secret already exists"
aws secretsmanager create-secret --name "poehr/db-host" --description "RDS PostgreSQL endpoint" --secret-string "PLACEHOLDER" --region $AWS_REGION || echo "Secret already exists"
aws secretsmanager create-secret --name "poehr/db-name" --description "Database name" --secret-string "poehr_db" --region $AWS_REGION || echo "Secret already exists"
aws secretsmanager create-secret --name "poehr/db-user" --description "Database username" --secret-string "poehr_admin" --region $AWS_REGION || echo "Secret already exists"
aws secretsmanager create-secret --name "poehr/redis-host" --description "ElastiCache Redis endpoint" --secret-string "PLACEHOLDER" --region $AWS_REGION || echo "Secret already exists"

echo -e "${GREEN}✅ Secrets setup completed!${NC}"
echo -e "${YELLOW}📋 Remember to update the PLACEHOLDER values with your actual AWS resource endpoints${NC}"
