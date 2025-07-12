# Appointment Form Components

This directory contains modular React components for building appointment forms.

## Components

### `AppointmentFormFields`

- Main form fields component
- Handles clinic events, date/time, duration, recurrence
- Doctor selection and status fields
- Responsive design with Material-UI

### `AvailableSlotsPanel`

- Displays available appointment slots
- Interactive slot selection
- Handles empty states
- Shows formatted times

### `AppointmentFormActions`

- Form action buttons (submit, cancel)
- Loading states with spinners
- Disabled states during submission

## Usage

```javascript
import {
  AppointmentFormFields,
  AvailableSlotsPanel,
  AppointmentFormActions,
} from "./components/appointment-form";

const MyForm = () => (
  <form>
    <AppointmentFormFields {...props} />
    <AppointmentFormActions {...props} />
  </form>
);
```

## Features

- **Modular Components**: Each component handles specific UI concerns
- **Consistent Styling**: Material-UI theme integration
- **Responsive Design**: Works on mobile and desktop
- **Accessibility**: Proper labels and ARIA attributes
- **Form Integration**: Easy integration with React Hook Form or similar
