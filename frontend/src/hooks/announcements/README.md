# Announcements Hooks

This directory contains custom React hooks for managing announcements functionality.

## Hooks

### useAnnouncementTabs

- **Purpose**: Manages tab state and navigation for announcements
- **Returns**:
  - `activeTab`: Currently selected tab index
  - `setActiveTab`: Function to set active tab
  - `editingTab`: Currently editing tab index
  - `setEditingTab`: Function to set editing tab
  - `handleTabChange`: Function to handle tab changes
  - `isReadOnly`: Boolean indicating if current tab is read-only
- **Features**:
  - Tracks active and editing tabs
  - Provides read-only mode logic

### useAnnouncementForm

- **Purpose**: Manages form state and announcement data
- **Parameters**:
  - `activeTab`: Current active tab index
- **Returns**:
  - `announcements`: All announcements array
  - `currentAnnouncement`: Currently selected announcement object
  - `handleInputChange`: Function to handle text input changes
  - `handleAttachmentChange`: Function to handle file attachments
  - `updateAnnouncement`: Function to update announcement data
- **Features**:
  - Integrates with AnnouncementContext
  - Handles file uploads
  - Provides current announcement data

## Usage

```javascript
import {
  useAnnouncementTabs,
  useAnnouncementForm,
} from "../hooks/announcements";

// In component
const { activeTab, handleTabChange, isReadOnly } = useAnnouncementTabs();
const { currentAnnouncement, handleInputChange, handleAttachmentChange } =
  useAnnouncementForm(activeTab);
```

## Dependencies

- Uses `AnnouncementContext` for data management
- Requires React hooks (useState)
