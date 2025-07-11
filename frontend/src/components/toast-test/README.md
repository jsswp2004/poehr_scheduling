# Toast Test Components

This directory contains UI components for the ToastTestPage functionality.

## Components

### ToastTestHeader

Header component with title and description for the toast test page.

**Props:** None

**Features:**

- Displays page title
- Shows explanatory text about toast testing

### ToastTestSection

Individual section component for testing different toast types.

**Props:**

- `title` (string): Section title
- `tests` (array): Array of test button configurations

**Features:**

- Renders test buttons based on configuration
- Supports different button variants and colors
- Handles click events for toast testing

### ToastTestContainer

Main container component that renders the complete toast test page layout.

**Props:**

- `toastTestSections` (array): Configured test sections from hook

**Features:**

- Renders header and test sections
- Uses Material-UI Grid for responsive layout
- Handles multiple test sections dynamically

## Usage

```javascript
import { ToastTestContainer } from "../components/toast-test";
import { useToastTest } from "../hooks/toast-test";

function ToastTestPage() {
  const { toastTestSections } = useToastTest();

  return <ToastTestContainer toastTestSections={toastTestSections} />;
}
```

## Dependencies

- @mui/material
- React

## File Structure

```
toast-test/
├── ToastTestHeader.js
├── ToastTestSection.js
├── ToastTestContainer.js
├── index.js (barrel exports)
└── README.md
```
