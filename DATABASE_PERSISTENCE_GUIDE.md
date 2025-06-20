# Database Persistence Guide

## Current Setup: Method 2 (Database Export/Import)

Your database data is stored in `./data/postgres/` (bind mount) which persists locally, but for sharing across PCs, we use SQL backups.

## 🔄 To Move Your Database to Another PC:

### Step 1: Create a Backup (Current PC)
```bash
# Run this on your current PC
./backup_db.sh
```
This creates a timestamped SQL file in `./backups/` folder.

### Step 2: Copy Project to New PC
1. Copy/clone your entire project folder to the new PC
2. Make sure Docker and Docker Compose are installed on the new PC

### Step 3: Restore Database (New PC)
```bash
# On the new PC, start the containers first
docker-compose up -d

# Wait for containers to be ready, then restore
./restore_db.sh backups/poehr_db_backup_YYYYMMDD_HHMMSS.sql
```

## 📂 What Gets Copied:

### ✅ Included in Git (Always Synced):
- All your code
- Configuration files  
- Database backup scripts
- SQL backup files (in `backups/` folder)

### ❌ Excluded from Git (Local Only):
- `data/postgres/` - Live database files
- `data/redis/` - Redis cache data
- `data/pgadmin/` - pgAdmin settings
- `.env` - Environment secrets

## 🗂️ Project Structure:
```
poehr_scheduling/
├── data/                 # ❌ Local database files (gitignored)
│   ├── postgres/        
│   ├── redis/           
│   └── pgladmin/        
├── backups/             # ✅ SQL backups (committed to git)
│   └── poehr_db_backup_*.sql
├── backup_db.sh         # ✅ Backup script
├── restore_db.sh        # ✅ Restore script
└── ...rest of project
```

## 🎯 Database Access:

### PostgreSQL Database:
- **Host**: localhost:5432 (or `db` from containers)
- **Database**: poehr_db  
- **Username**: jsswp2004
- **Password**: krat25Miko!

### pgAdmin GUI:
- **URL**: http://localhost:5050
- **Email**: admin@example.com
- **Password**: admin123

## 💡 Tips:

1. **Regular Backups**: Run `./backup_db.sh` before important changes
2. **Version Control**: Backup files are included in Git for easy sharing
3. **Clean Slate**: The `data/` folders will be recreated automatically when you run `docker-compose up -d`
4. **User Account**: Your `jsswp2004` system admin account will be restored with the database

## 🚀 Quick Start on New PC:
```bash
git clone [your-repo]
cd poehr_scheduling
docker-compose up -d                    # Start containers
./restore_db.sh backups/[latest-backup] # Restore data
```

That's it! Your entire application with all data will be running on the new PC.
