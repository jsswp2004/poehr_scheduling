# Appointments Components

This directory contains the modular UI components for the AppointmentsPage.

## Components

### SummaryPanel

- **Purpose**: Displays daily summary with greeting and statistics
- **Features**:
  - Personalized greeting based on time of day
  - Total appointments count for today
  - Breakdown of patients per doctor
- **Props**: `userName`, `greeting`, `totalToday`, `doctorPatientMap`

### TodaysAppointmentsPanel

- **Purpose**: Shows today's appointments with status management
- **Features**:
  - Time-sorted list of today's appointments
  - Interactive checkboxes for "Arrived" and "No Show" status
  - Click-to-view appointment details
- **Props**: `todaysAppointments`, `onStatusUpdate`, `onAppointmentClick`, format functions

### AppointmentsTable

- **Purpose**: Main appointments table with search and pagination
- **Features**:
  - Real-time search across all appointment fields
  - Paginated results (10 per page)
  - View and delete actions for each appointment
  - Responsive table design
- **Props**: `searchQuery`, `onSearchChange`, `appointments`, action handlers, format functions

### AppointmentDetailsDialog

- **Purpose**: Modal dialog for viewing appointment details
- **Features**:
  - Complete appointment information display
  - Edit button navigation
  - Responsive modal design
- **Props**: `open`, `onClose`, `appointment`, format functions

## State Management

All business logic is handled by custom hooks:

- `useAppointmentsList` - Main appointments data and search
- `useTodaysAppointments` - Today's appointments and status updates
- `useAppointmentDetails` - Modal state management
- `useAppointmentPageUtils` - Utility functions and formatting

## Usage

```jsx
import {
  SummaryPanel,
  TodaysAppointmentsPanel,
  AppointmentsTable,
  AppointmentDetailsDialog,
} from "../components/appointments";
```

All components are designed to be reusable and follow Material-UI design patterns.
