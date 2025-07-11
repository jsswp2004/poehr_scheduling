# Holidays Components

This directory contains modular React components for the holidays management system.

## Components

### HolidayHeader

- **Purpose**: Top section with search, year loading, and add holiday functionality
- **Props**:
  - `searchQuery`, `onSearchChange`, `onClearSearch`: Search functionality
  - `yearInput`, `onYearChange`, `loadingYear`, `onLoadYear`: Year loading
  - `onAddHoliday`: Add new holiday handler
- **Features**: Search field, year selector, load year button, add holiday button

### HolidayTable

- **Purpose**: Main table displaying holidays with actions
- **Props**:
  - `loading`, `filteredHolidays`, `buffered`, `deletingId`: Data and state
  - `formatDate`: Date formatting utility
  - `onCheckboxChange`, `onEdit`, `onDelete`: Action handlers
- **Features**:
  - Sticky header table
  - Loading and empty states
  - Checkbox for recognition status
  - Edit and delete actions

### HolidayFormDialog

- **Purpose**: Modal dialog for adding/editing holidays
- **Props**:
  - `open`, `editingHoliday`, `holidayFormData`, `saving`: Dialog state
  - `onClose`, `onSave`, `onUpdateFormData`: Action handlers
- **Features**: Form fields for name, date, and recognition status

### HolidayActions

- **Purpose**: Bottom section with save functionality and status messages
- **Props**:
  - `saving`, `loading`, `status`: State information
  - `onSave`: Save changes handler
- **Features**: Save button with loading state, status alerts

## File Reduction

- **Original**: HolidaysPage.js (549 lines)
- **Refactored**: HolidaysPage_refactored.js (~90 lines)
- **Reduction**: ~84% smaller main file

## Usage

```javascript
import {
  HolidayHeader,
  HolidayTable,
  HolidayFormDialog,
  HolidayActions,
} from "../components/holidays";
```

All components follow Material-UI design patterns and include proper loading states and error handling.
