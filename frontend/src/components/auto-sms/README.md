# Auto SMS Components

This directory contains modular components for the Auto SMS Setup Page functionality.

## Components

### `SMSConfigForm.js`

- **Purpose**: Form for configuring SMS automation settings
- **Props**:
  - `frequency`: SMS sending frequency ('daily', 'weekly', 'bi-weekly', 'monthly')
  - `onFrequencyChange`: Frequency change handler
  - `dayOfWeek`: Day of week for sending (0-6)
  - `onDayOfWeekChange`: Day change handler
  - `startDate`: Start date for automation
  - `onStartDateChange`: Date change handler
- **Features**: Date picker, frequency selector, day of week selector with validation

### `SMSActionButtons.js`

- **Purpose**: Save and run now buttons with status feedback
- **Props**:
  - `onSave`: Save settings function
  - `onRunNow`: Run now function
  - `saving`: Saving state
  - `loading`: Loading state
  - `status`: Status message for save operation
  - `runNowStatus`: Status message for run now operation
- **Features**: Loading spinners, success/error alerts, disabled states

### `MonthlySMSSummary.js`

- **Purpose**: Displays monthly SMS total summary
- **Props**:
  - `monthlySMSTotal`: Number of SMS sent this month
  - `currentMonthName`: Current month name for display
- **Features**: Styled summary box with total count

### `SMSSettingsPanel.js`

- **Purpose**: Left panel container orchestrating all SMS configuration components
- **Props**: Combines props from all sub-components
- **Features**: Layout container, component composition

### `SMSLogsPanel.js`

- **Purpose**: Right panel container for SMS message logs
- **Props**: None (uses MessageLogTable internally)
- **Features**: Integration with existing MessageLogTable component

## Usage

```jsx
import {
  SMSSettingsPanel,
  SMSLogsPanel
} from '../components/auto-sms';

// Use in AutoSMSSetUpPage component
<SMSSettingsPanel
  frequency={frequency}
  onFrequencyChange={setFrequency}
  // ... other props
/>
<SMSLogsPanel />
```

## File Structure

```
components/auto-sms/
├── SMSConfigForm.js         # Settings form with date/frequency selectors
├── SMSActionButtons.js      # Save and run buttons with status
├── MonthlySMSSummary.js     # Monthly total display
├── SMSSettingsPanel.js      # Left panel container
├── SMSLogsPanel.js          # Right panel logs
├── index.js                 # Barrel exports
└── README.md               # This file
```
