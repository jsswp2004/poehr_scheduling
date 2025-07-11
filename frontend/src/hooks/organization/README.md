# Organization Hooks

This directory contains custom React hooks for managing organization-related functionality.

## Available Hooks

### `useAuth`

Manages user authentication and permission checking for organization management.

**Returns:**

- `currentUser`: Current user object
- `loading`: Authentication loading state
- `canEdit`: Boolean indicating if user can edit organizations
- `canSearch`: Boolean indicating if user can search all organizations (system admin only)
- `fetchCurrentUser`: Function to refetch current user data

### `useOrganizationData`

Manages organization data fetching and state management.

**Parameters:**

- `currentUser`: Current user object
- `canSearch`: Boolean indicating search permissions

**Returns:**

- `userOrganization`: User's organization data
- `allOrganizations`: List of all organizations (system admin only)
- `loading`: Data loading state
- `setUserOrganization`: Function to update user organization
- `fetchUserOrganization`: Function to refetch user organization
- `fetchAllOrganizations`: Function to refetch all organizations
- `updateOrganizationInList`: Function to update organization in the list
- `removeOrganizationFromList`: Function to remove organization from the list

### `useOrganizationSearch`

Handles search functionality for filtering organizations.

**Parameters:**

- `allOrganizations`: Array of all organizations to search through

**Returns:**

- `searchQuery`: Current search query string
- `filteredOrganizations`: Filtered organizations based on search
- `handleSearchChange`: Function to update search query
- `setSearchQuery`: Function to set search query directly

### `useOrganizationForm`

Manages organization form state and CRUD operations.

**Parameters:**

- `userOrganization`: User's organization data
- `setUserOrganization`: Function to update user organization
- `updateOrganizationInList`: Function to update organization in list
- `removeOrganizationFromList`: Function to remove organization from list
- `fetchAllOrganizations`: Function to refetch all organizations
- `canSearch`: Boolean indicating search permissions

**Returns:**

- `editMode`: Boolean indicating if form is in edit mode
- `saving`: Boolean indicating if save operation is in progress
- `editingOrganization`: Organization currently being edited
- `selectedLogo`: Selected logo file
- `previewLogo`: Preview URL for selected logo
- `formData`: Form data object
- `setEditMode`: Function to toggle edit mode
- `setEditingOrganization`: Function to set organization being edited
- `handleInputChange`: Function to handle form input changes
- `handleLogoChange`: Function to handle logo file selection
- `handleSave`: Function to save organization changes
- `handleCancel`: Function to cancel editing
- `handleEditOrganization`: Function to start editing an organization
- `handleDeleteOrganization`: Function to delete an organization
- `initializeFormData`: Function to initialize form with organization data

### `useDeleteConfirmation`

Manages delete confirmation dialog state.

**Returns:**

- `deleteConfirmDialog`: Boolean indicating if dialog is open
- `organizationToDelete`: Organization selected for deletion
- `openDeleteDialog`: Function to open delete dialog with organization
- `closeDeleteDialog`: Function to close delete dialog

## Utilities

### `organizationUtils.js`

Contains utility functions for organization operations:

- `getLogoUrl(logoPath)`: Constructs proper URL for organization logos
- `handleLogoError(organizationName, logoPath)`: Handles logo loading errors with logging

## Usage Example

```javascript
import {
  useAuth,
  useOrganizationData,
  useOrganizationSearch,
  useOrganizationForm,
  useDeleteConfirmation,
  getLogoUrl,
} from "../hooks/organization";

function OrganizationPage() {
  const { currentUser, canEdit, canSearch } = useAuth();
  const { userOrganization, allOrganizations } = useOrganizationData(
    currentUser,
    canSearch
  );
  const { searchQuery, filteredOrganizations, handleSearchChange } =
    useOrganizationSearch(allOrganizations);

  // ... rest of component logic
}
```
