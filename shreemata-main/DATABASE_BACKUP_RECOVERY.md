# Shree Mata — Production Database Backup & Recovery System

This document describes the operational architecture, automated scheduling, off-server replication, retention policies, restore testing, and emergency disaster recovery procedures for the Shree Mata production MongoDB database.

---

## 1. Backup Architecture Overview

```
Production MongoDB Cluster
         │
         ▼
[scripts/backup-database.js]
         │ 1. Process Lock (.backup.lock) & Disk Precheck
         │ 2. mongodump --archive=<name>.partial --gzip
         │ 3. File Verification & SHA-256 Calculation
         │ 4. Atomic Rename (<name>.partial -> <name>.archive.gz)
         │ 5. Independent <name>.archive.gz.sha256 Digest Creation
         ▼
Verified Compressed Archive (.archive.gz + .sha256)
         │
         ├──► Local Storage: backups/daily/
         │         │
         │         ├── (On Sunday)  ──► backups/weekly/ (promoted copy)
         │         └── (On 1st day) ──► backups/monthly/ (promoted copy)
         │
         ├──► Off-Server Storage: Private AWS S3 (Archive + Checksum Object, SSE-S3 AES256)
         │
         ├──► Boundary-Enforced Retention Pruner (Safety-Guarded)
         │
         └──► Dual Logging:
                   ├── MongoDB: BackupRecord collection
                   └── Filesystem: backups/logs/backup-history.jsonl & backup.log
```

### Safety Principles
1. **Atomic Creation**: Never dumps directly into final filename. Dumps to `.partial`, validates exit code, non-zero size, and SHA-256, then atomically renames to `.archive.gz`.
2. **Process Locking**: Enforces a single-process lock (`backups/.backup.lock`) to prevent concurrent manual and scheduled backup collisions.
3. **Disk Space Precheck**: Verifies write permissions and disk space headroom before spawning `mongodump`.
4. **Independent Checksums**: Every archive has an independent adjacent `.sha256` file that is promoted together with the archive and uploaded to S3.
5. **Separation of Concerns**: Backups are completely isolated from HTTP requests and customer transaction flows.
6. **Read-Only Application Impact**: Backup creation performs read-only operations and never modifies customer orders, wallets, commissions, referral trees, or inventory.
7. **No Credential Leakage**: MongoDB URIs and AWS keys are masked in all logs and console streams (`mongodb+srv://***:***@...`).
8. **Zero Web Restoration**: The Admin Dashboard is **read-only status monitoring**. Database restoration is an isolated command-line operations procedure requiring interactive human confirmation.

---

## 2. Directory Structure

All backup artifacts are stored outside web-accessible paths (`public/`, `uploads/`, `static/`):

```
backups/
├── .backup.lock    # Process lock file (PID + timestamp)
├── daily/          # Verified daily snapshots (default 7 days retention)
├── weekly/         # Promoted Sunday snapshots (default 4 weeks retention)
├── monthly/        # Promoted 1st-of-month snapshots (default 6 months retention)
└── logs/           # Persistent JSONL and text history logs
    ├── backup-history.jsonl
    └── backup.log
```

---

## 3. Configuration & Environment Variables

| Variable | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `MONGO_URI` | String | *(Required)* | Production MongoDB connection string |
| `BACKUP_ENABLED` | Boolean | `true` | Enable or disable backup engine |
| `BACKUP_LOCAL_DIR` | String | `./backups` | Root backup folder path |
| `MONGODUMP_PATH` | String | `mongodump` | Path to mongodump binary if custom |
| `MONGORESTORE_PATH` | String | `mongorestore` | Path to mongorestore binary if custom |
| `BACKUP_DAILY_RETENTION_DAYS` | Integer | `7` | Retention limit for daily backups |
| `BACKUP_WEEKLY_RETENTION_WEEKS`| Integer | `4` | Retention limit for weekly backups |
| `BACKUP_MONTHLY_RETENTION_MONTHS`| Integer| `6` | Retention limit for monthly backups |
| `BACKUP_S3_ENABLED` | Boolean | `false` | Enable off-server AWS S3 backup replication |
| `BACKUP_S3_BUCKET` | String | `""` | Private AWS S3 bucket name |
| `BACKUP_S3_REGION` | String | `ap-south-1` | AWS region |
| `RESTORE_TEST_MONGO_URI` | String | *(Required for tests)* | **Isolated** test MongoDB connection string |
| `RESTORE_TEST_DB_NAME` | String | `shreemata_restore_test` | Exact isolated test database name |
| `PRODUCTION_RESTORE_ALLOWED` | Boolean | `false` | Guard flag required for production restores |

---

## 4. Manual Backup Execution

Run a manual backup at any time via npm:

```bash
npm run backup:db
# or with manual flag:
node scripts/backup-database.js --manual
```

---

## 5. Automated Scheduling

### Linux / AWS EC2 (Crontab)
To configure the daily backup at low-traffic hours (02:00 AM server timezone):

1. Verify server timezone:
   ```bash
   timedatectl
   date
   ```
2. Open crontab editor:
   ```bash
   crontab -e
   ```
