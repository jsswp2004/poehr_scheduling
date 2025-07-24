#!/bin/bash

# Setup Application Load Balancer for ECS Service
# This provides a stable endpoint that doesn't change with deployments

echo "Creating Application Load Balancer for ECS Service..."

# Get the VPC and subnets from the existing ECS service
VPC_ID=$(aws ecs describe-services --cluster poehr-healthcare-cluster --services poehr-healthcare-service \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets[0]' --output text | \
    xargs aws ec2 describe-subnets --subnet-ids --query 'Subnets[0].VpcId' --output text)

SUBNET_IDS=$(aws ecs describe-services --cluster poehr-healthcare-cluster --services poehr-healthcare-service \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' --output text)

SECURITY_GROUP_ID=$(aws ecs describe-services --cluster poehr-healthcare-cluster --services poehr-healthcare-service \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups[0]' --output text)

echo "VPC ID: $VPC_ID"
echo "Subnet IDs: $SUBNET_IDS"
echo "Security Group: $SECURITY_GROUP_ID"

# Create Application Load Balancer
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name poehr-healthcare-alb \
    --subnets $SUBNET_IDS \
    --security-groups $SECURITY_GROUP_ID \
    --scheme internet-facing \
    --type application \
    --ip-address-type ipv4 \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

echo "Created ALB: $ALB_ARN"

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB DNS Name: $ALB_DNS"

# Create Target Group for backend (port 8000)
BACKEND_TG_ARN=$(aws elbv2 create-target-group \
    --name poehr-backend-tg \
    --protocol HTTP \
    --port 8000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /api/auth/health/ \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 5 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

echo "Backend Target Group: $BACKEND_TG_ARN"

# Create Target Group for frontend (port 3000)
FRONTEND_TG_ARN=$(aws elbv2 create-target-group \
    --name poehr-frontend-tg \
    --protocol HTTP \
    --port 3000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path / \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 5 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

echo "Frontend Target Group: $FRONTEND_TG_ARN"

# Create listener for frontend (port 80 -> 3000)
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG_ARN

# Create listener for backend API (port 8000 -> 8000)
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 8000 \
    --default-actions Type=forward,TargetGroupArn=$BACKEND_TG_ARN

echo ""
echo "=== SETUP COMPLETE ==="
echo "ALB DNS Name: $ALB_DNS"
echo "Frontend URL: http://$ALB_DNS"
echo "Backend API URL: http://$ALB_DNS:8000"
echo ""
echo "Next steps:"
echo "1. Update your ECS service to use the target groups"
echo "2. Update frontend config to use: http://$ALB_DNS:8000"
echo "3. Update Django ALLOWED_HOSTS to include: $ALB_DNS"
