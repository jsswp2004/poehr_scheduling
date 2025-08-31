#!/bin/bash

# Configure health probes using Azure REST API
# Replace with your actual subscription ID and resource group

SUBSCRIPTION_ID="8b18b754-caeb-447c-9a8d-dd640611b91a"
RESOURCE_GROUP="poehr-scheduling-rg"
APP_NAME="poehr-scheduling"

# Get access token
ACCESS_TOKEN=$(az account get-access-token --query accessToken -o tsv)

# Create health probe configuration
curl -X PATCH \
  "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${APP_NAME}?api-version=2023-05-01" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "template": {
        "containers": [
          {
            "name": "poehr-scheduling",
            "image": "poehrschedulingacr.azurecr.io/poehr-scheduling:78c8ecda67813b8df56585dd45106517e46905f3",
            "resources": {
              "cpu": 1.0,
              "memory": "2Gi"
            },
            "probes": [
              {
                "type": "Liveness",
                "httpGet": {
                  "path": "/health/",
                  "port": 8080
                },
                "initialDelaySeconds": 30,
                "periodSeconds": 10,
                "timeoutSeconds": 5,
                "failureThreshold": 3
              },
              {
                "type": "Readiness",
                "httpGet": {
                  "path": "/ready/",
                  "port": 8080
                },
                "initialDelaySeconds": 5,
                "periodSeconds": 5,
                "timeoutSeconds": 3,
                "failureThreshold": 3
              }
            ]
          }
        ]
      }
    }
  }'
