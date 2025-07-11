# Communicator Components

This directory contains the modular UI components for the CommunicatorPage.

## Components

### ContactsTable

- **Purpose**: Displays contacts list with CRUD operations
- **Features**:
  - Contacts table with edit/delete actions
  - Action buttons (Add, Upload, Download Template, Print)
  - Loading indicator
  - Phone/Email icons for visual clarity
  - Empty state messaging
- **Props**: `contacts`, `loading`, action handlers, utility functions

### BulkMessageForm

- **Purpose**: Handles bulk message composition and sending
- **Features**:
  - Message text area with character validation
  - Email subject field (conditional)
  - SMS/Email delivery method checkboxes
  - Contact count alerts
  - Send button with loading state
- **Props**: `contacts`, `messageForm`, `sending`, change handlers

### ContactFormDialog

- **Purpose**: Modal dialog for creating and editing contacts
- **Features**:
  - Create/Edit mode handling
  - Form validation for required fields
  - Phone and email input fields
  - Save/Cancel actions
- **Props**: `open`, `editingContact`, `contactForm`, handlers

### FileUploadDialog

- **Purpose**: CSV file upload modal for bulk contact import
- **Features**:
  - File selection with CSV validation
  - Upload progress indication
  - Template download option
  - Upload success feedback
- **Props**: `open`, `selectedFile`, `uploading`, handlers

### CommunicatorHeader

- **Purpose**: Page header with title, tabs, and contact count
- **Features**:
  - Tab navigation (Contacts/Send Message)
  - Dynamic contact count chip
  - Consistent page branding
- **Props**: `currentTab`, `contactsCount`, `onTabChange`

## State Management

All business logic is handled by custom hooks:

- `useContacts` - Contact CRUD operations and data management
- `useFileUpload` - CSV file upload and template download
- `useBulkMessaging` - Message composition and bulk sending
- `useContactForm` - Contact form dialog state and validation
- `useCommunicatorUtils` - Utility functions for printing and formatting

## Key Features

### Contact Management

- Create, read, update, and delete contacts
- CSV bulk import with template download
- Print-friendly contact directory
- Phone and email validation

### Bulk Messaging

- Send SMS and/or email to all contacts
- Message composition with subject line
- Delivery method selection
- Real-time validation and feedback

### File Operations

- CSV template generation and download
- Bulk contact import from CSV files
- Print-ready contact directory
- File validation and error handling

### Role-Based Access

- Admin, system admin, and registrar access only
- Authentication token validation
- Automatic redirect for unauthorized users

## Usage

```jsx
import {
  ContactsTable,
  BulkMessageForm,
  ContactFormDialog,
  FileUploadDialog,
  CommunicatorHeader,
} from "../components/communicator";
```

All components are designed to be reusable and follow Material-UI design patterns with consistent styling and responsive behavior.
