#!/usr/bin/env bash
set -euo pipefail
umask 077
work=$(mktemp -d)
container=
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
age-keygen -o "$work/key" 2>/dev/null
age-keygen -o "$work/wrong" 2>/dev/null
export BACKUP_RECIPIENT=$(age-keygen -y "$work/key")
export BACKUP_OUTPUT="${BACKUP_OUTPUT:-$work/output}"
bash scripts/backup-production.sh synthetic
(cd "$BACKUP_OUTPUT" && sha256sum -c backup.tar.age.sha256)
if age -d -i "$work/wrong" "$BACKUP_OUTPUT/backup.tar.age" > /dev/null 2>&1; then
  echo "Wrong key accepted" >&2; exit 1
fi
mkdir "$work/corrupt"
cp "$BACKUP_OUTPUT/backup.tar.age.sha256" "$work/corrupt/"
head -c -1 "$BACKUP_OUTPUT/backup.tar.age" > "$work/corrupt/backup.tar.age"
if (cd "$work/corrupt" && sha256sum -c backup.tar.age.sha256 >/dev/null 2>&1); then
  echo "Corruption checksum accepted" >&2; exit 1
fi
if age -d -i "$work/key" "$work/corrupt/backup.tar.age" >/dev/null 2>&1; then
  echo "Truncated ciphertext accepted" >&2; exit 1
fi
mkdir "$work/restored"
age -d -i "$work/key" "$BACKUP_OUTPUT/backup.tar.age" | tar -xf - -C "$work/restored"
(cd "$work/restored" && sha256sum -c SHA256SUMS)
container=$(docker run -d --network none -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=backup_restored postgres:17)
for i in {1..60}; do
  if docker exec "$container" pg_isready -U postgres -d backup_restored >/dev/null 2>&1; then break; fi
  sleep 1
done
# The bootstrap postgres role already exists. Restore the fixture role and its attributes.
grep -E '^(CREATE ROLE backup_owner;|ALTER ROLE backup_owner )' "$work/restored/roles.sql" > "$work/fixture-role.sql"
docker exec -i "$container" psql -X -U postgres -d backup_restored -v ON_ERROR_STOP=1 < "$work/fixture-role.sql"
docker exec -i "$container" pg_restore -U postgres -d backup_restored --exit-on-error --single-transaction < "$work/restored/database.dump"
docker exec -i "$container" psql -X -U postgres -d backup_restored -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT array_agg(id ORDER BY id) FROM auth.users) IS DISTINCT FROM ARRAY[1,2]
 OR (SELECT jsonb_agg(to_jsonb(b) ORDER BY user_id) FROM public.budget_data b) IS DISTINCT FROM '[{"user_id":1,"state":{"synthetic":true}},{"user_id":2,"state":{"synthetic":false}}]'::jsonb
 OR (SELECT jsonb_agg(to_jsonb(y)) FROM public.budget_ui_years y) IS DISTINCT FROM '[{"user_id":1,"year":2026,"budget_data":{"synthetic":true}}]'::jsonb
 OR (SELECT array_agg(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ARRAY['fixture'] THEN
   RAISE EXCEPTION 'Restored data differs';
 END IF;
 BEGIN
   INSERT INTO public.budget_data VALUES (999,'{}');
   RAISE EXCEPTION 'Missing restored FK';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.budget_data'::regclass,'public.budget_ui_years'::regclass) AND relrowsecurity) <> 2 THEN
   RAISE EXCEPTION 'RLS not restored';
 END IF;
END $$;
SET ROLE backup_owner;
SET fixture.owner = '1';
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_data) <> 1 OR NOT EXISTS (SELECT 1 FROM public.budget_data WHERE user_id=1)
 OR (SELECT count(*) FROM public.budget_ui_years) <> 1 THEN RAISE EXCEPTION 'Owner A isolation failed'; END IF;
END $$;
SET fixture.owner = '2';
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_data) <> 1 OR NOT EXISTS (SELECT 1 FROM public.budget_data WHERE user_id=2)
 OR EXISTS (SELECT 1 FROM public.budget_ui_years) THEN RAISE EXCEPTION 'Owner B isolation failed'; END IF;
 IF has_table_privilege(current_user,'public.budget_data','INSERT') THEN RAISE EXCEPTION 'Unexpected write grant'; END IF;
END $$;
RESET ROLE;
SQL
echo "Encrypted synthetic backup restored; wrong key, corruption, data, FK, grants and owner isolation verified"
