-- Tighten access to the retained legacy budget table.
-- This migration changes grants and RLS policies only; it does not modify rows,
-- delete users, or alter the new public.budget_ui_years storage table.

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.budget_data IN ACCESS EXCLUSIVE MODE;

-- Anonymous clients must not access legacy financial records.
REVOKE ALL PRIVILEGES
    ON TABLE public.budget_data
    FROM PUBLIC, anon;

-- Authenticated users retain ordinary row operations, but cannot truncate the
-- table, create triggers, or create references against it.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
    ON TABLE public.budget_data
    FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.budget_data
    TO authenticated;

-- Replace the legacy PUBLIC-targeted policies (including the redundant ALL
-- policy) with one explicit owner-scoped policy for each CRUD operation.
DROP POLICY IF EXISTS "Users own their data" ON public.budget_data;
DROP POLICY IF EXISTS "Users can read own data" ON public.budget_data;
DROP POLICY IF EXISTS "Users can insert own data" ON public.budget_data;
DROP POLICY IF EXISTS "Users can update own data" ON public.budget_data;

CREATE POLICY budget_data_select_own
    ON public.budget_data
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY budget_data_insert_own
    ON public.budget_data
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY budget_data_update_own
    ON public.budget_data
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY budget_data_delete_own
    ON public.budget_data
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

DO $check$
DECLARE p text;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_data'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='budget_data') <> 4 THEN RAISE EXCEPTION 'Unexpected policies'; END IF;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
  IF has_table_privilege('anon','public.budget_data',p) OR has_table_privilege('authenticated','public.budget_data',p) <> (p IN ('SELECT','INSERT','UPDATE','DELETE')) THEN RAISE EXCEPTION 'Unexpected effective privilege: %',p; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM pg_roles a WHERE a.rolname IN ('anon','authenticated') AND (a.rolsuper OR a.rolbypassrls OR a.rolcreaterole OR EXISTS (SELECT 1 FROM pg_roles b WHERE b.oid<>a.oid AND pg_has_role(a.oid,b.oid,'MEMBER')))) THEN RAISE EXCEPTION 'Unexpected client role escalation'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) OR (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.budget_data'::regclass) <> 'postgres' THEN RAISE EXCEPTION 'Unexpected administrative role'; END IF;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
  IF has_any_column_privilege('anon','public.budget_data',p) OR has_any_column_privilege('authenticated','public.budget_data',p) <> (p <> 'REFERENCES') OR has_any_column_privilege('authenticated','public.budget_data',p||' WITH GRANT OPTION') THEN RAISE EXCEPTION 'Unexpected column privilege: %',p; END IF;
 END LOOP;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
  IF has_table_privilege('authenticated','public.budget_data',p||' WITH GRANT OPTION') THEN RAISE EXCEPTION 'Unexpected grant option: %',p; END IF;
  IF NOT has_table_privilege('service_role','public.budget_data',p) THEN RAISE EXCEPTION 'Missing service privilege: %',p; END IF;
 END LOOP;
END $check$;
COMMIT;
