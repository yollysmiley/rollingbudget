#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}" "${PGDATABASE:?}"
if [[ "$PGHOST" != 127.0.0.1 && "$PGHOST" != localhost ]] || [[ "$PGDATABASE" != production_upgrade_test ]]; then
  echo "Refusing non-fixture database" >&2
  exit 1
fi
for fixture in tests/legacy-budget-access-runtime.sql tests/default-privileges-runtime.sql; do
  test -r "$fixture" || { echo "Missing SQL fixture: $fixture" >&2; exit 1; }
done

export REHEARSAL_DIR
REHEARSAL_DIR=$(mktemp -d)
trap 'rm -rf "$REHEARSAL_DIR"' EXIT
bash scripts/verify-production-upgrade.sh
pg_dump --format=custom --file="$REHEARSAL_DIR/after.dump"
pg_dump --schema-only --file="$REHEARSAL_DIR/after.schema"
pg_dump --data-only --inserts --file="$REHEARSAL_DIR/after.data"

# Ignore only pg_dump's randomized psql restriction keys and comments.
normalize() {
  sed -E '/^\\(un)?restrict /d; /^--/d; /^[[:space:]]*$/d' "$1"
}
for phase in before after; do
  target="production_upgrade_test_restore_$phase"
  createdb "$target"
  pg_restore --exit-on-error --single-transaction --dbname="$target" "$REHEARSAL_DIR/$phase.dump"
  pg_dump --dbname="$target" --schema-only --file="$REHEARSAL_DIR/$phase.restored.schema"
  pg_dump --dbname="$target" --data-only --inserts --file="$REHEARSAL_DIR/$phase.restored.data"
  diff -u <(normalize "$REHEARSAL_DIR/$phase.schema") <(normalize "$REHEARSAL_DIR/$phase.restored.schema")
  diff -u <(normalize "$REHEARSAL_DIR/$phase.data" | LC_ALL=C sort) <(normalize "$REHEARSAL_DIR/$phase.restored.data" | LC_ALL=C sort)
  psql -X --dbname="$target" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_data) <> 2 OR
    (SELECT count(*) FROM public.budget_ui_years) <> 2 THEN
   RAISE EXCEPTION 'Legacy record counts changed';
 END IF;
 IF EXISTS (SELECT user_id,year,budget_data,updated_at FROM public.budget_ui_years EXCEPT SELECT * FROM audit_snapshot.before_years)
 OR EXISTS (SELECT user_id,year,budget_data,updated_at FROM audit_snapshot.before_years EXCEPT SELECT user_id,year,budget_data,updated_at FROM public.budget_ui_years)
 OR EXISTS (SELECT id,user_id,state,updated_at FROM public.budget_data EXCEPT SELECT * FROM audit_snapshot.before_legacy)
 OR EXISTS (SELECT id,user_id,state,updated_at FROM audit_snapshot.before_legacy EXCEPT SELECT id,user_id,state,updated_at FROM public.budget_data) THEN
   RAISE EXCEPTION 'Legacy financial records changed';
 END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_ui_years) <> 1 OR NOT EXISTS
 (SELECT 1 FROM public.budget_ui_years WHERE budget_data->>'sentinel'='untouched-a') THEN
   RAISE EXCEPTION 'Restored year isolation failed';
 END IF;
END $$;
RESET ROLE;
SQL
  if [[ "$phase" == after ]]; then
    psql -X --dbname="$target" -v ON_ERROR_STOP=1 -f tests/default-privileges-runtime.sql
    psql -X --dbname="$target" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_accounts) <> 1 OR
    (SELECT count(*) FROM public.budget_expense_categories) <> 1 OR
    (SELECT count(*) FROM public.budget_recurring_rules) <> 1 OR
    NOT EXISTS (SELECT 1 FROM public.budget_recurring_rules WHERE id='pet-food' AND account_id='checking' AND amount=25) THEN
   RAISE EXCEPTION 'Restored owner data or isolation failed';
 END IF;
 BEGIN
   DELETE FROM public.budget_accounts WHERE id='checking';
   RAISE EXCEPTION 'Restored account FK failed';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.budget_accounts) OR EXISTS (SELECT 1 FROM public.budget_ui_years) THEN
   RAISE EXCEPTION 'Restored missing-JWT isolation failed';
 END IF;
END $$;
RESET ROLE;
SQL
  fi
  echo "Verified $phase backup restoration, schema, data and owner isolation"
done
