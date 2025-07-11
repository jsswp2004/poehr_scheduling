# Pricing Components

This directory contains modular components for the Pricing Page functionality.

## Components

### `PricingPageHeader.js`

- **Purpose**: Displays the main page title and subtitle
- **Props**: None
- **Features**: Static header content for the pricing page

### `TabNavigation.js`

- **Purpose**: Handles tab navigation between Personal, Clinic, and Group plans
- **Props**:
  - `activeTab`: Currently selected tab
  - `onTabClick`: Function to handle tab selection
- **Features**: Dynamic tab highlighting, click handlers

### `PricingPanel.js`

- **Purpose**: Reusable component for displaying individual pricing plans
- **Props**:
  - `badge`: Plan badge (e.g., "Starter", "Standard")
  - `title`: Plan title
  - `price`: Price amount
  - `period`: Billing period
  - `description`: Plan description
  - `features`: Array of feature strings
  - `buttonText`: CTA button text
  - `enrollLink`: Enrollment/contact link
  - `featured`: Boolean for featured styling
- **Features**: Flexible pricing display, conditional rendering

### `TabContent.js`

- **Purpose**: Container for the two panels shown in each tab
- **Props**:
  - `plans`: Object containing main and features plan data
- **Features**: Renders main pricing panel and features panel

### `PricingSection.js`

- **Purpose**: Main container that renders appropriate content based on active tab
- **Props**:
  - `activeTab`: Current tab selection
  - `personalPlans`, `clinicPlans`, `groupPlans`: Plan data objects
- **Features**: Dynamic content switching, plan data mapping

## Usage

```jsx
import {
  PricingPageHeader,
  TabNavigation,
  PricingSection
} from '../components/pricing';

// Use in PricingPage component
<PricingPageHeader />
<TabNavigation activeTab={activeTab} onTabClick={handleTabClick} />
<PricingSection
  activeTab={activeTab}
  personalPlans={personalPlans}
  clinicPlans={clinicPlans}
  groupPlans={groupPlans}
/>
```

## File Structure

```
components/pricing/
├── PricingPageHeader.js     # Page title and subtitle
├── TabNavigation.js         # Tab navigation component
├── PricingPanel.js          # Individual pricing plan display
├── TabContent.js            # Tab content container
├── PricingSection.js        # Main pricing section
├── index.js                 # Barrel exports
└── README.md               # This file
```
