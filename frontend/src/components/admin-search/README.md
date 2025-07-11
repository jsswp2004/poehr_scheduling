# Admin Search Components and Hooks

This directory contains the modularized components and hooks for the Admin User Search page functionality.

## Components

### PageHeader

- **Purpose**: Displays the page title and navigation
- **Features**: Title display, back button to admin dashboard
- **Props**: None (static layout)

### SearchForm

- **Purpose**: Provides search input and submit functionality
- **Features**: Search field, submit button, form validation
- **Props**:
  - `query` - Current search query string
  - `onQueryChange` - Handler for query changes
  - `onSearch` - Handler for search submission

### AppointmentsTable

- **Purpose**: Displays appointments in a responsive table format
- **Features**: Sortable columns, action buttons, hover effects
- **Props**:
  - `appointments` - Array of appointment objects to display
  - `onViewDetails` - Handler for viewing appointment details
  - `onDeleteAppointment` - Handler for deleting appointments

### AppointmentModal

- **Purpose**: Shows detailed appointment information in a modal
- **Features**: Full appointment details, edit navigation, close functionality
- **Props**:
  - `open` - Boolean to control modal visibility
  - `onClose` - Handler for closing the modal
  - `appointment` - Appointment object to display

### PaginationWrapper

- **Purpose**: Handles pagination for large result sets
- **Features**: Page navigation, automatic hiding when unnecessary
- **Props**:
  - `totalItems` - Total number of items
  - `itemsPerPage` - Number of items per page
  - `currentPage` - Current active page
  - `onPageChange` - Handler for page changes

## Hooks

### useAdminAuth

- **Purpose**: Handles authentication and authorization for admin users
- **Features**: Token validation, role checking, automatic redirects
- **Returns**: `{ getAuthToken }`

### useAppointmentSearch

- **Purpose**: Manages appointment fetching, filtering, and search logic
- **Features**: API calls, search filtering, delete operations, data sorting
- **Returns**: `{ query, setQuery, results, sortedResults, handleSearch, handleDeleteAppointment, fetchAppointments }`

### usePagination

- **Purpose**: Provides pagination logic for any data set
- **Features**: Page calculation, data slicing, navigation handling
- **Returns**: `{ currentPage, paginatedItems, handlePageChange, itemsPerPage }`

### useAppointmentModal

- **Purpose**: Manages modal state for appointment details
- **Features**: Modal open/close, selected item tracking
- **Returns**: `{ isOpen, selectedItem, openModal, closeModal }`

## File Structure

```
admin-search/
├── components/
│   ├── PageHeader.js
│   ├── SearchForm.js
│   ├── AppointmentsTable.js
│   ├── AppointmentModal.js
│   ├── PaginationWrapper.js
│   └── index.js
├── hooks/
│   ├── useAdminAuth.js
│   ├── useAppointmentSearch.js
│   ├── usePagination.js
│   ├── useAppointmentModal.js
│   └── index.js
└── README.md
```

## Usage Example

```jsx
import {
  useAdminAuth,
  useAppointmentSearch,
  usePagination,
  useAppointmentModal,
} from "../hooks/admin-search";
import {
  PageHeader,
  SearchForm,
  AppointmentsTable,
  AppointmentModal,
  PaginationWrapper,
} from "../components/admin-search";

function AdminUserSearchPage() {
  const { getAuthToken } = useAdminAuth();
  const {
    query,
    setQuery,
    sortedResults,
    handleSearch,
    handleDeleteAppointment,
  } = useAppointmentSearch(getAuthToken);
  const { currentPage, paginatedItems, handlePageChange, itemsPerPage } =
    usePagination(sortedResults, 10);
  const { isOpen, selectedItem, openModal, closeModal } = useAppointmentModal();

  return (
    <Box>
      <PageHeader />
      <SearchForm
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
      />
      <AppointmentsTable
        appointments={paginatedItems}
        onViewDetails={openModal}
        onDeleteAppointment={handleDeleteAppointment}
      />
      <PaginationWrapper
        totalItems={sortedResults.length}
        itemsPerPage={itemsPerPage}
        currentPage={currentPage}
        onPageChange={handlePageChange}
      />
      <AppointmentModal
        open={isOpen}
        onClose={closeModal}
        appointment={selectedItem}
      />
    </Box>
  );
}
```

## Key Features

- **Authentication**: Role-based access control for admin users
- **Search**: Multi-field search across patient, provider, date, and description
- **Actions**: View details and delete functionality with confirmations
- **Pagination**: Efficient handling of large appointment datasets
- **Responsive**: Mobile-friendly table layout and modal dialogs
- **Error Handling**: Graceful error handling for API failures
- **Optimized**: Sorted results with efficient filtering and pagination
