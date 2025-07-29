#!/bin/bash

# Comprehensive script to fix hardcoded localhost URLs in React frontend

echo "Starting systematic fix of hardcoded localhost URLs..."

# Fix the critical calendarApi.js file first - it uses BASE_URL constant
echo "Fixing calendarApi.js..."
cat > frontend/src/utils/calendar/calendarApi.js << 'EOF'
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

// Use centralized API configuration
const BASE_URL = `${API_BASE_URL}/api`;

// Create axios instance with default config
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
export { BASE_URL };
EOF

echo "calendarApi.js fixed!"

# List all files with hardcoded URLs
echo "Finding all files with hardcoded URLs..."
find frontend/src -name "*.js" -type f -exec grep -l "127\.0\.0\.1:8000" {} \; > files_to_fix.txt

echo "Files requiring fixes:"
cat files_to_fix.txt

echo "Manual fixes are recommended for safety."
echo "Use VS Code's find and replace with regex:"
echo "Find: http://127\\.0\\.0\\.1:8000"
echo "Replace: \${API_BASE_URL}"
echo ""
echo "Don't forget to add the import: import { API_BASE_URL } from '../config/api';"
