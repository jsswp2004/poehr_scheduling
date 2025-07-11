# Registration Components

This directory contains the modular UI components for the RegisterPage.

## Components

### RegistrationForm

- **Purpose**: Handles user registration form with role-based fields
- **Features**:
  - Patient/non-patient type selection
  - Provider selection for patients
  - Contact information validation
  - Organization field for non-logged-in users
  - Real-time form validation
- **Props**: `adminMode`, `formData`, `isPatient`, `hasProvider`, `doctorOptions`, handlers

### PatientInfoPanel

- **Purpose**: Displays and manages patient information after registration
- **Features**:
  - Patient details display with edit/view modes
  - Inline editing with save/cancel functionality
  - Provider and organization selection
  - Phone number formatting
  - Medical history notes
- **Props**: `registeredPatient`, `patientEditData`, `editMode`, `doctors`, `organizations`, handlers

### DeleteConfirmationDialog

- **Purpose**: Confirmation modal for patient deletion
- **Features**:
  - Warning message about irreversible action
  - Loading state during deletion
  - Cancel/confirm actions
- **Props**: `open`, `onClose`, `onConfirm`, `loading`

## State Management

All business logic is handled by custom hooks:

- `useRegistration` - Registration form data and submission
- `useRegistrationData` - Doctors, organizations, and current user data
- `usePatientManagement` - Patient info display, editing, and deletion
- `useRegistrationUtils` - Utility functions and formatting helpers

## Key Features

### Registration Flow

1. User selects patient/non-patient type
2. Fills out registration form with conditional fields
3. Selects provider if applicable
4. Form validation and submission
5. In admin mode, patient data is displayed for management

### Admin Mode

- Displays registered patient information immediately
- Allows inline editing of patient details
- Provides delete functionality with confirmation
- Manages provider and organization assignments

### Validation

- Required fields based on user type and provider selection
- Email and phone validation for patients without providers
- Contact information alerts and messaging

## Usage

```jsx
import {
  RegistrationForm,
  PatientInfoPanel,
  DeleteConfirmationDialog,
} from "../components/registration";
```

All components follow Material-UI design patterns and are fully responsive.
