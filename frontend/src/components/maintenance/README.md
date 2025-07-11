# Maintenance Components

This directory contains modular React components for the schedule maintenance system.

## Components

### ScheduleForm

- **Purpose**: Form for creating and editing doctor schedules
- **Props**:
  - `formData`, `editingId`: Form state and editing mode
  - `doctors`, `selectedDoctor`: Doctor selection data
  - `onDoctorChange`, `onFormChange`, `onUpdateFormData`: Form handlers
  - `onSubmit`, `onCancel`: Action handlers
- **Features**:
  - Doctor selection dropdown
  - Date/time inputs for schedule
  - Recurrence settings
  - Block type selection for blocked schedules
  - Form validation and submission

### ScheduleTable

- **Purpose**: Reusable table component for displaying schedules
- **Props**:
  - `schedules`, `doctors`: Data for display
  - `isBlocked`: Whether to show blocked or available schedules
  - `tableRef`: Reference for auto-scrolling
  - `onEdit`, `onDelete`: Action handlers
- **Features**:
  - Filtered display based on schedule type
  - Auto-scrolling capability
  - Edit and delete actions
  - Empty state handling
  - Responsive design with sticky headers

### ScheduleOverview

- **Purpose**: Container component for both availability and blocked schedule tables
- **Props**:
  - `schedules`, `doctors`: Data for both tables
  - `availabilityTableRef`, `blockedTableRef`: References for auto-scrolling
  - `onEdit`, `onDelete`: Action handlers
- **Features**: Side-by-side layout of availability and blocked schedules

## File Reduction

- **Original**: MaintenancePage.js (521 lines)
- **Refactored**: MaintenancePage_refactored.js (~85 lines)
- **Reduction**: ~84% smaller main file

## Usage

```javascript
import { ScheduleForm, ScheduleOverview } from "../components/maintenance";
```

All components follow Material-UI design patterns and include proper auto-scrolling, validation, and responsive behavior.
