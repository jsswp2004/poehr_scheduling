# 🏥 POEHR Healthcare Scheduling - AWS Deployment Guide

## 🎯 Overview

This guide will help you deploy your healthcare scheduling application to AWS with HIPAA compliance, high availability, and enterprise security.

## 📋 Prerequisites

- AWS Account with admin access
- AWS CLI installed and configured
- Docker installed locally
- Domain name (recommended for SSL)

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│  CloudFront CDN → Application Load Balancer → ECS Fargate  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Frontend  │  │   Backend   │  │  WebSocket  │         │
│  │   (React)   │  │  (Django)   │  │   Server    │         │
│  │             │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     RDS     │  │ ElastiCache │  │     S3      │         │
│  │(PostgreSQL) │  │   (Redis)   │  │ File Storage│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Phase 1: Initial AWS Setup

### Step 1: Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID, Secret Key, Region (us-east-1), and output format (json)
```

### Step 2: Create IAM Roles and Policies

```bash
# Create execution role for ECS
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://aws-trust-policy.json

# Create task role for application
aws iam create-role --role-name ecsTaskRole \
  --assume-role-policy-document file://aws-trust-policy.json
```

### Step 3: Set Up VPC and Security

```bash
# Create VPC for healthcare application
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications \
  'ResourceType=vpc,Tags=[{Key=Name,Value=poehr-healthcare-vpc}]'
```

## 🗄️ Phase 2: Database Setup (AWS RDS)

### Step 1: Create RDS PostgreSQL Instance

```bash
aws rds create-db-instance \
  --db-instance-identifier poehr-healthcare-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username poehr_admin \
  --master-user-password 'YourSecurePassword123!' \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --backup-retention-period 7 \
  --storage-encrypted \
  --deletion-protection
```

### Step 2: Create ElastiCache Redis Cluster

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id poehr-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxxxxxxxx
```

## 📦 Phase 3: Container Registry Setup

### Step 1: Create ECR Repositories

```bash
# Backend repository
aws ecr create-repository --repository-name poehr-healthcare-backend

# Frontend repository
aws ecr create-repository --repository-name poehr-healthcare-frontend

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

### Step 2: Build and Push Images

```bash
# Build backend image
docker build -t poehr-healthcare-backend .

# Tag and push backend
docker tag poehr-healthcare-backend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/poehr-healthcare-backend:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/poehr-healthcare-backend:latest

# Build frontend image
docker build -f frontend/Dockerfile.production -t poehr-healthcare-frontend ./frontend

# Tag and push frontend
docker tag poehr-healthcare-frontend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/poehr-healthcare-frontend:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/poehr-healthcare-frontend:latest
```

## 🚢 Phase 4: ECS Deployment

### Step 1: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name poehr-healthcare-cluster --capacity-providers FARGATE
```

### Step 2: Register Task Definition

```bash
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json
```

### Step 3: Create ECS Service

```bash
aws ecs create-service \
  --cluster poehr-healthcare-cluster \
  --service-name poehr-healthcare-service \
  --task-definition poehr-healthcare-task:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-zzzzz],assignPublicIp=ENABLED}"
```

## 🔐 Phase 5: Security & Secrets

### Step 1: Store Secrets in AWS Secrets Manager

```bash
# Django secret key
aws secretsmanager create-secret --name "poehr/django-secret-key" \
  --description "Django SECRET_KEY for POEHR Healthcare" \
  --secret-string "your-super-secret-django-key"

# Database password
aws secretsmanager create-secret --name "poehr/db-password" \
  --description "RDS PostgreSQL password" \
  --secret-string "YourSecurePassword123!"

# Database host
aws secretsmanager create-secret --name "poehr/db-host" \
  --description "RDS PostgreSQL endpoint" \
  --secret-string "your-rds-endpoint.amazonaws.com"
```

### Step 2: Configure SSL Certificate (AWS Certificate Manager)

```bash
aws acm request-certificate \
  --domain-name your-domain.com \
  --subject-alternative-names *.your-domain.com \
  --validation-method DNS
```

## 🌐 Phase 6: Load Balancer & CDN

### Step 1: Create Application Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name poehr-healthcare-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-zzzzz
```

### Step 2: Configure CloudFront Distribution

```bash
aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

## 🔍 Phase 7: Monitoring & Logging

### Step 1: Create CloudWatch Log Groups

```bash
aws logs create-log-group --log-group-name /ecs/poehr-healthcare
```

### Step 2: Set Up Health Checks and Alarms

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "poehr-high-cpu" \
  --alarm-description "High CPU utilization" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

## 🏥 Phase 8: HIPAA Compliance Setup

### Security Checklist:

- ✅ **Encryption at Rest**: RDS encrypted, S3 encrypted
- ✅ **Encryption in Transit**: ALB with SSL/TLS
- ✅ **Access Logging**: CloudTrail enabled
- ✅ **Network Security**: VPC with private subnets
- ✅ **Identity Management**: IAM roles with least privilege
- ✅ **Audit Trail**: CloudWatch Logs + CloudTrail
- ✅ **Backup & Recovery**: RDS automated backups

### Required AWS Services for HIPAA:

- **AWS CloudTrail**: Audit logging
- **AWS Config**: Compliance monitoring
- **AWS GuardDuty**: Threat detection
- **AWS Shield**: DDoS protection
- **AWS WAF**: Web application firewall

## 🎛️ Environment Variables Setup

Update your `.env.production` file with actual AWS values:

```bash
# Get RDS endpoint
aws rds describe-db-instances --db-instance-identifier poehr-healthcare-db

# Get ElastiCache endpoint
aws elasticache describe-cache-clusters --cache-cluster-id poehr-redis
```

## 🧪 Phase 9: Testing & Validation

### Health Check Endpoints:

- Backend: `https://api.your-domain.com/api/health/`
- Frontend: `https://your-domain.com/`

### Load Testing:

```bash
# Use AWS Load Testing solution
aws cloudformation create-stack --stack-name load-testing \
  --template-url https://s3.amazonaws.com/solutions-reference/load-testing/latest/load-testing.template
```

## 💰 Cost Estimation (Monthly)

| Service                   | Instance Type    | Estimated Cost  |
| ------------------------- | ---------------- | --------------- |
| ECS Fargate               | 2 vCPUs, 4GB RAM | $60             |
| RDS PostgreSQL            | db.t3.micro      | $15             |
| ElastiCache Redis         | cache.t3.micro   | $12             |
| Application Load Balancer | -                | $18             |
| CloudFront CDN            | 50GB transfer    | $5              |
| S3 Storage                | 100GB            | $3              |
| **Total**                 |                  | **~$113/month** |

## 🚨 Important Notes

1. **HIPAA Compliance**: Sign AWS Business Associate Agreement (BAA)
2. **Security**: Enable AWS Config, CloudTrail, and GuardDuty
3. **Monitoring**: Set up comprehensive CloudWatch dashboards
4. **Backup**: Configure automated RDS snapshots
5. **Scaling**: Configure Auto Scaling for ECS services

## 🔄 Deployment Commands

Use the included deployment script:

```bash
chmod +x deploy-aws.sh
./deploy-aws.sh
```

## 📞 Support

For AWS support with HIPAA compliance:

- AWS Enterprise Support Plan recommended
- AWS Professional Services for healthcare implementations

---

## Next Steps:

1. Review and customize configuration files
2. Set up AWS CLI and credentials
3. Run the deployment script
4. Configure domain and SSL
5. Set up monitoring and alerting

**Ready to deploy your healthcare application to AWS! 🚀**
