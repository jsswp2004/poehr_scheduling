# Announcements Components

This directory contains modular React components for the announcements management system.

## Components

### AnnouncementTabs

- **Purpose**: Renders the tab navigation for different announcement messages
- **Props**:
  - `activeTab`: Currently selected tab index
  - `onTabChange`: Function to handle tab changes
- **Features**: Styled tabs with Material-UI customization

### AnnouncementEditor

- **Purpose**: Form for editing announcement content
- **Props**:
  - `announcement`: Current announcement object
  - `isReadOnly`: Boolean to control edit permissions
  - `onInputChange`: Function to handle input changes
  - `onAttachmentChange`: Function to handle file attachments
- **Features**:
  - Header and message text fields
  - File attachment support
  - Read-only mode styling

### AnnouncementPreview

- **Purpose**: Live preview of announcement content
- **Props**:
  - `announcement`: Current announcement object
- **Features**:
  - HTML rendering of content
  - Attachment display
  - Empty state handling

### HTMLGuideSection

- **Purpose**: Container for HTML formatting guides
- **Features**: Two-column layout with text formatting and lists/colors guides

### TextFormattingGuide

- **Purpose**: Guide for text formatting HTML tags
- **Features**: Examples of bold, italic, underline, and strong tags

### ListsColorsGuide

- **Purpose**: Guide for lists and color HTML tags
- **Features**: Examples of lists, colors, and practical usage

### AnnouncementLayout

- **Purpose**: Main layout component organizing all sections
- **Props**:
  - `announcement`: Current announcement object
  - `isReadOnly`: Boolean to control edit permissions
  - `onInputChange`: Function to handle input changes
  - `onAttachmentChange`: Function to handle file attachments
- **Features**: Three-column responsive grid layout

## File Reduction

- **Original**: AnnouncementsPage.js (696 lines)
- **Refactored**: AnnouncementsPage_refactored.js (~35 lines)
- **Reduction**: ~95% smaller main file

## Usage

```javascript
import {
  AnnouncementTabs,
  AnnouncementLayout,
} from "../components/announcements";
```

All components follow Material-UI design patterns and are fully responsive.
