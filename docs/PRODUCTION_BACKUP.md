## Authorized production backup

Manual main-only workflow, protected production-backup environment, BACKUP confirmation, BACKUP_RECIPIENT public key and PRODUCTION_DB_URL secret. Do not configure credentials or dispatch until separately approved. Use session pooler port 5432 with sslmode=require and exact production tenant. Seven-day encrypted artifact retention; download to owner-controlled storage. Private key stays outside GitHub. Supabase CLI logical roles/schema/data and migration history exports are separate snapshots; enforce write freeze for consistent cutover. Auth settings, storage objects, custom managed schema changes and actual isolated recovery remain unverified. Never restore to production or staging. See https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore .

Synthetic runtime CI uses a stub Supabase CLI and real Age encryption; it does not connect to a database or establish actual CLI compatibility. Confirm repository visibility and artifact access before authorizing real exports. Public repositories may expose encrypted artifacts to repository readers. Prefer owner-controlled private storage. Verify owner key recovery independently. Output is published only after successful encryption and checksum creation.

Added a pinned Supabase CLI 2.79.0 export and encrypted restoration rehearsal against disposable PostgreSQL 17 fixtures with simplified Auth schema, migration history and two-owner RLS checks. CI evidence pending; managed Supabase compatibility and real recovery remain unverified.

## Synchronization with merged PR #3

Inherit main at afe49dca9447ec5a192bccf19a5f561686493f5e (PR #3 merged; post-merge CI passed by owner report). Preserve legacy migration and all regression files unchanged, and retain all four CI jobs. Prior backup CI #95 passed on 1028dc64936bc2b7b8aa17579cdcda5858cfe1c6; fresh combined CI required. The CLI rehearsal uses simplified fixtures, not the exact hardened legacy schema or managed Auth. Actual private storage, owner key recovery, consistent recovery point and isolated managed recovery remain outstanding. No production export, migration or merge authorized.