3. Add the scheduled backup job:
   ```bash
   # Shree Mata Daily Database Backup at 02:00 AM
   0 2 * * * cd /var/www/shreemata && /usr/bin/node scripts/backup-database.js >> /var/www/shreemata/backups/logs/cron-backup.log 2>&1
   ```

### Windows Server (Task Scheduler / PowerShell)
```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "scripts\backup-database.js" -WorkingDirectory "C:\inetpub\shreemata"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "ShreeMataDatabaseBackup" -Description "Daily 02:00 AM Database Backup"
```

---

## 6. Off-Server AWS S3 Replication

When `BACKUP_S3_ENABLED=true`, archives and `.sha256` checksum files are uploaded to Amazon S3.

### Recommended S3 Bucket Policy:
- **Block Public Access**: `ON` (all 4 settings enabled)
- **Object Ownership**: `Bucket Owner Enforced` (ACLs disabled)
- **Default Encryption**: `Server-Side Encryption with Amazon S3 managed keys (SSE-S3 AES256)`
- **Versioning**: `Enabled` (prevents accidental object deletion or tampering)
- **Lifecycle Rule**: Move objects older than 90 days to `Glacier Flexible Retrieval`

---

## 7. Automated Restore Testing

Before relying on any backup archive, verify it in an isolated environment using `RESTORE_TEST_MONGO_URI`:

```bash
# Set isolated test database URI (must contain _test or _restore_test suffix)
export RESTORE_TEST_MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/shreemata_restore_test"
export RESTORE_TEST_DB_NAME="shreemata_restore_test"

# Run automated restore verification
npm run restore:test
```

### Verification Criteria
The test performs deep integrity checks across:
- Collection existence
- Customer accounts and role definitions
- Order histories and item profit snapshots
- `WalletTransaction` balances and refund records
- `CommissionTransaction` direct referral and tree commission calculations
- Referral tree links (`treeParent`, `treeLevel`, `referredBy`)
- VIP Master Card tiers and withdrawal records
- Drops the test database cleanly upon validation in a guaranteed `finally` block.

---

## 8. Database Consistency & Topology

For standalone MongoDB instances, `mongodump` performs collection-by-collection consistency checks. For MongoDB Replica Sets (e.g. MongoDB Atlas or self-hosted 3-node replica sets), `mongodump` provides point-in-time document snapshot consistency. When using replica sets under high write load, point-in-time oplog capturing (`--oplog`) can be configured if low-level oplog access is granted.

---

## 9. Emergency Disaster Recovery Playbook

If a critical database failure, accidental deletion, or corruption occurs in production, follow this step-by-step procedure:

```
[Incident Detected]
       │
       ▼
1. Enable Maintenance Mode & Stop Application Writes
       │
       ▼
2. Take Emergency Snapshot of Current State (if accessible)
       │
       ▼
3. Select Last Known-Good Backup Archive
       │
       ▼
4. Verify SHA-256 Integrity Checksum
       │
       ▼
5. Restore to Isolated Test Database & Audit Financial Records
       │
       ▼
6. Controlled Production Restoration (Triple-Lock + Interactive Confirmation)
       │
       ▼
7. Validate Production Records & Restart Services
       │
       ▼
8. Disable Maintenance Mode & Post-Incident Monitoring
```

### Step 1: Put Application into Maintenance Mode
Stop incoming writes to prevent inconsistent transactions:
```bash
pm2 stop shreemata-app
# or systemctl stop shreemata
```

### Step 2: Capture Damaged State Snapshot (if possible)
```bash
mongodump --uri="$MONGO_URI" --archive="backups/emergency-pre-restore-$(date +%s).archive.gz" --gzip
```

### Step 3: Verify Selected Archive Checksum
```bash
sha256sum -c backups/daily/shreemata-2026-09-12T02-00-00Z.archive.gz.sha256
```

### Step 4: Validate in Test Database
```bash
node scripts/restore-test.js --file="backups/daily/shreemata-2026-09-12T02-00-00Z.archive.gz"
```

### Step 5: Execute Controlled Production Recovery
Production restoration requires an interactive terminal, the triple-lock flags, and typed confirmation:

```bash
export PRODUCTION_RESTORE_ALLOWED=true

node scripts/restore-database.js \
  --file="backups/daily/shreemata-2026-09-12T02-00-00Z.archive.gz" \
  --target="shreemata" \
  --allow-production-restore \
  --confirm-production-overwrite
```
When prompted in the terminal, type:
```
RESTORE SHREEMATA PRODUCTION
```

### Step 6: Verify and Resume Operations
1. Verify customer and order data integrity.
2. Restart application process:
   ```bash
   pm2 restart shreemata-app
   ```
3. Check the Admin Dashboard Backup Health card at `/admin-dashboard.html`.

---

## 10. Dashboard Monitoring & Health States

The Operations Dashboard (`/admin-dashboard.html`) monitors backup vitality in real time:

- **HEALTHY** (Green): Last successful backup created within **26 hours** and off-server copy verified.
- **WARNING** (Amber): Last successful backup between **26 and 48 hours**, or off-server S3 replication failed.
- **CRITICAL** (Red): No verified backup in **> 48 hours** or last backup run experienced fatal failure.
- **NOT CONFIGURED** (Grey): Backup monitoring has not recorded any prior runs.
