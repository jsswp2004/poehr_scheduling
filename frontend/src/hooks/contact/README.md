# Contact Hooks

This directory contains custom React hooks for managing contact page functionality.

## Available Hooks

### `useEmailForm`

Manages email form state, validation, and input handling.

**Returns:**

- `formData`: Object containing email form fields (to, from, telephone, subject, message)
- `formErrors`: Object containing validation errors for form fields
- `handleInputChange`: Function to handle form input changes
- `validateForm`: Function to validate form and return boolean
- `resetForm`: Function to reset form to initial state
- `setFormErrors`: Function to manually set form errors

**Validation Rules:**

- `from`: Required, must be valid email format
- `telephone`: Required field
- Other fields are optional

**Form Fields:**

- `to`: Pre-filled with company email (readonly)
- `from`: User's email address (required)
- `telephone`: User's phone number (required)
- `subject`: Email subject (optional)
- `message`: Email message content (optional)

### `useSmsForm`

Manages SMS form state, validation, and input handling.

**Returns:**

- `smsFormData`: Object containing SMS form fields (phone_to, phone_from, message)
- `smsFormErrors`: Object containing validation errors for SMS form
- `handleSmsInputChange`: Function to handle SMS form input changes
- `validateSmsForm`: Function to validate SMS form and return boolean
- `resetSmsForm`: Function to reset SMS form to initial state
- `setSmsFormErrors`: Function to manually set SMS form errors

**Validation Rules:**

- `phone_from`: Required field
- `message`: Required field

**Form Fields:**

- `phone_to`: Pre-filled with company phone (readonly)
- `phone_from`: User's phone number (required)
- `message`: SMS message content (required)

### `useContactModals`

Manages modal open/close states for email and SMS modals.

**Returns:**

- `isModalOpen`: Boolean indicating if email modal is open
- `isSmsModalOpen`: Boolean indicating if SMS modal is open
- `openEmailModal`: Function to open email modal
- `closeEmailModal`: Function to close email modal
- `openSmsModal`: Function to open SMS modal
- `closeSmsModal`: Function to close SMS modal

### `useContactSubmission`

Handles form submissions and API interactions for both email and SMS.

**Returns:**

- `isLoading`: Boolean indicating if email is being sent
- `isSmsLoading`: Boolean indicating if SMS is being sent
- `handleSendEmail`: Function to send email with form data
- `handleSendSms`: Function to send SMS with form data

**API Endpoints:**

- Email: `POST /api/messages/contact-email/`
- SMS: `POST /api/messages/contact-sms/`

**Features:**

- Handles API errors with user-friendly messages
- Shows success/error toasts
- Calls success callback on successful submission
- No authentication required (public endpoints)

## Usage Example

```javascript
import {
  useEmailForm,
  useSmsForm,
  useContactModals,
  useContactSubmission,
} from "../hooks/contact";

function ContactPage() {
  const { formData, formErrors, handleInputChange, validateForm, resetForm } =
    useEmailForm();
  const {
    smsFormData,
    smsFormErrors,
    handleSmsInputChange,
    validateSmsForm,
    resetSmsForm,
  } = useSmsForm();
  const {
    isModalOpen,
    isSmsModalOpen,
    openEmailModal,
    openSmsModal,
    closeEmailModal,
    closeSmsModal,
  } = useContactModals();
  const { isLoading, isSmsLoading, handleSendEmail, handleSendSms } =
    useContactSubmission();

  // ... component logic
}
```

## Hook Structure

```
hooks/contact/
├── useEmailForm.js          # Email form state and validation
├── useSmsForm.js           # SMS form state and validation
├── useContactModals.js     # Modal state management
├── useContactSubmission.js # API submission handling
├── index.js               # Barrel export file
└── README.md             # This documentation
```

## Error Handling

Both form hooks include automatic error clearing when users start typing in fields with errors. The submission hook handles API errors gracefully and displays appropriate user messages.

## API Integration

The contact submission hook integrates with the backend contact API:

- Uses axios for HTTP requests
- No authentication required
- Handles both success and error responses
- Displays toast notifications for user feedback
