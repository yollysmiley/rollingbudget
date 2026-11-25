#!/usr/bin/env bash
set -euo pipefail
umask 077
# No production access outside the protected manual workflow.
[[ "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${BACKUP_CONFIRMATION:-}" == BACKUP ]] || exit 1
: "${PRODUCTION_DB_URL:?}" "${BACKUP_RECIPIENT:?}" "${BACKUP_OUTPUT:?}"
# Require the exact production tenant and session pooler port; never print the URL.
python3 - <<'PY'
import os, urllib.parse
u=urllib.parse.urlsplit(os.environ['PRODUCTION_DB_URL'])
if not (u.scheme in ('postgres','postgresql') and u.username=='postgres.awalptqpsjflrahkrjzk' and u.hostname and u.hostname.endswith('.pooler.supabase.com') and u.port==5432 and u.path=='/postgres' and u.password and urllib.parse.parse_qs(u.query)=={'sslmode':['require']}):
    raise SystemExit('Unexpected production connection configuration')
PY
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_OUTPUT"
# Suppress tool output: errors may contain connection details or row data.
dump() {
  if ! supabase db dump --db-url "$PRODUCTION_DB_URL" "$@" >"$work/tool.log" 2>&1; then
    echo "Database export failed; no artifact published" >&2
    exit 1
  fi
}
dump -f "$work/roles.sql" --role-only
dump -f "$work/schema.sql"
dump -f "$work/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
dump -f "$work/history_schema.sql" --schema supabase_migrations
dump -f "$work/history_data.sql" --use-copy --data-only --schema supabase_migrations
files=(roles.sql schema.sql data.sql history_schema.sql history_data.sql)
for f in "${files[@]}"; do test -s "$work/$f"; done
printf '%s\n' 'Logical export; separate snapshots require a verified write freeze for cutover consistency. Auth configuration, storage objects and managed schema customizations require separate verification.' > "$work/coverage.txt"
files+=(coverage.txt)
(cd "$work" && sha256sum "${files[@]}" > SHA256SUMS)
tar -C "$work" -cf - "${files[@]}" SHA256SUMS | age -r "$BACKUP_RECIPIENT" -o "$BACKUP_OUTPUT/backup.tar.age"
(cd "$BACKUP_OUTPUT" && sha256sum backup.tar.age > backup.tar.age.sha256)
