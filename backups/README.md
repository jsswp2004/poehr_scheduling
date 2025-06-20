# Database Backups

This directory contains SQL backup files of your PostgreSQL database.

## Files in this directory:
- `poehr_db_backup_YYYYMMDD_HHMMSS.sql` - Database backups with timestamps

## Usage:
- These backups can be committed to Git and shared across PCs
- Use `restore_db.bat` (Windows) or `restore_db.sh` (Linux/Mac) to restore from backup
- Backups are automatically created with timestamps to avoid conflicts
