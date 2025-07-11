# Profile Page Hooks

This directory contains custom React hooks for the ProfilePage functionality.

## Hooks

### useProfilePageLogic

Consolidates all ProfilePage business logic including authentication, profile management, user search, and password changes.

**Returns:**

- **State:**

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

- **Setters:**

  - `setProfile` (function): Update profile data
  - `setEditingProfile` (function): Toggle edit mode
  - `setShowPasswordChange` (function): Toggle password form
  - `updatePasswordData` (function): Update password form data

- **Handlers:**

  - `handleProfileSubmit` (function): Submit profile changes
  - `handleFileUpload` (function): Handle profile picture upload
  - `handleDeleteUser` (function): Delete user (admin only)
  - `handlePasswordSubmit` (function): Submit password change
  - `handleSearchChange` (function): Handle user search input
  - `handleSelectUser` (function): Select user from search results
  - `handleProfileCancel` (function): Cancel profile editing
  - `handlePasswordCancel` (function): Cancel password change

- **Search Functions:**
  - `searchUsers` (function): Execute user search

**Features:**

- Integrates authentication, profile, search, and password hooks
- Manages all form handlers and state transitions
- Provides toast notifications for user feedback
- Handles admin-specific functionality (user search, deletion)
- Manages file uploads for profile pictures

## Usage

```javascript
import { useProfilePageLogic } from "../hooks/profile-page";

function ProfilePage() {
  const profilePageLogic = useProfilePageLogic();

  return <ProfilePageContainer {...profilePageLogic} />;
}
```

## Dependencies

- React (useRef)
- react-router-dom (useNavigate)
- Custom hooks: useAuth, useProfile, useSearch, usePasswordChange
- SimpleToast component
- Constants configuration

## File Structure

```
profile-page/
├── useProfilePageLogic.js
├── index.js (barrel exports)
└── README.md
```
