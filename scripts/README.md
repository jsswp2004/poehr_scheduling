# 🔧 Debug & Development Scripts

## 📁 Directory Contents

### `/debug/` - Debugging Scripts

Scripts for diagnosing and fixing specific issues during development.

**File Categories:**

- `check_*.py` - Database and user status checking
- `debug_*.py` - Issue-specific debugging tools
- `decode_*.py` - Token and authentication debugging
- `fix_*.py` - Quick fixes for specific problems

### `/setup/` - Setup & Configuration Scripts

Scripts for initial setup, user creation, and system configuration.

**File Categories:**

- `create_*.py` - User and system setup scripts
- `get_*.py` - Data retrieval utilities
- `monitor_*.py` - System monitoring tools

### `/utilities/` - General Utilities

Reusable utility scripts for common tasks.

**File Categories:**

- `quick_*.py` - Quick testing utilities
- `reset_*.py` - Password reset tools
- `simulate_*.py` - System simulation tools
- `temp_*.py` - Temporary testing scripts

## ⚠️ Important Notes

1. **These scripts are for development only** - Do not run in production
2. **Verify credentials** before running scripts that modify data
3. **Check endpoints** - Some scripts may reference old API endpoints
4. **Review before use** - Many scripts contain hardcoded test data

## 🧹 Cleanup Status

✅ **Organized from root directory** - All debug/utility scripts moved from project root
✅ **Categorized by purpose** - Grouped into debug, setup, and utilities
✅ **Preserved functionality** - All working scripts maintained
