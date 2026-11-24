#!/usr/bin/env bash
set -euo pipefail

# Production-shape upgrade regression. This script MUST NOT access a remote database.
: "${PGHOST:?PGHOST required}"
: "${PGPORT:?PGPORT required}"
: "${PGUSER:?PGUSER required}"
: "${PGDATABASE:?PGDATABASE required}"
if [[ "${PGHOST}" != "127.0.0.1" && "${PGHOST}" != "localhost" ]] || [[ "${PGDATABASE}" != "production_upgrade_test" ]]; then
  echo "Refusing to run outside disposable local production_upgrade_test database" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.budget_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.budget_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their data" ON public.budget_data FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000102');
INSERT INTO public.budget_data(user_id,state) VALUES
 ('00000000-0000-4000-8000-000000000101','{"legacy":"preserve-owner-a"}'),
 ('00000000-0000-4000-8000-000000000102','{"legacy":"preserve-owner-b"}');
SQL

# The production year-table migration is already deployed; reproduce its schema.
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261114010000_create_budget_ui_years.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES
 ('00000000-0000-4000-8000-000000000101',2026,'{"months":[{"owner":"a"}],"sentinel":"untouched-a"}'),
 ('00000000-0000-4000-8000-000000000102',2027,'{"months":[{"owner":"b"}],"sentinel":"untouched-b"}');
CREATE SCHEMA audit_snapshot;
CREATE TABLE audit_snapshot.before_years AS SELECT user_id,year,budget_data,updated_at FROM public.budget_ui_years;
CREATE TABLE audit_snapshot.before_legacy AS SELECT user_id,state,updated_at FROM public.budget_data;
SQL

# Optional synthetic backup checkpoint for the CI restoration rehearsal.
if [[ -n "${REHEARSAL_DIR:-}" ]]; then
  pg_dump --format=custom --file="${REHEARSAL_DIR}/before.dump"
  pg_dump --schema-only --file="${REHEARSAL_DIR}/before.schema"
  pg_dump --data-only --inserts --file="${REHEARSAL_DIR}/before.data"
fi

# Explicit, reviewed production upgrade manifest. Never discover draft SQL files.
migrations=(
  supabase/migrations/20261114192802_harden_public_default_privileges.sql
  supabase/migrations/20261114221703_create_budget_accounts.sql
  supabase/migrations/20261115043822_create_budget_recurring_rules.sql
  supabase/migrations/20261116172229_add_recurring_due_day_and_full_dates.sql
  supabase/migrations/20261117024033_protect_global_recurring_account_refs.sql
  supabase/migrations/20261117071635_create_budget_expense_categories.sql
  supabase/migrations/20261117071637_remove_expense_category_kind.sql
  supabase/migrations/20261117071639_allow_custom_recurring_categories.sql
)
if [[ "${#migrations[@]}" -ne 8 ]]; then
  echo "Expected exactly eight approved migrations" >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  if [[ ! -f "${migration}" ]]; then
    echo "Approved migration missing: ${migration}" >&2
    exit 1
  fi
  echo "Applying approved migration: ${migration}"
  psql -X -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
done

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT user_id,year,budget_data,updated_at FROM public.budget_ui_years
             EXCEPT SELECT user_id,year,budget_data,updated_at FROM audit_snapshot.before_years)
    OR EXISTS (SELECT user_id,year,budget_data,updated_at FROM audit_snapshot.before_years
               EXCEPT SELECT user_id,year,budget_data,updated_at FROM public.budget_ui_years) THEN
    RAISE EXCEPTION 'Existing budget-year records changed';
  END IF;
  IF EXISTS (SELECT user_id,state,updated_at FROM public.budget_data
             EXCEPT SELECT user_id,state,updated_at FROM audit_snapshot.before_legacy)
    OR EXISTS (SELECT user_id,state,updated_at FROM audit_snapshot.before_legacy
               EXCEPT SELECT user_id,state,updated_at FROM public.budget_data) THEN
    RAISE EXCEPTION 'Existing legacy budget records changed';
  END IF;
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
   WHERE s.nspname='public' AND c.relname IN
   ('budget_data','budget_ui_years','budget_accounts','budget_recurring_rules','budget_expense_categories')
   AND c.relkind='r' AND c.relrowsecurity;
  IF n <> 5 THEN RAISE EXCEPTION 'Expected five RLS-protected tables, found %', n; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND
      tablename IN ('budget_accounts','budget_recurring_rules','budget_expense_categories')
      AND roles=ARRAY['authenticated']::name[]) <> 12 THEN
    RAISE EXCEPTION 'Missing owner-scoped policies for new tables';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.budget_recurring_rules'::regclass
      AND conname='budget_recurring_account_owner_fk' AND convalidated) THEN
    RAISE EXCEPTION 'Tenant-safe recurring account foreign key missing';
  END IF;
END $$;

-- Exercise real RLS with two independent synthetic users.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
INSERT INTO public.budget_accounts(user_id,id,name) VALUES
 ('00000000-0000-4000-8000-000000000101','checking','Owner A checking');
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES
 ('00000000-0000-4000-8000-000000000101','pets','Pets');
INSERT INTO public.budget_recurring_rules
 (user_id,id,name,category,amount,frequency,start_date,account_id)
 VALUES ('00000000-0000-4000-8000-000000000101','pet-food','Pet food','pets',25,'monthly','2026-01-15','checking');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_ui_years) <> 1 THEN
   RAISE EXCEPTION 'Year isolation failed';
 END IF;
 IF (SELECT count(*) FROM public.budget_accounts) <> 1 THEN
   RAISE EXCEPTION 'Account isolation failed';
 END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',false);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.budget_accounts) <> 0
    OR (SELECT count(*) FROM public.budget_recurring_rules) <> 0
    OR (SELECT count(*) FROM public.budget_expense_categories) <> 0 THEN
    RAISE EXCEPTION 'Cross-owner reads succeeded';
 END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.budget_recurring_rules
      WHERE id='pet-food' AND account_id='checking') THEN
   RAISE EXCEPTION 'New recurring rule was not persisted';
 END IF;
