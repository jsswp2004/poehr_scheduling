# Holidays Hooks

This directory contains custom React hooks for the holidays management system.

## Hooks

### useHolidaysAuth

- **Purpose**: Handle authentication and authorization for holidays page
- **Returns**: `getAuthHeaders` function for API requests
- **Features**: JWT token validation, role checking, navigation on auth failure

### useHolidaysData

- **Purpose**: Manage holidays data, loading, and CRUD operations
- **Parameters**: `getAuthHeaders` function
- **Returns**: Holiday list, buffered changes, loading states, and CRUD handlers
- **Features**: Load holidays, handle checkbox changes, bulk save, delete functionality

### useYearLoader

- **Purpose**: Handle loading holidays for specific years
- **Parameters**: `getAuthHeaders`, `loadHolidays`, `setStatus` functions
- **Returns**: Year input state and load year functionality
- **Features**: Year input management, API call to load year holidays

### useHolidayDialog

- **Purpose**: Manage add/edit holiday dialog state and operations
- **Parameters**: `getAuthHeaders`, `loadHolidays`, `setStatus` functions
- **Returns**: Dialog state, form data, and dialog operations
- **Features**: Open/close dialog, form data management, save holiday (create/update)

### useHolidaySearch

- **Purpose**: Handle holiday search and filtering
- **Parameters**: `holidayList` array
- **Returns**: Search query state and filtered results
- **Features**: Text-based filtering, search query management

### useHolidayUtils

- **Purpose**: Utility functions for holiday operations
- **Returns**: Utility functions like `formatDate`
- **Features**: Date formatting for display

## Usage

```javascript
import {
  useHolidaysAuth,
  useHolidaysData,
  useYearLoader,
  useHolidayDialog,
  useHolidaySearch,
  useHolidayUtils,
} from "../hooks/holidays";
```

These hooks separate business logic from UI components and provide reusable functionality for holiday management.
