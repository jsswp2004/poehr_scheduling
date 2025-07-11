# Toast Test Hooks

This directory contains custom React hooks for the ToastTestPage functionality.

## Hooks

### useToastTest

Manages toast testing functionality including different toast types and configurations.

**Returns:**

- **Methods:**

  - `showRegularToast` (function): Show regular success toast
  - `showRegularErrorToast` (function): Show regular error toast
  - `showUtilToast` (function): Show utility success toast
  - `showUtilErrorToast` (function): Show utility error toast

- **Configuration:**
  - `toastTestSections` (array): Configured test sections with titles and test buttons

**Features:**

- Provides methods for testing different toast APIs
- Includes both regular toast and utility toast testing
- Configures test sections with button properties
- Supports success and error toast variants

## Usage

```javascript
import { useToastTest } from "../hooks/toast-test";

function ToastTestPage() {
  const { toastTestSections, showRegularToast } = useToastTest();

  return (
    <div>
      <button onClick={showRegularToast}>Test Regular Toast</button>
      {/* Or use configured sections */}
      <ToastTestContainer toastTestSections={toastTestSections} />
    </div>
  );
}
```

## Dependencies

- SimpleToast component
- toastUtils utility

## File Structure

```
toast-test/
├── useToastTest.js
├── index.js (barrel exports)
└── README.md
```
