# Enrollment Components

This directory contains reusable React components for the multi-step enrollment process.

## Available Components

### `AccountDetailsStep`

Form component for collecting user account and organization details (Step 1).

**Props:**

- `formData`: Object containing form field values
- `onChange`: Function to handle form input changes

**Fields:**

- Organization Name (required)
- Organization Type (required) - Select: Personal, Clinic, Group
- First Name (required)
- Last Name (required)
- Username (required)
- Email (required)
- Phone Number (optional)
- Password (required)

### `PlanSelectionStep`

Component for subscription plan selection (Step 2).

**Props:**

- `selectedTier`: Currently selected subscription tier
- `onTierSelect`: Function to handle tier selection
- `isSubmitting`: Boolean to disable during submission

**Features:**

- Uses existing `SubscriptionTierSelector` component
- Displays available subscription tiers
- Handles tier selection with visual feedback

### `PaymentInfoStep`

Component for payment method collection using Stripe (Step 3).

**Props:**

- `onPaymentMethodReady`: Function called when payment method is ready
- `loading`: Boolean indicating loading state
- `error`: Error message to display

**Features:**

- Uses existing `PaymentMethodForm` component
- Integrates with Stripe for secure payment collection
- Forwards ref for payment method creation
- Handles payment validation and error display

### `ConfirmationStep`

Review component displaying all entered information (Step 4).

**Props:**

- `formData`: Object containing all form data to display

**Sections:**

- Organization information (name and type)
- Account information (name and email)
- Selected plan with trial information

### `EnrollmentStepper`

Progress indicator and status display component.

**Props:**

- `steps`: Array of step labels
- `activeStep`: Current active step index
- `status`: Status object with type and message

**Features:**

- Material-UI Stepper component
- Progress visualization across steps
- Status alerts for success/error messages
- Consistent styling and spacing

### `EnrollmentNavigation`

Navigation controls for multi-step flow.

**Props:**

- `currentStep`: Current step index
- `totalSteps`: Total number of steps
- `canProceed`: Boolean indicating if user can proceed
- `isSubmitting`: Boolean indicating submission in progress
- `status`: Status object for button styling
- `onBack`: Function to go to previous step
- `onNext`: Function to go to next step
- `onSubmit`: Function to submit final form

**Features:**

- Back/Next button logic
- Submit button for final step
- Proper disabled states
- Dynamic button text based on state
- Success state styling

### `StepContent`

Container component that renders appropriate step content.

**Props:**

- `currentStep`: Current step index
- `formData`: Form data object
- `onChange`: Form change handler
- `onTierSelect`: Tier selection handler
- `isSubmitting`: Submission state
- `onPaymentMethodReady`: Payment method ready handler
- `status`: Status object

**Features:**

- Renders correct step component based on current step
- Forwards refs for payment form
- Passes appropriate props to each step component

## Component Structure

```
components/enrollment/
├── AccountDetailsStep.js       # Step 1: Account and organization details
├── PlanSelectionStep.js        # Step 2: Subscription plan selection
├── PaymentInfoStep.js          # Step 3: Payment method collection
├── ConfirmationStep.js         # Step 4: Review information
├── EnrollmentStepper.js        # Progress stepper and status
├── EnrollmentNavigation.js     # Navigation buttons
├── StepContent.js              # Step content router
├── index.js                    # Barrel export file
└── README.md                   # This documentation
```

## Usage Example

```javascript
import {
  EnrollmentStepper,
  EnrollmentNavigation,
  StepContent,
} from "../components/enrollment";

function EnrollmentPage() {
  return (
    <Paper>
      <EnrollmentStepper
        steps={steps}
        activeStep={currentStep}
        status={status}
      />

      <Box sx={{ mb: 4 }}>
        <StepContent
          currentStep={currentStep}
          formData={formData}
          onChange={handleChange}
          onTierSelect={handleTierSelect}
          // ... other props
        />
      </Box>

      <EnrollmentNavigation
        currentStep={currentStep}
        totalSteps={steps.length}
        canProceed={canProceed()}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
        // ... other props
      />
    </Paper>
  );
}
```

## Integration with Existing Components

The enrollment components integrate with existing application components:

- **`SubscriptionTierSelector`**: Used in `PlanSelectionStep`
- **`PaymentMethodForm`**: Used in `PaymentInfoStep`
- **`Header` and `Footer`**: Used in main enrollment page layout
- **`StripeProvider`**: Wraps entire enrollment flow

## Styling and Accessibility

- Uses Material-UI components for consistent styling
- Follows application design system
- Proper form validation and error states
- Accessible form controls and navigation
- Responsive design for different screen sizes
- Loading states and disabled controls during submission
