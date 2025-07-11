# Enrollment Hooks

This directory contains custom React hooks for managing enrollment functionality.

## Available Hooks

### `useEnrollmentForm`

Manages enrollment form data and URL parameter handling.

**Returns:**

- `formData`: Object containing all form fields (username, email, password, etc.)
- `setFormData`: Function to update form data
- `handleChange`: Function to handle form input changes
- `handleTierSelect`: Function to handle subscription tier selection
- `urlPlan`: Plan parameter from URL ('personal', 'clinic', 'group')
- `urlTier`: Tier parameter from URL ('basic', 'premium', 'enterprise')

**Features:**

- Initializes form data from URL parameters
- Maps URL plan/tier parameters to form values
- Provides default values based on plan type
- Handles all form field updates

### `useEnrollmentStepper`

Manages multi-step enrollment flow navigation and validation.

**Parameters:**

- `formData`: Current form data object
- `paymentMethodReady`: Boolean indicating if payment method is ready

**Returns:**

- `steps`: Array of step labels
- `currentStep`: Current step index (0-based)
- `setCurrentStep`: Function to directly set current step
- `handleNext`: Function to proceed to next step
- `handleBack`: Function to go back to previous step
- `canProceed`: Function that returns boolean for current step validation

**Step Validation Rules:**

- Step 0 (Account Details): Requires all required fields
- Step 1 (Plan Selection): Requires subscription tier selection
- Step 2 (Payment Info): Requires payment method readiness
- Step 3 (Confirmation): Always allows proceeding

### `useEnrollmentSubmission`

Handles enrollment submission, API interaction, and error handling.

**Returns:**

- `status`: Object with `type` ('success', 'error', '') and `message`
- `isSubmitting`: Boolean indicating if submission is in progress
- `setStatus`: Function to update status
- `handleSubmit`: Function to submit enrollment with form data and payment ref

**Features:**

- Creates payment method via Stripe
- Submits registration data to backend API
- Handles success/error responses with detailed messaging
- Automatically redirects to login on success
- Extracts and formats API error messages

### `usePaymentMethod`

Manages payment method state for Stripe integration.

**Returns:**

- `paymentMethodReady`: Boolean indicating if payment method is ready
- `setPaymentMethodReady`: Function to update payment method readiness

## Usage Example

```javascript
import {
  useEnrollmentForm,
  useEnrollmentStepper,
  useEnrollmentSubmission,
  usePaymentMethod,
} from "../hooks/enrollment";

function EnrollmentPage() {
  const { formData, handleChange, handleTierSelect } = useEnrollmentForm();
  const { paymentMethodReady, setPaymentMethodReady } = usePaymentMethod();
  const { steps, currentStep, handleNext, handleBack, canProceed } =
    useEnrollmentStepper(formData, paymentMethodReady);
  const { status, isSubmitting, handleSubmit } = useEnrollmentSubmission();

  // ... component logic
}
```

## Hook Structure

```
hooks/enrollment/
├── useEnrollmentForm.js        # Form data and URL parameter handling
├── useEnrollmentStepper.js     # Multi-step navigation and validation
├── useEnrollmentSubmission.js  # API submission and error handling
├── usePaymentMethod.js         # Payment method state management
├── index.js                    # Barrel export file
└── README.md                   # This documentation
```

## URL Parameter Mapping

The `useEnrollmentForm` hook automatically maps URL parameters to form defaults:

**Plan Parameter:**

- `personal` → organization_type: 'personal', default tier: 'basic'
- `clinic` → organization_type: 'clinic', default tier: 'premium'
- `group` → organization_type: 'group', default tier: 'enterprise'

**Tier Parameter:**

- `basic` → subscription_tier: 'basic'
- `premium` → subscription_tier: 'premium'
- `enterprise` → subscription_tier: 'enterprise'

**Example URLs:**

- `/enrollment?plan=clinic&tier=premium`
- `/enrollment?plan=personal` (defaults to basic tier)
- `/enrollment` (defaults to personal/premium)
