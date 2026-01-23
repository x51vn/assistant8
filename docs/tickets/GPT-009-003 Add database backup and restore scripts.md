# GPT-009-003 Add database backup/restore scripts

## Project Context (MUST READ)
No automated backup strategy. Need scripts for regular backups and disaster recovery.

## Parent Ticket
GPT-009 (Supabase SQL schema + RLS pack)

## Priority
P1 (Must-have for production)

## Timebox
1 hour

## Goal
Create backup/restore scripts for database with scheduling recommendations.

## Inputs
- Supabase CLI documentation
- PostgreSQL pg_dump/pg_restore
- Supabase Dashboard backup features

## Requirements
1. Backup script (data + schema)
2. Restore script
3. Scheduling recommendations
4. Backup rotation policy
5. Test restore procedure

## Recommended Implementation

**File**: `scripts/backup-database.sh`

```bash
#!/bin/bash
# ============================================
# Database Backup Script
# ============================================

set -e

# Configuration
PROJECT_REF="${SUPABASE_PROJECT_REF:-your-project-ref}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "============================================"
echo "Starting database backup..."
echo "Project: $PROJECT_REF"
echo "Timestamp: $TIMESTAMP"
echo "============================================"

# Option 1: Via Supabase CLI
if command -v supabase &> /dev/null; then
  echo "Using Supabase CLI..."
  supabase db dump -f "$BACKUP_FILE" --project-ref "$PROJECT_REF"
  
# Option 2: Via pg_dump (requires connection string)
elif command -v pg_dump &> /dev/null; then
  echo "Using pg_dump..."
  SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://...}"
  pg_dump "$SUPABASE_DB_URL" > "$BACKUP_FILE"
  
else
  echo "Error: Neither supabase CLI nor pg_dump found"
  exit 1
fi

# Compress backup
gzip "$BACKUP_FILE"
echo "Backup compressed: ${BACKUP_FILE}.gz"

# Calculate size
BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "Backup size: $BACKUP_SIZE"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete
echo "Old backups cleaned up (>7 days)"

echo "============================================"
echo "Backup completed successfully!"
echo "File: ${BACKUP_FILE}.gz"
echo "============================================"
```

**File**: `scripts/restore-database.sh`

```bash
#!/bin/bash
# ============================================
# Database Restore Script
# ============================================

set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore-database.sh <backup_file.sql.gz>"
  echo "Example: ./restore-database.sh backups/backup_20260123_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
PROJECT_REF="${SUPABASE_PROJECT_REF:-your-project-ref}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "============================================"
echo "WARNING: This will REPLACE all data!"
echo "Backup file: $BACKUP_FILE"
echo "Project: $PROJECT_REF"
echo "============================================"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Decompressing backup..."
  SQL_FILE="${BACKUP_FILE%.gz}"
  gunzip -c "$BACKUP_FILE" > "$SQL_FILE"
else
  SQL_FILE="$BACKUP_FILE"
fi

# Restore
echo "Restoring database..."
if command -v supabase &> /dev/null; then
  supabase db push --file "$SQL_FILE" --project-ref "$PROJECT_REF"
elif command -v psql &> /dev/null; then
  SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://...}"
  psql "$SUPABASE_DB_URL" < "$SQL_FILE"
else
  echo "Error: Neither supabase CLI nor psql found"
  exit 1
fi

echo "============================================"
echo "Restore completed successfully!"
echo "============================================"
```

**Cron Schedule** (Linux/Mac):

```bash
# Add to crontab: crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/scripts/backup-database.sh >> /path/to/logs/backup.log 2>&1

# Weekly full backup (Sundays at 3 AM)
0 3 * * 0 /path/to/scripts/backup-database.sh >> /path/to/logs/backup-weekly.log 2>&1
```

**Windows Task Scheduler** (PowerShell):

```powershell
# Create scheduled task for daily backup
$action = New-ScheduledTaskAction -Execute "bash" -Argument "scripts/backup-database.sh"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "SupabaseBackup" -Description "Daily database backup"
```

**Backup Rotation Policy**:

```bash
# scripts/cleanup-backups.sh
#!/bin/bash

BACKUP_DIR="./backups"

# Keep last 7 daily backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete

# Keep last 4 weekly backups (older than 28 days)
find "$BACKUP_DIR" -name "backup_weekly_*.sql.gz" -mtime +28 -delete

# Keep last 12 monthly backups (older than 365 days)
find "$BACKUP_DIR" -name "backup_monthly_*.sql.gz" -mtime +365 -delete

echo "Backup cleanup completed"
```

**Test Restore Procedure**:

```bash
# 1. Create test backup
./scripts/backup-database.sh

# 2. Note current data count
psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM public.prompts;"

# 3. Delete some data (careful!)
psql $SUPABASE_DB_URL -c "DELETE FROM public.prompts WHERE id = 'some-id';"

# 4. Restore from backup
./scripts/restore-database.sh backups/backup_XXXXXX.sql.gz

# 5. Verify data restored
psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM public.prompts;"
```

## Acceptance Criteria
- Backup script runs successfully
- Restore script works correctly
- Backups are compressed
- Old backups auto-deleted (7 days)
- Cron/Task Scheduler configured
- Test restore successful

## DoD
- Both scripts created and tested
- Scheduled task configured
- Backup rotation working
- Documentation updated
- Test restore procedure documented

## Dependencies
- GPT-009 (schema must exist)
- Supabase CLI installed OR pg_dump/psql available

## Risks
Medium - restore must be tested thoroughly before production

## Notes
- Supabase Dashboard has built-in backups (but manual restore)
- This provides automated local backups
- Consider cloud backup storage (S3, Google Drive)
- Test restore on staging before production
- Backup before any major migration
