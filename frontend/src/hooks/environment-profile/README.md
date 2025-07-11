# Environment Profile Hooks

This directory contains custom React hooks for the Environment Profile Page functionality.

## Hooks

### `useAdminAuth.js`

- **Purpose**: Handles admin authentication and role management
- **Returns**:
  - `userRole`: Current user's role ('admin' or 'system_admin')
  - `getAuthToken`: Function to retrieve authentication token
- **Features**:
  - Automatic redirect for unauthorized users
  - Role validation and navigation
  - JWT token decoding and validation

### `useOrganizations.js`

- **Purpose**: Manages organization data and selection for system admins
- **Params**:
  - `userRole`: Current user role
  - `getAuthToken`: Function to get auth token
- **Returns**:
  - `organizations`: Array of organization objects
  - `selectedOrganization`: Currently selected organization ID
  - `setSelectedOrganization`: Function to change selected organization
- **Features**:
  - Conditional fetching based on user role
  - Fallback API endpoints
  - Automatic selection of first organization

### `useEnvironmentSettings.js`

- **Purpose**: Manages environment settings (blocked days) state and operations
- **Params**:
  - `userRole`: Current user role
  - `selectedOrganization`: Selected organization ID
  - `getAuthToken`: Function to get auth token
- **Returns**:
  - `blockedDays`: Array of blocked day values
  - `saving`: Save operation state
  - `status`: Status message
  - `loading`: Loading state
  - `handleCheckbox`: Function to toggle day blocking
  - `handleSave`: Function to save settings
- **Features**:
  - Automatic settings fetching
  - Optimistic UI updates
  - Error handling and status messages
  - Organization-specific settings support

### `useTabNavigation.js`

- **Purpose**: Manages tab navigation state
- **Params**:
  - `initialTab`: Initial tab key (default: 'blocked-days')
- **Returns**:
  - `tabKey`: Current tab key
  - `handleTabChange`: Function to change tabs
- **Features**: Simple tab state management

## Usage

```jsx
import {
  useAdminAuth,
  useOrganizations,
  useEnvironmentSettings,
  useTabNavigation,
} from "../hooks/environment-profile";

const EnvironmentProfilePage = () => {
  const { userRole, getAuthToken } = useAdminAuth();
  const { tabKey, handleTabChange } = useTabNavigation();
  const { organizations, selectedOrganization, setSelectedOrganization } =
    useOrganizations(userRole, getAuthToken);
  const { blockedDays, saving, handleCheckbox, handleSave } =
    useEnvironmentSettings(userRole, selectedOrganization, getAuthToken);

  // Use in component...
};
```

## Data Flow

1. **Authentication**: `useAdminAuth` validates user and provides token access
2. **Organizations**: `useOrganizations` fetches org data for system admins
3. **Settings**: `useEnvironmentSettings` loads/saves blocked days configuration
4. **Navigation**: `useTabNavigation` manages which tab content is displayed

## File Structure

```
hooks/environment-profile/
├── useAdminAuth.js          # Authentication and roles
├── useOrganizations.js      # Organization management
├── useEnvironmentSettings.js # Settings CRUD operations
├── useTabNavigation.js      # Tab state management
├── index.js                 # Barrel exports
└── README.md               # This file
```
