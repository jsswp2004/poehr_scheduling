# Landing Page Components

This directory contains modular React components for building the POWER healthcare scheduling landing page.

## Components

### `HeroSection`

- Main value proposition headline
- Hero image with dashboard preview
- Primary call-to-action button
- Responsive design for all devices

### `ProductFeaturesSection`

- POWER Scheduling feature showcase
- POWER together collaboration features
- Feature bullet points and descriptions
- Interactive "Get Started" buttons

### `CrossPlatformSection`

- Multi-device availability information
- Platform compatibility details
- Cross-platform benefits
- "Try POWER" call-to-action

### `DataSecuritySection`

- HIPAA compliance and privacy features
- Data ownership and security benefits
- Security icons and visuals
- "Read more" action button

### `PricingSection`

- Three-tier pricing plans (Personal, Clinic, Group)
- Feature comparisons
- Plan selection buttons
- Contact sales for enterprise

### `FinalCTASection`

- Final call-to-action section
- Platform download links
- Contact sales option
- App store icons

## Usage

```javascript
import {
  HeroSection,
  ProductFeaturesSection,
  CrossPlatformSection,
  DataSecuritySection,
  PricingSection,
  FinalCTASection,
} from "./components/landing-page";

const LandingPage = () => (
  <div>
    <HeroSection onTrialClick={handlePricingClick} />
    <ProductFeaturesSection onGetStartedClick={handlePricingClick} />
    {/* ... other sections */}
  </div>
);
```

## Features

- **Modular Design**: Each section is a separate, reusable component
- **Consistent Styling**: Uses existing CSS classes from the original design
- **Interactive Elements**: Proper click handlers and navigation
- **Responsive Layout**: Works on mobile and desktop
- **Accessibility**: Proper semantic HTML and alt tags
