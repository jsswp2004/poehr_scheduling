# Complete Google Cloud Platform Deployment Guide

## Overview

This guide will walk you through deploying your Django POEHR Scheduling application to Google Cloud Platform (GCP) using Google Cloud Run, Cloud SQL, and other GCP services.

## Prerequisites

1. Google Cloud Platform account
2. Google Cloud CLI installed
3. Docker installed locally
4. Your application ready for deployment

## Step 1: Initial Google Cloud Setup

### 1.1 Install Google Cloud CLI

```bash
# For Windows (using PowerShell as Administrator)
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

### 1.2 Initialize gcloud and authenticate

```bash
gcloud init
gcloud auth login
gcloud auth application-default login
```

### 1.3 Set your GCP project

```bash
# You already have a project! Let's use your existing POWER project
gcloud config set project poehr-364520

# Or if you want to create a new project specifically for this:
# gcloud projects create poehr-scheduling-prod --name="POEHR Scheduling"
# gcloud config set project poehr-scheduling-prod
```

### 1.4 Enable required APIs

```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sql-component.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    secretmanager.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com
```

## Step 2: Database Setup (Cloud SQL)

### 2.1 Create Cloud SQL PostgreSQL instance

```bash
gcloud sql instances create poehr-db-instance \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=krat25Miko! \
    --storage-auto-increase \
    --backup-start-time=02:00
```

### 2.2 Create the database

```bash
gcloud sql databases create poehr_db --instance=poehr-db-instance
```

### 2.3 Create database user

```bash
gcloud sql users create jsswp2004 \
    --instance=poehr-db-instance \
    --password=krat25Miko!
```

## Step 3: Redis Setup (Memorystore)

### 3.1 Create Redis instance

```bash
gcloud redis instances create poehr-redis \
    --size=1 \
    --region=us-central1 \
    --redis-version=redis_7_0
```

## Step 4: Secret Management

### 4.1 Store sensitive environment variables in Secret Manager

```bash
# Database URL
gcloud secrets create DATABASE_URL --data-file=-
# Enter: postgresql://jsswp2004:password@/poehr_db?host=/cloudsql/PROJECT_ID:us-central1:poehr-db-instance

# Django Secret Key
echo "your-django-secret-key" | gcloud secrets create DJANGO_SECRET_KEY --data-file=-

# Email credentials
echo "your-email@gmail.com" | gcloud secrets create EMAIL_HOST_USER --data-file=-
echo "your-app-password" | gcloud secrets create EMAIL_HOST_PASSWORD --data-file=-

# Twilio credentials
echo "your-twilio-sid" | gcloud secrets create TWILIO_ACCOUNT_SID --data-file=-
echo "your-twilio-token" | gcloud secrets create TWILIO_AUTH_TOKEN --data-file=-
echo "+1234567890" | gcloud secrets create TWILIO_PHONE_NUMBER --data-file=-

# Stripe credentials
echo "sk_live_your_stripe_secret" | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
echo "pk_live_your_stripe_publishable" | gcloud secrets create STRIPE_PUBLISHABLE_KEY --data-file=-
echo "whsec_your_webhook_secret" | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-
```

## Step 5: Application Configuration

### 5.1 Update Django settings for production

Create `poehr_scheduling_backend/settings_production.py`:

```python
from .settings import *
import os
from google.cloud import secretmanager

# Production settings
DEBUG = False
ALLOWED_HOSTS = ['*']  # Configure with your actual domain

# Secret Manager client
client = secretmanager.SecretManagerServiceClient()
project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')

def get_secret(secret_name):
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'poehr_db',
        'USER': 'jsswp2004',
        'PASSWORD': get_secret('DATABASE_PASSWORD'),
        'HOST': f'/cloudsql/{project_id}:us-central1:poehr-db-instance',
        'PORT': '5432',
    }
}

# Redis
REDIS_HOST = get_secret('REDIS_HOST')

# Security
SECRET_KEY = get_secret('DJANGO_SECRET_KEY')
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media files (consider using Cloud Storage)
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
```

### 5.2 Create production Dockerfile

Create `Dockerfile.production`:

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_production

WORKDIR /code

# Install system dependencies including Cloud SQL Proxy
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        build-essential \
        libpq-dev \
        curl \
    && curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 \
    && chmod +x cloud_sql_proxy \
    && mv cloud_sql_proxy /usr/local/bin/ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /code/
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy project
COPY . /code/

# Collect static files
RUN python manage.py collectstatic --noinput --settings=poehr_scheduling_backend.settings_production

EXPOSE 8080

# Use gunicorn for production
CMD exec gunicorn --bind :8080 --workers 1 --threads 8 --timeout 0 poehr_scheduling_backend.wsgi:application
```

## Step 6: Cloud Build Configuration

### 6.1 Create cloudbuild.yaml

