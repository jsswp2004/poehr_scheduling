# Archive Log - POEHR Scheduling Codebase Cleanup

**Date**: July 17, 2025
**Purpose**: Comprehensive codebase cleanup to organize unused files while preserving all code

## Archive Structure

### Frontend Archives

- `frontend/pages_backup/` - Original backup versions of pages
- `frontend/pages_refactored/` - Refactored versions of pages not currently in use
- `frontend/components_backup/` - Original backup versions of components
- `frontend/components_refactored/` - Refactored versions of components not currently in use
- `frontend/hooks_backup/` - Backup versions of custom hooks
- `frontend/unused_alternatives/` - Alternative implementations (modular, new versions)

### Backend Archives

- `backend/views_backup/` - Backup versions of Django views

### Root Level Archives

- `root_level/test_files/` - Test scripts and testing utilities
- `root_level/debug_files/` - Debug utilities and inspection scripts
- `root_level/sample_data/` - Sample CSV files and test data

## Files Archived

### Frontend Pages (Backup Versions)

- AboutPage_backup.js
- AnnouncementsPage_original_backup.js
- AppointmentsPage_original_backup.js
- CommunicatorPage_original_backup.js
- DashboardPage_backup.js
- DashboardPage_original_backup.js
- HolidaysPage_original_backup.js
- LandingPage_original_backup.js
- MaintenancePage_original_backup.js
- OrganizationPage_original_backup.js
- PatientDetailPage_original_backup.js
- PatientsPage_original_backup.js
- ProfilePage_backup.js
- RegisterPage_original_backup.js

### Frontend Pages (Refactored Versions)

- AdminPage_refactored.js
- AdminUserSearchPage_refactored.js
- AnnouncementsPage_refactored.js
- AppointmentsPage_refactored.js
- AutoEmailSetUpPage_refactored.js
- AutoSMSSetUpPage_refactored.js
- CommunicatorPage_refactored.js
- ContactPage_refactored.js
- CreateProfilePage_refactored.js
- DashboardPage_refactored.js
- EnrollmentPage_refactored.js
- EnvironmentProfilePage_refactored.js
- HolidaysPage_refactored.js
- LandingPage_refactored.js
- LoginPage_refactored.js
- MaintenancePage_refactored.js
- OrganizationPage_refactored.js
- PatientDetailPage_refactored.js
- PatientsPage_refactored.js
- PricingPage_refactored.js
- ProfilePage_refactored.js
- RegisterPage_refactored.js
- ToastTestPage_refactored.js

### Frontend Components (Backup Versions)

- CalendarView_original_backup.js
- CreateAppointmentForm_original_backup.js
- OrganizationManagement_original_backup.js

### Frontend Components (Refactored Versions)

- CalendarView_refactored.js
- CreateAppointmentForm_refactored.js
- OrganizationManagement_refactored.js

### Frontend Hooks (Backup Versions)

- useChat_original_backup.js
- useProfile_backup.js

### Alternative Implementations

- LandingPage_modular.js
- AboutPage_new.js
- ProfilePage_new.js

### Backend Files

- users/views_backup.py

### Test and Debug Files

- Various test*\*.py, test*_.js, test\__.html files
- simple_test.py
- debug\_\*.py files
- inspect\_\*.js files
- fix_token_storage.js

### Sample Data

- test\_\*.csv files
- quick*test*\*.csv files
- sample\_\*.csv files

## Currently Active Files (Not Archived)

The following files remain active and are imported in App.js or actively used:

- All primary page components (DashboardPage.js, LoginPage.js, etc.)
- All primary components (Navbar.js, CalendarView.js, etc.)
- All utility files and configurations
- Docker and deployment configurations
- Package management files (package.json, requirements.txt)

## Safety Notes

1. **No files were deleted** - All code is preserved in archive folders
2. **Docker setup unaffected** - All active components and configurations remain in place
3. **Imports unchanged** - No modification to import statements was necessary
4. **Rollback possible** - Files can be moved back if needed
5. **Archive within project** - All archived files remain within the project directory structure

## Verification

After archiving, the application should continue to function normally:

- Docker containers build and run correctly
- All pages and components load properly
- No broken imports or missing dependencies
- All features and functionality preserved

## Future Maintenance

- Check archive folders periodically for files that may be safely removed
- Consider permanent deletion only after extended periods without need
- Document any files moved back to active use
- Update this log when making additional archival decisions

---

**Total Files Archived**: 63+ files  
**Archive Location**: `/archive/` directory within project root  
**Cleanup Completed**: July 17, 2025
