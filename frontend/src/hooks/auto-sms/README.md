# Auto SMS Hooks

This directory contains custom React hooks for the Auto SMS Setup Page functionality.

## Hooks

### `useSMSSettings.js`

- **Purpose**: Manages SMS automation settings and persistence
- **Returns**:
  - `frequency`: Current SMS frequency setting
  - `setFrequency`: Function to update frequency
  - `dayOfWeek`: Current day of week setting (0-6)
  - `setDayOfWeek`: Function to update day of week
  - `startDate`: Current start date
  - `setStartDate`: Function to update start date
  - `saving`: Boolean indicating if save is in progress
  - `status`: Status message from save operation
  - `loading`: Boolean indicating if initial load is in progress
  - `handleSave`: Function to save settings
  - `getAuthToken`: Function to get authentication token
- **Features**:
  - API integration for loading/saving settings
  - Default date handling (next day if no date set)
  - Error handling with user feedback
  - Authentication token management

### `useSMSExecution.js`

- **Purpose**: Manages SMS execution and analytics functionality
- **Parameters**:
  - `getAuthToken`: Function to get authentication token
- **Returns**:
  - `runNowStatus`: Status message from run now operation
  - `monthlySMSTotal`: Number of SMS sent this month
  - `handleRunNow`: Function to trigger immediate SMS sending
  - `fetchMonthlyTotal`: Function to refresh monthly totals
  - `getCurrentMonthName`: Function to get formatted month name
- **Features**:
  - Manual SMS execution with feedback
  - Monthly analytics calculation
  - Automatic total refresh after sending
  - Date range queries for current month

## Usage

```jsx
import { useSMSSettings, useSMSExecution } from "../hooks/auto-sms";

const AutoSMSSetUpPage = () => {
  // Settings management
  const {
    frequency,
    setFrequency,
    // ... other settings
    handleSave,
    getAuthToken,
  } = useSMSSettings();

  // Execution and analytics
  const { runNowStatus, monthlySMSTotal, handleRunNow } =
    useSMSExecution(getAuthToken);

  // Use in component...
};
```

## API Integration

### Settings Endpoints

- **GET** `/api/settings/environment/` - Load SMS settings
- **POST** `/api/settings/environment/` - Save SMS settings

### Execution Endpoints

- **POST** `/api/run-patient-sms-reminders-now/` - Trigger immediate SMS
- **GET** `/api/communicator/logs/` - Fetch SMS logs for analytics

## File Structure

```
hooks/auto-sms/
├── useSMSSettings.js       # Settings management and persistence
├── useSMSExecution.js      # Execution and analytics
├── index.js                # Barrel exports
└── README.md              # This file
```
