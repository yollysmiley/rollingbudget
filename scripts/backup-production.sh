#!/usr/bin/env bash
set -euo pipefail
umask 077
# This increment deliberately supports only the disposable fixture.
if [[ "${1:-}" != synthetic || "$#" != 1 ]]; then
  echo "Only synthetic backup mode is enabled" >&2
  exit 1
fi
: "${BACKUP_OUTPUT:?}" "${BACKUP_RECIPIENT:?}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_OUTPUT"
# Do not inherit connection parameters or service definitions.
docker run --rm --network none postgres:17 pg_dump --version | grep -E 'PostgreSQL[)] 17[.]'
container=$(docker run -d --network none -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=backup_fixture postgres:17)
trap 'docker rm -f "$container" >/dev/null; rm -rf "$work"' EXIT
for i in {1..60}; do
  if docker exec "$container" pg_isready -U postgres -d backup_fixture >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -X -U postgres -d backup_fixture -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users (id integer PRIMARY KEY);
CREATE TABLE public.budget_data (user_id integer REFERENCES auth.users, state jsonb);
CREATE TABLE public.budget_ui_years (user_id integer REFERENCES auth.users, year integer, budget_data jsonb);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
INSERT INTO auth.users VALUES (1),(2);
INSERT INTO public.budget_data VALUES (1,'{"synthetic":true}'),(2,'{"synthetic":true}');
INSERT INTO public.budget_ui_years VALUES (1,2026,'{"synthetic":true}');
INSERT INTO supabase_migrations.schema_migrations VALUES ('fixture');
SQL
docker exec "$container" pg_dump -U postgres -d backup_fixture --format=custom > "$work/database.dump"
docker exec "$container" pg_dumpall -U postgres --roles-only --no-role-passwords > "$work/roles.sql"
printf '%s\n' 'Synthetic fixture only; managed Supabase configuration is not covered.' > "$work/coverage.txt"
(cd "$work" && sha256sum database.dump roles.sql coverage.txt > SHA256SUMS)
tar -C "$work" -cf - database.dump roles.sql coverage.txt SHA256SUMS | age -r "$BACKUP_RECIPIENT" -o "$BACKUP_OUTPUT/backup.tar.age"
(cd "$BACKUP_OUTPUT" && sha256sum backup.tar.age > backup.tar.age.sha256)
