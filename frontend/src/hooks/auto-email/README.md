# Auto Email Hooks

This directory contains custom React hooks for managing Auto Email Setup page functionality.

## Hooks

### useEmailSettings

Manages email automation settings including loading, saving, and state management.

**Returns:**

- `frequency` (string): Email frequency setting
- `setFrequency` (function): Update frequency
- `dayOfWeek` (number): Day of week setting
- `setDayOfWeek` (function): Update day of week
- `startDate` (Date): Start date setting
- `setStartDate` (function): Update start date
- `saving` (boolean): Save operation loading state
- `loading` (boolean): Initial loading state
- `status` (string): Status message for operations
- `handleSave` (function): Save settings handler

**Features:**

- Fetches current settings from API on mount
- Handles form validation
- Manages save operation with loading states
- Provides status feedback for operations

### useEmailExecution

Manages manual email execution and monthly statistics.

**Returns:**

- `runNowStatus` (string): Status for manual execution
- `monthlyEmailTotal` (number): Count of emails sent this month
- `currentMonthName` (string): Formatted current month name
- `handleRunNow` (function): Execute emails immediately

**Features:**

- Triggers immediate email sending
- Fetches and tracks monthly email statistics
- Provides execution status feedback
- Auto-refreshes monthly totals after execution

## Usage

```javascript
import { useEmailSettings, useEmailExecution } from "../hooks/auto-email";

function EmailComponent() {
  const emailSettings = useEmailSettings();
  const emailExecution = useEmailExecution();

  return (
    <div>
      <select
        value={emailSettings.frequency}
        onChange={(e) => emailSettings.setFrequency(e.target.value)}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>

      <button
        onClick={emailSettings.handleSave}
        disabled={emailSettings.saving}
      >
        {emailSettings.saving ? "Saving..." : "Save"}
      </button>

      <button onClick={emailExecution.handleRunNow}>Run Now</button>

      <p>Monthly Total: {emailExecution.monthlyEmailTotal}</p>
    </div>
  );
}
```

## Dependencies

- React (useState, useEffect)
- axios for API calls
- API configuration from config/api.js

## API Endpoints Used

- `GET /api/settings/environment/` - Fetch current settings
- `POST /api/settings/environment/` - Save settings
- `POST /api/run-patient-reminders-now/` - Execute emails
- `GET /api/communicator/logs/` - Fetch email logs for statistics

## File Structure

```
auto-email/
├── useEmailSettings.js
├── useEmailExecution.js
├── index.js (barrel exports)
└── README.md
```
