# Profile Page Components

This directory contains UI components for the ProfilePage functionality.

## Components

### ProfilePageContainer

Main container component that renders the complete profile page UI with all sections.

**Props:**

- **State Props:**

  - `currentUser` (object): Current authenticated user
  - `isSystemAdmin` (boolean): Whether user is system admin
  - `profile` (object): Profile data being viewed/edited
  - `editingProfile` (boolean): Whether profile is in edit mode
  - `profileLoading` (boolean): Profile operation loading state
  - `searchTerm` (string): User search term
  - `userSearchResults` (array): Search results for users
  - `searchLoading` (boolean): Search operation loading state
  - `showSearchResults` (boolean): Whether to show search results
  - `showPasswordChange` (boolean): Whether password form is visible
  - `passwordData` (object): Password change form data
  - `passwordLoading` (boolean): Password change loading state
  - `availableRoles` (array): Available user roles for admin
  - `fileInputRef` (ref): Reference to file input for profile picture

- **Setter Props:**

  - `setProfile` (function): Update profile data
  - `setEditingProfile` (function): Toggle edit mode
  - `setShowPasswordChange` (function): Toggle password form

- **Handler Props:**
  - `handleProfileSubmit` (function): Submit profile changes
  - `handleFileUpload` (function): Handle profile picture upload
  - `handleDeleteUser` (function): Delete user (admin only)
  - `handlePasswordSubmit` (function): Submit password change
  - `handleSearchChange` (function): Handle user search input
  - `handleSelectUser` (function): Select user from search results
  - `handleProfileCancel` (function): Cancel profile editing
  - `handlePasswordCancel` (function): Cancel password change
  - `searchUsers` (function): Execute user search

**Features:**

- Renders complete profile page layout
- Includes BackButton navigation
- Conditionally shows admin-only sections
- Integrates all profile sub-components
- Handles loading states with LoadingSpinner

## Usage

```javascript
import { ProfilePageContainer } from "../components/profile-page";
import { useProfilePageLogic } from "../hooks/profile-page";

function ProfilePage() {
  const profilePageLogic = useProfilePageLogic();

  return <ProfilePageContainer {...profilePageLogic} />;
}
```

## Sub-components Used

- `BackButton` - Navigation back button
- `UserSearchSection` - Admin user search functionality
- `ProfileForm` - Profile editing form
- `PasswordForm` - Password change form
- `DangerZone` - User deletion section (admin only)
- `LoadingSpinner` - Loading state indicator

## Dependencies

- @mui/material
- Existing profile sub-components
- BackButton and LoadingSpinner components

## File Structure

```
profile-page/
├── ProfilePageContainer.js
├── index.js (barrel exports)
└── README.md
```
