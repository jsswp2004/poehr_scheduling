# Pricing Hooks

This directory contains custom React hooks for the Pricing Page functionality.

## Hooks

### `usePricingTabs.js`

- **Purpose**: Manages tab navigation state and URL parameter integration
- **Returns**:
  - `activeTab`: Currently selected tab ('personal', 'clinic', 'group')
  - `handleTabClick`: Function to change active tab
- **Features**:
  - URL parameter support for plan pre-selection
  - Automatic tab switching based on URL changes
  - Default to 'personal' tab

### `usePricingData.js`

- **Purpose**: Provides structured pricing data for all plans
- **Returns**:
  - `personalPlans`: Object with basic and features plan data
  - `clinicPlans`: Object with standard and features plan data
  - `groupPlans`: Object with enterprise and features plan data
- **Features**:
  - Centralized pricing data management
  - Structured feature lists
  - Enrollment links and pricing information

## Usage

```jsx
import { usePricingTabs, usePricingData } from "../hooks/pricing";

const PricingPage = () => {
  // Tab navigation
  const { activeTab, handleTabClick } = usePricingTabs();

  // Pricing data
  const { personalPlans, clinicPlans, groupPlans } = usePricingData();

  // Use in component...
};
```

## Data Structure

### Plan Object Structure

```javascript
{
  badge: 'Starter',           // Plan badge
  title: 'Personal Basic',    // Plan name
  price: '$19.99',           // Price amount
  period: 'per month',       // Billing period
  description: '...',        // Plan description
  features: [...],           // Array of feature strings
  buttonText: 'Get Started', // CTA button text
  enrollLink: '/enroll...'   // Enrollment link
}
```

## File Structure

```
hooks/pricing/
├── usePricingTabs.js       # Tab navigation logic
├── usePricingData.js       # Pricing data management
├── index.js                # Barrel exports
└── README.md              # This file
```
