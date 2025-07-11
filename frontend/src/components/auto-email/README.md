# Auto Email Components

This directory contains reusable UI components for the Auto Email Setup page functionality.

## Components

### EmailConfigForm

Form component for configuring email automation settings including frequency, day of week, and start date.

**Props:**

- `frequency` (string): Current frequency setting
- `onFrequencyChange` (function): Handler for frequency changes
- `dayOfWeek` (number): Current day of week setting
- `onDayOfWeekChange` (function): Handler for day of week changes
- `startDate` (Date): Current start date
- `onStartDateChange` (function): Handler for start date changes

### EmailActionButtons

Button component group for save settings and run now actions.

**Props:**

- `onSave` (function): Handler for save button click
- `onRunNow` (function): Handler for run now button click
- `saving` (boolean): Loading state for save operation
- `loading` (boolean): General loading state
- `status` (string): Status message for save operation
- `runNowStatus` (string): Status message for run now operation

### MonthlyEmailSummary

Display component showing monthly email statistics.

**Props:**

- `monthlyEmailTotal` (number): Total emails sent this month
- `currentMonthName` (string): Name of current month for display

### EmailSettingsPanel

Container component that combines the config form, action buttons, and monthly summary.

**Props:**

- `emailSettings` (object): Settings hook object
- `emailExecution` (object): Execution hook object

### EmailLogsPanel

Container component for displaying email message logs table.

**Props:** None - uses MessageLogTable internally

## Usage

```javascript
import {
  EmailConfigForm,
  EmailActionButtons,
  MonthlyEmailSummary,
  EmailSettingsPanel,
  EmailLogsPanel
} from '../components/auto-email';

// Use in combination with auto-email hooks
const emailSettings = useEmailSettings();
const emailExecution = useEmailExecution();

<EmailSettingsPanel
  emailSettings={emailSettings}
  emailExecution={emailExecution}
/>
<EmailLogsPanel />
```

## Dependencies

- @mui/material
- @mui/x-date-pickers
- MessageLogTable component (shared component)

## File Structure

```
auto-email/
├── EmailConfigForm.js
├── EmailActionButtons.js
├── MonthlyEmailSummary.js
├── EmailSettingsPanel.js
├── EmailLogsPanel.js
├── index.js (barrel exports)
└── README.md
```
