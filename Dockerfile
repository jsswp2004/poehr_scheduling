# Build stage for React frontend
FROM node:18-alpine as frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

# Production stage
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
# Don't set DJANGO_SETTINGS_MODULE here - let it be configured at runtime
# ENV DJANGO_SETTINGS_MODULE will be set by the deployment environment

# Set a temporary SECRET_KEY for build-time operations only
ENV DJANGO_SECRET_KEY='temporary-build-time-key-do-not-use-in-production'

WORKDIR /code

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        build-essential \
        libpq-dev \
        curl \
        wget \
    && curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 \
    && chmod +x cloud_sql_proxy \
    && mv cloud_sql_proxy /usr/local/bin/ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt /code/
RUN pip install --no-cache-dir -r requirements.txt gunicorn google-cloud-secret-manager

# Copy application code
COPY . /code/
COPY --from=frontend-build /frontend/build /code/static/frontend/

# Create directory for static files
RUN mkdir -p /code/staticfiles

# Try to collect static files with fallback settings, but don't fail the build if it doesn't work
RUN DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings python manage.py collectstatic --noinput || \
    echo "Warning: Static files collection failed during build. Will retry at runtime."

# Remove the build-time SECRET_KEY
ENV DJANGO_SECRET_KEY=

EXPOSE 8080

# Use a startup script to handle runtime initialization
COPY startup.sh /code/
RUN chmod +x /code/startup.sh

CMD ["/code/startup.sh"]