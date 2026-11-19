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

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -name '*.sql' -type f | LC_ALL=C sort)
count=0
for migration in "${migrations[@]}"; do
  [[ "${migration}" == *"20261114010000_create_budget_ui_years.sql" ]] && continue
  echo "Applying additive migration: ${migration}"
  psql -X -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
  count=$((count+1))
done
if [[ "${count}" -ne 8 ]]; then
  echo "Expected exactly eight additive migrations, found ${count}" >&2
  exit 1
fi

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

echo "Production-shaped additive upgrade, data preservation, RLS, and cross-owner FK tests passed"
