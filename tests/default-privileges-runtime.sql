-- Disposable PostgreSQL fixture only; all probe objects are rolled back.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' OR current_database() NOT IN ('production_upgrade_test','production_upgrade_test_restore_after') THEN
  RAISE EXCEPTION 'Default privilege probe requires disposable postgres fixture';
 END IF;
END $$;
CREATE TABLE public.fixture_default_acl (id integer);
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
INSERT INTO public.fixture_default_acl VALUES (1),(2);
CREATE POLICY fixture_read ON public.fixture_default_acl FOR SELECT TO authenticated USING (id=1);
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT array_agg(id ORDER BY id) FROM public.fixture_default_acl) IS DISTINCT FROM ARRAY[1] THEN
  RAISE EXCEPTION 'Explicit grant did not preserve RLS';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
