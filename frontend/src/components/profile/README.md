# Profile Components

This directory contains reusable components for profile management functionality.

## Components

### UserSearchSection

Handles user search functionality for system administrators.

- **Props**: searchTerm, userSearchResults, searchLoading, showSearchResults, onSearchChange, onSearchSubmit, onSelectUser
- **Features**: Search input, loading states, results display, user selection

### ProfileForm

Main profile editing form with all user fields.

- **Props**: profile, editingProfile, profileLoading, isSystemAdmin, availableRoles, fileInputRef, onProfileChange, onEditToggle, onSave, onCancel, onFileUpload
- **Features**: Edit mode toggle, form validation, profile picture upload, role management

### PasswordForm

Secure password change form with validation.

- **Props**: showPasswordChange, passwordData, passwordLoading, onTogglePasswordForm, onPasswordDataChange, onPasswordSubmit, onCancel
- **Features**: Password validation, confirmation matching, secure inputs

### DangerZone

Contains destructive actions like user deletion.

- **Props**: onDeleteUser, disabled
- **Features**: Clear warning messaging, confirmation flow

## Usage

```jsx
import { UserSearchSection, ProfileForm, PasswordForm, DangerZone } from '../components/profile';

// Use in your page component
<UserSearchSection {...searchProps} />
<ProfileForm {...profileProps} />
<PasswordForm {...passwordProps} />
<DangerZone {...dangerProps} />
```

## Benefits

- **Reusability**: Components can be used in other parts of the application
- **Testability**: Each component can be tested in isolation
- **Maintainability**: Clear separation of concerns
- **Performance**: Smaller components enable better optimization
