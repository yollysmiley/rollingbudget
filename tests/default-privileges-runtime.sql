-- Disposable PostgreSQL fixture only; all probe objects are rolled back.
DO $fixture_guard$ BEGIN
 IF current_user <> 'postgres' OR current_database() NOT IN ('production_upgrade_test','production_upgrade_test_restore_after') THEN
  RAISE EXCEPTION 'Default privilege probe requires disposable postgres fixture';
 END IF;
END $fixture_guard$;
BEGIN;
CREATE TABLE public.fixture_default_acl (id integer, user_id uuid);
ALTER TABLE public.fixture_default_acl ENABLE ROW LEVEL SECURITY;
CREATE VIEW public.fixture_default_view WITH (security_invoker=true) AS SELECT id FROM public.fixture_default_acl;
CREATE SEQUENCE public.fixture_default_sequence;
CREATE FUNCTION public.fixture_default_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $probe$
DECLARE r text; p text; t text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH t IN ARRAY ARRAY['public.fixture_default_acl','public.fixture_default_view'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege(r,t,p) THEN RAISE EXCEPTION 'Implicit table/view grant: % % %',r,t,p; END IF;
   END LOOP;
  END LOOP;
  FOREACH p IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
   IF has_sequence_privilege(r,'public.fixture_default_sequence',p) THEN RAISE EXCEPTION 'Implicit sequence grant: % %',r,p; END IF;
  END LOOP;
  IF has_function_privilege(r,'public.fixture_default_function()','EXECUTE') THEN RAISE EXCEPTION 'Implicit function grant: %',r; END IF;
 END LOOP;
END $probe$;
GRANT SELECT ON public.fixture_default_acl TO authenticated;
INSERT INTO public.fixture_default_acl VALUES (1,'00000000-0000-4000-8000-000000000101'),(2,'00000000-0000-4000-8000-000000000102');
CREATE POLICY fixture_read ON public.fixture_default_acl FOR SELECT TO authenticated USING (auth.uid()=user_id);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
DO $fixture_check_1$ BEGIN
 IF (SELECT array_agg(id ORDER BY id) FROM public.fixture_default_acl) IS DISTINCT FROM ARRAY[1] THEN
  RAISE EXCEPTION 'Explicit grant did not preserve RLS';
 END IF;
END $fixture_check_1$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
DO $fixture_check_2$ BEGIN
 IF (SELECT array_agg(id ORDER BY id) FROM public.fixture_default_acl) IS DISTINCT FROM ARRAY[2] THEN RAISE EXCEPTION 'Second owner isolation failed'; END IF;
END $fixture_check_2$;
RESET ROLE;
DO $grants$
DECLARE t text; p text;
BEGIN
 FOREACH t IN ARRAY ARRAY['public.budget_accounts','public.budget_recurring_rules','public.budget_expense_categories'] LOOP
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
   IF has_table_privilege('anon',t,p) OR has_table_privilege('service_role',t,p)
    OR has_table_privilege('authenticated',t,p) IS DISTINCT FROM (p IN ('SELECT','INSERT','UPDATE','DELETE'))
   THEN RAISE EXCEPTION 'Unexpected application grant: % %',t,p; END IF;
  END LOOP;
 END LOOP;
END $grants$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000103');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
DO $fixture_check_3$ BEGIN
 IF EXISTS (SELECT 1 FROM public.budget_data) OR EXISTS (SELECT 1 FROM public.budget_ui_years)
 OR EXISTS (SELECT 1 FROM public.budget_accounts) OR EXISTS (SELECT 1 FROM public.budget_recurring_rules)
 OR EXISTS (SELECT 1 FROM public.budget_expense_categories) THEN RAISE EXCEPTION 'New user sees existing records'; END IF;
END $fixture_check_3$;
RESET ROLE;
ROLLBACK;
