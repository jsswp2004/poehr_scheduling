# Organization Components

This directory contains reusable React components for organization management functionality.

## Available Components

### `OrganizationForm`

Main form component for displaying and editing organization details.

**Props:**

- `userOrganization`: User's organization data
- `editingOrganization`: Organization currently being edited (for system admin)
- `editMode`: Boolean indicating if form is in edit mode
- `saving`: Boolean indicating if save operation is in progress
- `formData`: Form data object containing name and logo
- `previewLogo`: Preview URL for selected logo
- `canEdit`: Boolean indicating if user can edit
- `onInputChange`: Function to handle form input changes
- `onLogoChange`: Function to handle logo file selection
- `onEditToggle`: Function to toggle edit mode
- `onSave`: Function to save form changes
- `onCancel`: Function to cancel editing
- `getLogoUrl`: Function to construct logo URLs

**Features:**

- Displays organization avatar with logo
- Editable organization name field
- Logo upload functionality with preview
- Save/Cancel buttons with loading states
- Creation date display
- Permission-based edit controls

### `OrganizationSearchTable`

Table component for searching and displaying all organizations (system admin only).

**Props:**

- `searchQuery`: Current search query string
- `filteredOrganizations`: Array of filtered organizations
- `editingOrganization`: Organization currently being edited
- `onSearchChange`: Function to handle search input changes
- `onEditOrganization`: Function to start editing an organization
- `onDeleteClick`: Function to handle delete button clicks
- `getLogoUrl`: Function to construct logo URLs

**Features:**

- Search input with icon
- Sortable table with organization data
- Avatar display for each organization
- Click-to-edit functionality
- Delete button with confirmation
- Highlighted currently editing row
- Empty state message

### `DeleteConfirmationDialog`

Modal dialog for confirming organization deletion.

**Props:**

- `open`: Boolean indicating if dialog is open
- `organizationToDelete`: Organization selected for deletion
- `onClose`: Function to close the dialog
- `onConfirmDelete`: Function to confirm deletion

**Features:**

- Clear confirmation message
- Cancel and Delete buttons
- Organization name display
- Warning about irreversible action

### `LoadingSpinner`

Simple loading spinner component for async operations.

**Features:**

- Centered circular progress indicator
- Consistent loading UI across the page

## Component Structure

```
components/organization/
├── OrganizationForm.js          # Main organization form
├── OrganizationSearchTable.js   # Search and table for all organizations
├── DeleteConfirmationDialog.js  # Delete confirmation modal
├── LoadingSpinner.js            # Loading indicator
├── index.js                     # Barrel export file
└── README.md                    # This documentation
```

## Usage Example

```javascript
import {
  OrganizationForm,
  OrganizationSearchTable,
  DeleteConfirmationDialog,
  LoadingSpinner,
} from "../components/organization";

function OrganizationPage() {
  return (
    <Box>
      <OrganizationForm
        userOrganization={userOrganization}
        editMode={editMode}
        formData={formData}
        onSave={handleSave}
        onCancel={handleCancel}
        // ... other props
      />

      {canSearch && (
        <OrganizationSearchTable
          searchQuery={searchQuery}
          filteredOrganizations={filteredOrganizations}
          onEditOrganization={handleEditOrganization}
          // ... other props
        />
      )}
    </Box>
  );
}
```

## Styling

All components use Material-UI (MUI) components and follow the application's design system:

- Consistent spacing using MUI's sx prop
- Paper containers for sections
- Primary and secondary color schemes
- Responsive design patterns
- Accessible form controls and interactions