```yaml
steps:
  # Build the container image
  - name: "gcr.io/cloud-builders/docker"
    args:
      [
        "build",
        "-f",
        "Dockerfile.production",
        "-t",
        "gcr.io/$PROJECT_ID/poehr-scheduling:$COMMIT_SHA",
        ".",
      ]

  # Push the image to Container Registry
  - name: "gcr.io/cloud-builders/docker"
    args: ["push", "gcr.io/$PROJECT_ID/poehr-scheduling:$COMMIT_SHA"]

  # Deploy to Cloud Run
  - name: "gcr.io/google.com/cloudsdktool/cloud-sdk"
    entrypoint: gcloud
    args:
      - "run"
      - "deploy"
      - "poehr-scheduling"
      - "--image"
      - "gcr.io/$PROJECT_ID/poehr-scheduling:$COMMIT_SHA"
      - "--region"
      - "us-central1"
      - "--platform"
      - "managed"
      - "--allow-unauthenticated"
      - "--add-cloudsql-instances"
      - "$PROJECT_ID:us-central1:poehr-db-instance"
      - "--set-env-vars"
      - "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"

images:
  - "gcr.io/$PROJECT_ID/poehr-scheduling:$COMMIT_SHA"
```

## Step 7: Deploy to Cloud Run

### 7.1 Build and deploy manually (first time)

```bash
# Build the image
docker build -f Dockerfile.production -t gcr.io/poehr-scheduling-prod/poehr-scheduling .

# Push to Container Registry
docker push gcr.io/poehr-scheduling-prod/poehr-scheduling

# Deploy to Cloud Run
gcloud run deploy poehr-scheduling \
    --image gcr.io/poehr-scheduling-prod/poehr-scheduling \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances poehr-scheduling-prod:us-central1:poehr-db-instance \
    --set-env-vars GOOGLE_CLOUD_PROJECT=poehr-scheduling-prod \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 10
```

### 7.2 Run database migrations

```bash
# Get the Cloud Run service URL
SERVICE_URL=$(gcloud run services describe poehr-scheduling --region=us-central1 --format="value(status.url)")

# Run migrations using Cloud Run Jobs
gcloud run jobs create poehr-migrate \
    --image gcr.io/poehr-scheduling-prod/poehr-scheduling \
    --region us-central1 \
    --add-cloudsql-instances poehr-scheduling-prod:us-central1:poehr-db-instance \
    --set-env-vars GOOGLE_CLOUD_PROJECT=poehr-scheduling-prod \
    --task-timeout 3600 \
    --command python,manage.py,migrate

gcloud run jobs execute poehr-migrate --region us-central1
```

## Step 8: WebSocket Configuration

### 8.1 Deploy WebSocket service separately

```bash
# Create Dockerfile.websocket
# Deploy as separate Cloud Run service for WebSocket connections
gcloud run deploy poehr-websocket \
    --image gcr.io/poehr-scheduling-prod/poehr-scheduling \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances poehr-scheduling-prod:us-central1:poehr-db-instance \
    --set-env-vars GOOGLE_CLOUD_PROJECT=poehr-scheduling-prod \
    --command python,start_websocket_server.py \
    --port 9001
```

## Step 9: Domain and SSL Configuration

### 9.1 Configure custom domain

```bash
# Map your domain to Cloud Run
gcloud run domain-mappings create \
    --service poehr-scheduling \
    --domain your-domain.com \
    --region us-central1
```

### 9.2 Configure SSL certificate (automatic with Cloud Run)

SSL certificates are automatically provisioned by Google Cloud Run.

## Step 10: Monitoring and Logging

### 10.1 Set up monitoring

```bash
# Cloud Run automatically provides monitoring
# Access through Google Cloud Console > Monitoring
```

### 10.2 Configure log aggregation

Logs are automatically collected in Cloud Logging and accessible through:

- Google Cloud Console > Logging
- gcloud logging read commands

## Step 11: Backup Strategy

### 11.1 Automated database backups

```bash
# Backups are automatically configured with Cloud SQL
# You can also create manual backups:
gcloud sql backups create --instance=poehr-db-instance
```

## Step 12: Environment Management

### 12.1 Create staging environment

Repeat steps 2-7 with different instance names and project for staging:

- Project: poehr-scheduling-staging
- Instance: poehr-db-staging

## Step 13: CI/CD Setup

### 13.1 Connect to GitHub

```bash
# Connect your repository to Cloud Build
gcloud builds triggers create github \
    --repo-name=poehr_scheduling \
    --repo-owner=jsswp2004 \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

## Estimated Costs (USD/month)

- Cloud Run: $0-50 (depending on traffic)
- Cloud SQL (f1-micro): ~$7
- Redis (1GB): ~$25
- Cloud Build: $0-10
- **Total estimated: $32-92/month**

## Security Checklist

- [ ] All secrets stored in Secret Manager
- [ ] Database not publicly accessible
- [ ] HTTPS enabled
- [ ] IAM roles properly configured
- [ ] Cloud SQL requires SSL
- [ ] Regular security updates

## Next Steps

1. Configure your domain DNS to point to Cloud Run
2. Set up monitoring alerts
3. Configure automated backups
4. Test the full application workflow
5. Set up staging environment for testing

This guide provides a production-ready deployment on Google Cloud Platform with best practices for security, scalability, and maintainability.