END $$;
SQL

# A cross-owner account reference must fail without changing either owner's data.
if psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',false);
INSERT INTO public.budget_recurring_rules
 (user_id,id,name,category,amount,frequency,start_date,account_id)
 VALUES ('00000000-0000-4000-8000-000000000102','cross-owner','Forbidden','fixed',1,'monthly','2026-01-01','checking');
SQL
then
  echo "Cross-owner recurring account reference was accepted" >&2
  exit 1
fi

# Phase 2D.6: exercise actual PostgreSQL RLS as distinct JWT owners and without a JWT.
# These checks run only in the disposable local database; no production SQL is executed.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',false);
INSERT INTO public.budget_accounts(user_id,id,name) VALUES
 ('00000000-0000-4000-8000-000000000102','savings','Owner B savings');
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES
 ('00000000-0000-4000-8000-000000000102','travel','Travel');
INSERT INTO public.budget_recurring_rules
 (user_id,id,name,category,amount,frequency,start_date,account_id)
 VALUES ('00000000-0000-4000-8000-000000000102','travel-fund','Travel fund','travel',40,'monthly','2026-01-01','savings');
DO $$
DECLARE affected integer;
BEGIN
  -- Cross-tenant UPDATE and DELETE must affect zero rows, not merely avoid errors.
  UPDATE public.budget_accounts SET name='ATTACK' WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner account UPDATE succeeded'; END IF;
  DELETE FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner account DELETE succeeded'; END IF;
  UPDATE public.budget_expense_categories SET name='ATTACK' WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner category UPDATE succeeded'; END IF;
  DELETE FROM public.budget_expense_categories WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner category DELETE succeeded'; END IF;
  UPDATE public.budget_recurring_rules SET amount=999 WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner recurring UPDATE succeeded'; END IF;
  DELETE FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner recurring DELETE succeeded'; END IF;
  UPDATE public.budget_ui_years SET budget_data='{}' WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner budget UPDATE succeeded'; END IF;
  DELETE FROM public.budget_ui_years WHERE user_id='00000000-0000-4000-8000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner budget DELETE succeeded'; END IF;
END $$;
-- An authenticated DB role without a user JWT must not see or change any owner rows.
SELECT set_config('request.jwt.claim.sub','',false);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.budget_accounts) <> 0
    OR (SELECT count(*) FROM public.budget_expense_categories) <> 0
    OR (SELECT count(*) FROM public.budget_recurring_rules) <> 0
    OR (SELECT count(*) FROM public.budget_ui_years) <> 0 THEN
    RAISE EXCEPTION 'Missing JWT exposed owner data';
  END IF;
  UPDATE public.budget_accounts SET name='ATTACK';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Missing JWT allowed UPDATE'; END IF;
END $$;
RESET ROLE;
-- Verify neither tenant's data was modified by the denied attempts.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000101' AND name='Owner A checking')
 OR NOT EXISTS (SELECT 1 FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000102' AND name='Owner B savings')
 OR NOT EXISTS (SELECT 1 FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000101' AND amount=25)
 OR NOT EXISTS (SELECT 1 FROM public.budget_recurring_rules WHERE user_id='00000000-0000-4000-8000-000000000102' AND amount=40)
 OR NOT EXISTS (SELECT 1 FROM public.budget_expense_categories WHERE user_id='00000000-0000-4000-8000-000000000101' AND name='Pets')
 OR NOT EXISTS (SELECT 1 FROM public.budget_expense_categories WHERE user_id='00000000-0000-4000-8000-000000000102' AND name='Travel') THEN
  RAISE EXCEPTION 'Cross-owner attack modified data';
 END IF;
END $$;
SQL

# Owner spoofing through INSERT and UPDATE must fail their WITH CHECK policy.
for operation in insert_account insert_category insert_recurring insert_year reassign_account; do
  if OPERATION="$operation" psql -X -v ON_ERROR_STOP=1 -v operation="$operation" <<'SQL' >/dev/null 2>&1
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',false);
SELECT CASE :'operation'
  WHEN 'insert_account' THEN 'INSERT INTO public.budget_accounts(user_id,id,name) VALUES (''00000000-0000-4000-8000-000000000101'',''spoof'',''Spoof'')'
  WHEN 'insert_category' THEN 'INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (''00000000-0000-4000-8000-000000000101'',''spoof'',''Spoof'')'
  WHEN 'insert_recurring' THEN 'INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date) VALUES (''00000000-0000-4000-8000-000000000101'',''spoof'',''Spoof'',''fixed'',1,''monthly'',''2026-01-01'')'
  WHEN 'insert_year' THEN 'INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES (''00000000-0000-4000-8000-000000000101'',2030,''{}'')'
  WHEN 'reassign_account' THEN 'UPDATE public.budget_accounts SET user_id=''00000000-0000-4000-8000-000000000101'' WHERE user_id=''00000000-0000-4000-8000-000000000102'' AND id=''savings'''
END AS sql_command
\gexec
SQL
  then
    echo "RLS owner spoofing unexpectedly succeeded: $operation" >&2
    exit 1
  fi
done

echo "Phase 2D.6 cross-owner read/write/delete, JWT absence, and owner-spoofing RLS checks passed"

echo "Production-shaped additive upgrade, data preservation, RLS, and cross-owner FK tests passed"
