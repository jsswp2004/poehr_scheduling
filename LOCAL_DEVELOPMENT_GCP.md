# Local Development with Google Cloud Services

This guide helps you set up local development while connecting to Google Cloud services.

## Prerequisites

1. Google Cloud CLI installed
2. Docker installed
3. Python 3.11+ installed

## Setup Steps

### 1. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project poehr-scheduling-prod
```

### 2. Start Cloud SQL Proxy (for database connection)

```bash
# Download Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
chmod +x cloud_sql_proxy

# Start proxy (replace with your actual connection name)
./cloud_sql_proxy -instances=poehr-scheduling-prod:us-central1:poehr-db-instance=tcp:5432
```

### 3. Port Forward to Redis (in another terminal)

```bash
# Get Redis IP
gcloud redis instances describe poehr-redis --region=us-central1 --format="get(host)"

# Create a GCE instance for port forwarding (if needed)
gcloud compute instances create redis-proxy \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=debian-11 \
    --image-project=debian-cloud

# SSH with port forwarding
gcloud compute ssh redis-proxy --zone=us-central1-a -- -L 6379:REDIS_IP:6379
```

### 4. Set up local environment

```bash
# Copy the GCP environment template
cp .env.gcp .env

# Edit .env with your actual values
# Make sure to use localhost for DATABASE_HOST and REDIS_HOST
```

### 5. Run migrations locally

```bash
python manage.py migrate --settings=poehr_scheduling_backend.settings_production
```

### 6. Start development server

```bash
python manage.py runserver --settings=poehr_scheduling_backend.settings_production
```

## Alternative: Use Docker Compose for Local Development

### 1. Create docker-compose.local.yml

```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: poehr_db_local
      POSTGRES_USER: jsswp2004
      POSTGRES_PASSWORD: localpassword
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres_local:/var/lib/postgresql/data

  redis:
    image: redis:7.2.4
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis_local:/data

  web:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis
    environment:
      - DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings
      - DATABASE_URL=postgresql://jsswp2004:localpassword@db:5432/poehr_db_local
      - REDIS_HOST=redis
    volumes:
      - .:/code
    command: python manage.py runserver 0.0.0.0:8000
```

### 2. Run locally with Docker

```bash
docker-compose -f docker-compose.local.yml up
```

## Testing Production Settings Locally

### 1. Create local production environment

```bash
# Set environment variables
export DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_production
export GOOGLE_CLOUD_PROJECT=poehr-scheduling-prod

# Use environment variables instead of Secret Manager for local testing
export DJANGO_SECRET_KEY="your-local-secret-key"
export DATABASE_PASSWORD="your-local-password"
export REDIS_HOST="localhost"
```

### 2. Test with local database

```bash
# Create local PostgreSQL database
createdb poehr_db_local
python manage.py migrate
python manage.py runserver
```

This setup allows you to develop locally while testing the production configuration and optionally connecting to cloud services.
