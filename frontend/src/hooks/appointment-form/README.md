# Appointment Form Hooks

This directory contains custom React hooks for managing appointment form functionality.

## Hooks

### `useAppointmentFormData`
- Manages form data state and validation
- Handles form field changes
- Prepares payload for API submission
- Initializes form data for editing mode

### `useAppointmentDoctors`
- Manages doctor selection and availability
- Fetches available time slots
- Handles provider availability blocking
- Manages slot selection

### `useAppointmentFormExternal`
- Fetches external data (clinic events, holidays, blocked days)
- Provides loading states
- Handles API errors

### `useAppointmentFormSubmission`
- Handles form submission logic
- Manages create/update operations
- Provides submission loading states
- Handles success/error scenarios

## Usage

```javascript
import { 
  useAppointmentFormData,
  useAppointmentDoctors,
  useAppointmentFormExternal,
  useAppointmentFormSubmission
} from './hooks/appointment-form';

// Use in your component
const MyComponent = () => {
  const formData = useAppointmentFormData();
  const doctors = useAppointmentDoctors();
  // ... etc
};
```

## Features

- **Modular Design**: Each hook handles a specific concern
- **Reusable Logic**: Can be used across different appointment components
- **Error Handling**: Comprehensive error management
- **Loading States**: Built-in loading and submission states
- **Validation**: Form validation and conflict checking
