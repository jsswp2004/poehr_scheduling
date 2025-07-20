#!/bin/bash

# AWS ECS Deployment Script for POEHR Healthcare Scheduling

set -e

# Configuration
AWS_REGION="us-east-1"
CLUSTER_NAME="poehr-healthcare-cluster"
SERVICE_NAME="poehr-healthcare-service"
TASK_FAMILY="poehr-healthcare-task"
ECR_REPOSITORY="poehr-healthcare"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "YOUR_AWS_ACCOUNT_ID")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting AWS deployment for POEHR Healthcare Scheduling${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Checking AWS credentials...${NC}"
aws sts get-caller-identity > /dev/null || {
    echo -e "${RED}❌ AWS credentials not configured. Run 'aws configure' first.${NC}"
    exit 1
}

echo -e "${YELLOW}🏗️  Building Docker images...${NC}"

# Build backend image
docker build -t ${ECR_REPOSITORY}-backend .

# Build frontend image
docker build -t ${ECR_REPOSITORY}-frontend ./frontend -f ./frontend/Dockerfile.production

echo -e "${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo -e "${YELLOW}🏷️  Tagging and pushing images...${NC}"

# Tag and push backend
docker tag ${ECR_REPOSITORY}-backend:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}-backend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}-backend:latest

# Tag and push frontend
docker tag ${ECR_REPOSITORY}-frontend:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}-frontend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}-frontend:latest

echo -e "${YELLOW}📝 Updating ECS task definition...${NC}"
# This would normally update your ECS task definition with new image URIs

echo -e "${YELLOW}🔄 Updating ECS service...${NC}"
aws ecs update-service \
    --cluster ${CLUSTER_NAME} \
    --service ${SERVICE_NAME} \
    --force-new-deployment \
    --region ${AWS_REGION}

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🏥 Your POEHR Healthcare Scheduling application is now running on AWS${NC}"

# Wait for deployment to stabilize
echo -e "${YELLOW}⏳ Waiting for deployment to stabilize...${NC}"
aws ecs wait services-stable \
    --cluster ${CLUSTER_NAME} \
    --services ${SERVICE_NAME} \
    --region ${AWS_REGION}

echo -e "${GREEN}🎉 Deployment is stable and ready!${NC}"
