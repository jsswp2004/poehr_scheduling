# Maintenance Hooks

This directory contains custom React hooks for the schedule maintenance system.

## Hooks

### useMaintenanceData

- **Purpose**: Manage doctors and holidays data fetching
- **Returns**: Doctors list, holidays, selected doctor state, and doctor selection handler
- **Features**:
  - Fetch doctors from API
  - Fetch recognized holidays
  - Handle doctor selection with proper formatting

### useScheduleManagement

- **Purpose**: Manage schedule data and CRUD operations
- **Parameters**: `selectedDoctor`, `token`
- **Returns**: Schedules list, editing state, fetch function, and delete handler
- **Features**:
  - Fetch schedules for selected doctor
  - Deduplicate recurring schedules
  - Handle schedule deletion with confirmation

### useScheduleForm

- **Purpose**: Handle schedule form state and submission
- **Parameters**: `selectedDoctor`, `token`, `editingId`, `setEditingId`, `fetchSchedules`, `holidays`
- **Returns**: Form data, change handlers, submit/cancel functions, and edit population
- **Features**:
  - Form validation including weekend/holiday checks
  - Create and update schedule operations
  - Form reset and cancellation
  - Edit mode population from existing schedule

### useTableAutoScroll

- **Purpose**: Handle automatic table scrolling behavior
- **Parameters**: `schedules` array
- **Returns**: Table refs for availability and blocked tables
- **Features**: Auto-scroll both tables to bottom when schedules update

## Usage

```javascript
import {
  useMaintenanceData,
  useScheduleManagement,
  useScheduleForm,
  useTableAutoScroll,
} from "../hooks/maintenance";
```

These hooks separate business logic from UI components and provide comprehensive schedule management functionality.
