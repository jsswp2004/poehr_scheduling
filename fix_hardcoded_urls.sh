#!/bin/bash

# Script to replace all hardcoded localhost URLs with API_BASE_URL imports
# This will fix the 2000+ token refresh errors

echo "Fixing hardcoded URLs in React frontend..."

# List of files that need to be updated
files=(
    "frontend/src/hooks/usePatientDetail.js"
    "frontend/src/hooks/usePatientDetailData.js"
    "frontend/src/hooks/usePatients.js"
    "frontend/src/hooks/usePatientsAppointments.js"
    "frontend/src/hooks/useTeam.js"
    "frontend/src/hooks/useAnalytics.js"
    "frontend/src/hooks/useOnlineStatus.js"
)

# For each file, add the API import and replace URLs
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Processing $file..."
        
        # Check if file already has API import
        if ! grep -q "import.*API_BASE_URL.*from.*config/api" "$file"; then
            # Add import after existing imports
            sed -i '1a import { API_BASE_URL } from '\''../config/api'\'';' "$file"
        fi
        
        # Replace hardcoded URLs with API_BASE_URL
        sed -i 's|http://127\.0\.0\.1:8000|${API_BASE_URL}|g' "$file"
        sed -i "s|'http://127\.0\.0\.1:8000|'\${API_BASE_URL}|g" "$file"
        sed -i 's|"http://127\.0\.0\.1:8000|"${API_BASE_URL}|g' "$file"
        
        echo "Fixed $file"
    else
        echo "File $file not found, skipping..."
    fi
done

echo "URL replacement complete!"
echo "Now rebuilding and deploying..."
