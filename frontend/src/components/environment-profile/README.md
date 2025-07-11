# Environment Profile Components

This directory contains modular components for the Environment Profile Page functionality.

## Components

### `EnvironmentTabs.js`

- **Purpose**: Tab navigation for different environment settings sections
- **Props**:
  - `value`: Current tab value
  - `onChange`: Tab change handler
- **Features**: Styled Material-UI tabs with hover effects

### `OrganizationSelector.js`

- **Purpose**: Organization selection dropdown for system administrators
- **Props**:
  - `userRole`: Current user's role
  - `organizations`: Array of organization objects
  - `selectedOrganization`: Currently selected organization ID
  - `onOrganizationChange`: Organization change handler
  - `loading`: Loading state
  - `saving`: Saving state
- **Features**: Conditional rendering based on user role, loading states

### `BlockedDaysTable.js`

- **Purpose**: Table displaying days of the week with checkboxes for blocking
- **Props**:
  - `blockedDays`: Array of blocked day values (0-6)
  - `onDayToggle`: Function to toggle day blocking
  - `loading`: Loading state
  - `saving`: Saving state
- **Features**: Interactive checkboxes, disabled states during operations

### `SaveSection.js`

- **Purpose**: Save button, status alerts, and help text
- **Props**:
  - `onSave`: Save function
  - `saving`: Saving state
  - `loading`: Loading state
  - `status`: Status message
  - `userRole`: Current user role
  - `selectedOrganization`: Selected organization ID
  - `organizations`: Organizations array
- **Features**: Loading spinner, success/error alerts, dynamic help text

### `BlockedDaysTab.js`

- **Purpose**: Main container for blocked days configuration
- **Props**: Combines props from sub-components
- **Features**: Orchestrates organization selector, table, and save section

### `TabContent.js`

- **Purpose**: Content switcher based on selected tab
- **Props**:
  - `tabKey`: Current tab key
  - All props needed for blocked days functionality
- **Features**: Renders appropriate content for each tab, lazy loading

## Usage

```jsx
import {
  EnvironmentTabs,
  TabContent
} from '../components/environment-profile';

// Use in EnvironmentProfilePage component
<EnvironmentTabs value={tabKey} onChange={handleTabChange} />
<TabContent
  tabKey={tabKey}
  userRole={userRole}
  // ... other props
/>
```

## File Structure

```
components/environment-profile/
├── EnvironmentTabs.js       # Tab navigation
├── OrganizationSelector.js  # Organization dropdown
├── BlockedDaysTable.js      # Days selection table
├── SaveSection.js           # Save controls and status
├── BlockedDaysTab.js        # Blocked days container
├── TabContent.js            # Content switcher
├── index.js                 # Barrel exports
└── README.md               # This file
```
