# 🔗 Production API Integration for Expo App

## 📱 **Expo Configuration for Production**

### **1. Update API Base URL**

Create or update your API configuration file:

```typescript
// config/api.ts or constants/Api.ts
export const API_CONFIG = {
  // Production Backend
  BASE_URL: "https://www.powerhealthcareit.com/api/",

  // WebSocket for real-time features
  WS_URL: "wss://www.powerhealthcareit.com/ws/",

  // Health check endpoint
  HEALTH_URL: "https://www.powerhealthcareit.com/health/",

  // Request timeout
  TIMEOUT: 10000,

  // API version
  VERSION: "v1",
};

// Environment-based configuration
const isDev = __DEV__;
export const API_BASE_URL = isDev
  ? "http://localhost:8000/api/" // Local development
  : API_CONFIG.BASE_URL; // Production
```

### **2. Authentication Configuration**

```typescript
// services/auth.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_CONFIG } from "../config/api";

export const AuthService = {
  // Login to production backend
  async login(email: string, password: string) {
    const response = await fetch(`${API_CONFIG.BASE_URL}auth/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (data.access) {
      await AsyncStorage.setItem("access_token", data.access);
      await AsyncStorage.setItem("refresh_token", data.refresh);
    }

    return data;
  },

  // Get stored token
  async getToken() {
    return await AsyncStorage.getItem("access_token");
  },

  // Logout
  async logout() {
    await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
  },
};
```

### **3. API Service Setup**

```typescript
// services/api.ts
import { API_CONFIG } from "../config/api";
import { AuthService } from "./auth";

class ApiService {
  private async getHeaders() {
    const token = await AuthService.getToken();
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  // Appointments
  async getAppointments() {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_CONFIG.BASE_URL}appointments/`, {
      headers,
    });
    return response.json();
  }

  async createAppointment(appointmentData: any) {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_CONFIG.BASE_URL}appointments/`, {
      method: "POST",
      headers,
      body: JSON.stringify(appointmentData),
    });
    return response.json();
  }

  // Clinic Events
  async uploadClinicEvents(csvFile: any) {
    const token = await AuthService.getToken();
    const formData = new FormData();
    formData.append("csv_file", csvFile);

    const response = await fetch(
      `${API_CONFIG.BASE_URL}appointments/upload-clinic-events/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type for FormData
        },
        body: formData,
      }
    );
    return response.json();
  }

  // Health check
  async healthCheck() {
    const response = await fetch(API_CONFIG.HEALTH_URL);
    return response.json();
  }
}

export default new ApiService();
```

## 🚀 **Expo Production Deployment**

### **4. Build Configuration**

Update your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "name": "POEHR Scheduling",
    "slug": "poehr-scheduling",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.powerhealthcare.scheduling",
      "buildNumber": "1",
      "infoPlist": {
        "NSCameraUsageDescription": "This app uses camera for document scanning",
        "NSPhotoLibraryUsageDescription": "This app accesses photo library for profile pictures"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.powerhealthcare.scheduling"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "apiUrl": "https://www.powerhealthcareit.com/api/",
      "wsUrl": "wss://www.powerhealthcareit.com/ws/"
    }
  }
}
```

### **5. Required Dependencies for Healthcare App**

```bash
# Core navigation and storage
npx expo install @react-navigation/native @react-navigation/stack
npx expo install @react-native-async-storage/async-storage
npx expo install expo-secure-store

# Healthcare-specific features
npx expo install expo-camera expo-document-picker
npx expo install expo-notifications expo-local-authentication

# UI and utilities
npx expo install expo-linear-gradient expo-font
npx expo install @expo/vector-icons react-native-elements
```

## 📋 **Testing Checklist**

### **Before App Store Submission:**

- [ ] Test login/logout with production backend
- [ ] Verify appointment scheduling works
- [ ] Test clinic events upload functionality
- [ ] Check real-time notifications
- [ ] Validate offline data persistence
- [ ] Test on physical iOS device
- [ ] Verify HTTPS connections work
- [ ] Test biometric authentication (if implemented)

## 🎯 **Next Immediate Actions**

1. **Share your mobile repo details** so I can provide specific guidance
2. **Update API URLs** to point to production
3. **Test authentication** against your live backend
4. **Build and test** on iOS device
5. **Prepare for App Store** submission

**What's the name/URL of your existing mobile repository?** I'll help you configure it specifically for your production setup!
