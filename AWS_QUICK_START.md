# 🏥 POEHR Healthcare - AWS Infrastructure Setup

## Quick Start Commands

### 1. Set up AWS CLI and credentials
```bash
aws configure
```

### 2. Make scripts executable
```bash
chmod +x deploy-aws.sh
chmod +x setup-aws-secrets.sh
```

### 3. Set up secrets in AWS Secrets Manager
```bash
./setup-aws-secrets.sh
```

### 4. Create AWS infrastructure manually (one-time setup)

#### Create VPC and networking
```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query 'Vpc.VpcId' --output text)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=poehr-healthcare-vpc

# Create subnets
SUBNET_1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone us-east-1a --query 'Subnet.SubnetId' --output text)
SUBNET_2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone us-east-1b --query 'Subnet.SubnetId' --output text)

# Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID
```

#### Create RDS PostgreSQL Database
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
  --backup-retention-period 7 \
  --storage-encrypted \
  --deletion-protection
```

#### Create ElastiCache Redis
```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id poehr-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### 5. Deploy the application
```bash
./deploy-aws.sh
```

## Important Notes

1. **Replace placeholders** in configuration files:
   - Update `YOUR_ACCOUNT_ID` with your AWS Account ID
   - Update domain names in nginx configuration
   - Update subnet and security group IDs

2. **Update secrets** with actual values:
   - Database endpoints after RDS creation
   - Redis endpoints after ElastiCache creation

3. **HIPAA Compliance**:
   - Enable AWS CloudTrail
   - Set up AWS Config
   - Enable VPC Flow Logs
   - Configure AWS GuardDuty

## Cost Optimization

- Start with smaller instances (t3.micro) for testing
- Use Spot instances for non-production environments
- Set up auto-scaling policies
- Monitor usage with AWS Cost Explorer

## Next Steps

1. Set up Application Load Balancer
2. Configure SSL certificate with AWS Certificate Manager
3. Set up CloudFront CDN
4. Configure monitoring and alerting
5. Set up backup and disaster recovery

## Troubleshooting

- Check CloudWatch logs: `/ecs/poehr-healthcare`
- Monitor ECS service events
- Verify security group rules
- Check task definition health checks
