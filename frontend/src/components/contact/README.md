# Contact Components

This directory contains reusable React components for the contact page functionality.

## Available Components

### `PageHeader`

Displays the contact page header with title and subtitle information.

**Features:**

- Static content with contact page title
- Instructional text for users
- Consistent styling with page layout

### `ContactGrid`

Displays contact information in a grid layout with interactive cards.

**Props:**

- `onEmailClick`: Function called when email card is clicked
- `onSmsClick`: Function called when phone card is clicked

**Features:**

- Three contact cards: Address, Phone, Email
- Address card is non-interactive (display only)
- Phone and Email cards are clickable
- Responsive grid layout
- Hover effects and cursor indicators

**Contact Information:**

- **Address**: 16192 Coastal Highway, Lewes, Delaware 19958, Sussex County
- **Phone**: (301) 880-6015 (clickable - opens SMS modal)
- **Email**: info@powerhealthcareit.com (clickable - opens email modal)

### `EmailModal`

Modal component for composing and sending email messages.

**Props:**

- `isOpen`: Boolean indicating if modal is visible
- `formData`: Object containing form field values
- `formErrors`: Object containing validation errors
- `isLoading`: Boolean indicating if email is being sent
- `onInputChange`: Function to handle input changes
- `onSubmit`: Function to handle form submission
- `onClose`: Function to close the modal

**Features:**

- Pre-filled "To" field (readonly)
- Required fields: From (email), Phone Number
- Optional fields: Subject, Message
- Form validation with error display
- Loading states and disabled controls
- Click outside to close functionality
- Responsive modal design

### `SmsModal`

Modal component for composing and sending SMS messages.

**Props:**

- `isOpen`: Boolean indicating if modal is visible
- `smsFormData`: Object containing SMS form field values
- `smsFormErrors`: Object containing SMS validation errors
- `isSmsLoading`: Boolean indicating if SMS is being sent
- `onInputChange`: Function to handle input changes
- `onSubmit`: Function to handle form submission
- `onClose`: Function to close the modal

**Features:**

- Pre-filled "To" field with company phone (readonly)
- Required fields: From (phone), Message
- Form validation with error display
- Character-appropriate input types (tel, textarea)
- Loading states and disabled controls
- Click outside to close functionality
- Responsive modal design

## Component Structure

```
components/contact/
├── PageHeader.js          # Contact page header and instructions
├── ContactGrid.js         # Contact information grid with interactive cards
├── EmailModal.js          # Email composition modal
├── SmsModal.js           # SMS composition modal
├── index.js              # Barrel export file
└── README.md             # This documentation
```

## Usage Example

```javascript
import {
  PageHeader,
  ContactGrid,
  EmailModal,
  SmsModal,
} from "../components/contact";

function ContactPage() {
  return (
    <div className="contact-page">
      <Header />

      <PageHeader />

      <ContactGrid onEmailClick={openEmailModal} onSmsClick={openSmsModal} />

      <EmailModal
        isOpen={isModalOpen}
        formData={formData}
        formErrors={formErrors}
        isLoading={isLoading}
        onInputChange={handleInputChange}
        onSubmit={handleEmailSubmit}
        onClose={closeEmailModal}
      />

      <SmsModal
        isOpen={isSmsModalOpen}
        smsFormData={smsFormData}
        smsFormErrors={smsFormErrors}
        isSmsLoading={isSmsLoading}
        onInputChange={handleSmsInputChange}
        onSubmit={handleSmsSubmit}
        onClose={closeSmsModal}
      />

      <Footer />
    </div>
  );
}
```

## Styling and CSS

Components use existing CSS classes from `ContactPage.css`:

- `.contact-page` - Main page container
- `.page-title-section` - Header section styling
- `.contact-section` and `.contact-grid` - Grid layout
- `.contact-card` - Individual contact cards
- `.modal-overlay` and `.modal-content` - Modal styling
- `.form-group`, `.form-input`, `.form-textarea` - Form styling
- `.error-message` - Error display styling

## Accessibility Features

- Proper form labels and associations
- Required field indicators
- Error message announcements
- Keyboard navigation support
- Focus management in modals
- Semantic HTML structure

## Responsive Design

- Grid layout adapts to different screen sizes
- Modal content is responsive
- Touch-friendly click targets
- Appropriate input types for mobile devices

## Integration with Existing Components

The contact components integrate seamlessly with:

- **Header**: Main navigation component
- **Footer**: Site footer with links
- **Toast notifications**: Success/error feedback
- **CSS classes**: Existing stylesheet integration
