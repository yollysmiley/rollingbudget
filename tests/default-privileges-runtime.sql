-- Disposable PostgreSQL fixture only; all probe objects are rolled back.
DO $fixture_guard$ BEGIN
 IF current_user <> 'postgres' OR current_database() NOT IN ('production_upgrade_test','production_upgrade_test_restore_after') THEN
  RAISE EXCEPTION 'Default privilege probe requires disposable postgres fixture';
 END IF;
END $fixture_guard$;
BEGIN;
DO $administrative_contract$
DECLARE t text; p text; r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin))
   OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname<>r AND pg_has_role(r,oid,'MEMBER'))
   OR has_schema_privilege(r,'public','CREATE') OR has_schema_privilege(r,'auth','CREATE')
  THEN RAISE EXCEPTION 'Unsafe client role: %',r; END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper AND NOT rolcanlogin AND NOT rolcreaterole)
 THEN RAISE EXCEPTION 'Unexpected service role attributes'; END IF;
 FOREACH t IN ARRAY ARRAY['public.budget_data','public.budget_ui_years','public.budget_accounts','public.budget_recurring_rules','public.budget_expense_categories'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=t::regclass AND relrowsecurity AND pg_get_userbyid(relowner)='postgres')
  THEN RAISE EXCEPTION 'Unexpected owner or RLS: %',t; END IF;
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
   IF has_table_privilege('anon',t,p) OR has_table_privilege('authenticated',t,p) IS DISTINCT FROM (p IN ('SELECT','INSERT','UPDATE','DELETE'))
    OR has_table_privilege('service_role',t,p) IS DISTINCT FROM (t IN ('public.budget_data','public.budget_ui_years'))
    OR NOT has_table_privilege('postgres',t,p)
   THEN RAISE EXCEPTION 'Administrative access contract failed: % %',t,p; END IF;
  END LOOP;
 END LOOP;
END $administrative_contract$;
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
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000104'),('00000000-0000-4000-8000-000000000105');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000104',true);
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (auth.uid(),'fixture-cat','Fixture category');
DO $category_owner$
DECLARE reserved text;
BEGIN
 FOREACH reserved IN ARRAY ARRAY['income','fixed','variable','loan','cc'] LOOP
  BEGIN
   INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (auth.uid(),reserved,'Reserved');
   RAISE EXCEPTION 'Reserved category accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date)
   VALUES (auth.uid(),reserved,'Built in',reserved,1,'monthly','2026-01-01');
 END LOOP;
 INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date,active)
 VALUES (auth.uid(),'fixture-rule','Custom','fixture-cat',1,'monthly','2026-01-01',false);
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE id='fixture-cat';
  RAISE EXCEPTION 'Referenced category deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.budget_recurring_rules SET category='missing' WHERE id='fixture-rule';
  RAISE EXCEPTION 'Missing category accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $category_owner$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
DO $category_cross_owner$
BEGIN
 BEGIN
  INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date)
   VALUES (auth.uid(),'fixture-rule','Custom','fixture-cat',1,'monthly','2026-01-01');
  RAISE EXCEPTION 'Cross-owner category accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (auth.uid(),'fixture-cat','Same ID');
 INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date)
  VALUES (auth.uid(),'fixture-rule','Custom','fixture-cat',1,'monthly','2026-01-01');
 DELETE FROM public.budget_recurring_rules WHERE id='fixture-rule';
 DELETE FROM public.budget_expense_categories WHERE id='fixture-cat';
 IF FOUND IS FALSE THEN RAISE EXCEPTION 'Unused category deletion failed'; END IF;
END $category_cross_owner$;
RESET ROLE;
DO $embedded_acl$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(r,'budget_internal','USAGE') OR has_table_privilege(r,'budget_internal.year_category_refs','INSERT,UPDATE,DELETE,SELECT') OR has_function_privilege(r,'budget_internal.sync_year_category_refs()','EXECUTE') THEN
   RAISE EXCEPTION 'Internal reference privileges exposed';
  END IF;
 END LOOP;
END $embedded_acl$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (auth.uid(),'embedded','Embedded');
INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES
 (auth.uid(),2030,'{"months":[{"expenses":[{"categoryId":"embedded"}]}]}'),
 (auth.uid(),2031,'{"months":[{"fixed":[{"category_id":"embedded"}]}]}');
DO $embedded_refs$
BEGIN
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE id='embedded';
  RAISE EXCEPTION 'Referenced category deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":[{"categoryId":"missing"}]}]}' WHERE year=2030;
  RAISE EXCEPTION 'Missing embedded category accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":{}}]}' WHERE year=2030;
  RAISE EXCEPTION 'Malformed expense collection accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 DELETE FROM public.budget_ui_years WHERE year=2030;
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE id='embedded';
  RAISE EXCEPTION 'Second year reference lost';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 UPDATE public.budget_ui_years SET budget_data='{"months":[{"fixed":[]}]}' WHERE year=2031;
 DELETE FROM public.budget_expense_categories WHERE id='embedded';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unused category deletion failed'; END IF;
END $embedded_refs$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES (auth.uid(),'history','History');
INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date,versions) VALUES (auth.uid(),'history-rule','History','fixed',1,'monthly','2026-01-01','[{"categoryId":"history"}]');
DO $historical_refs$
BEGIN
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE id='history';
  RAISE EXCEPTION 'Historical rule category deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 DELETE FROM public.budget_recurring_rules WHERE id='history-rule';
 INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES (auth.uid(),2042,'{"recurringRules":[{"category":"history"}]}');
 BEGIN
  DELETE FROM public.budget_expense_categories WHERE id='history';
  RAISE EXCEPTION 'Embedded rule category deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":[{"amount":1}]}]}' WHERE year=2042;
  RAISE EXCEPTION 'Missing category accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 DELETE FROM public.budget_ui_years WHERE year=2042;
 DELETE FROM public.budget_expense_categories WHERE id='history';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unused historical category not deleted'; END IF;
END $historical_refs$;
RESET ROLE;
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('00000000-0000-4000-8000-000000000105','sync-a','Sync A'),('00000000-0000-4000-8000-000000000105','sync-b','Sync B');
INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('00000000-0000-4000-8000-000000000105',2043,'{"months":[{"expenses":[{"categoryId":"sync-a"}]}]}');
DO $sync_probe$
DECLARE before_tid tid; after_tid tid;
BEGIN
 SELECT ctid INTO STRICT before_tid FROM budget_internal.year_category_refs WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043 AND category_id='sync-a';
 UPDATE public.budget_ui_years SET budget_data=budget_data || '{"note":"changed"}' WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043;
 SELECT ctid INTO STRICT after_tid FROM budget_internal.year_category_refs WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043 AND category_id='sync-a';
 IF before_tid IS DISTINCT FROM after_tid THEN RAISE EXCEPTION 'Unchanged dependency rewritten'; END IF;
 UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":[{"categoryId":"sync-b"}]}]}' WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043;
 IF EXISTS(SELECT 1 FROM budget_internal.year_category_refs WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043 AND category_id='sync-a') OR NOT EXISTS(SELECT 1 FROM budget_internal.year_category_refs WHERE user_id='00000000-0000-4000-8000-000000000105' AND year=2043 AND category_id='sync-b') THEN RAISE EXCEPTION 'Dependency delta incorrect'; END IF;
END $sync_probe$;
ROLLBACK;

-- Account reference runtime checks use an isolated synthetic owner.
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000108');
INSERT INTO public.budget_accounts(user_id,id,name) VALUES ('00000000-0000-4000-8000-000000000108','acct-test','Account test');
INSERT INTO public.budget_expense_categories(user_id,id,name) VALUES ('00000000-0000-4000-8000-000000000108','acct-category','Account fixture category');
INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('00000000-0000-4000-8000-000000000108',2060,'{"months":[{"income":[{"cpm":0,"usaa":"0"}],"expenses":[{"categoryId":"acct-category","accountId":"acct-test"},{"categoryId":"acct-category","accountId":null}]}]}');
INSERT INTO public.budget_recurring_rules(user_id,id,name,category,amount,frequency,start_date,versions) VALUES ('00000000-0000-4000-8000-000000000108','acct-rule','Account rule','fixed',1,'monthly','2026-01-01','[{"accountId":"acct-test"}]');
DO $account_probe$
DECLARE owner_id uuid:='00000000-0000-4000-8000-000000000108';
BEGIN
 IF (SELECT count(*) FROM budget_internal.year_account_refs WHERE user_id=owner_id)<>1 OR (SELECT count(*) FROM budget_internal.rule_account_refs WHERE user_id=owner_id)<>1 THEN RAISE EXCEPTION 'Account inventory missing'; END IF;
 BEGIN DELETE FROM public.budget_accounts WHERE user_id=owner_id; RAISE EXCEPTION 'Referenced deletion accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN UPDATE public.budget_ui_years SET budget_data='{"months":[{"expenses":[{"categoryId":"acct-category","accountId":"missing"}]}]}' WHERE user_id=owner_id; RAISE EXCEPTION 'Missing account accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 DELETE FROM public.budget_ui_years WHERE user_id=owner_id;
 BEGIN DELETE FROM public.budget_accounts WHERE user_id=owner_id; RAISE EXCEPTION 'Historical deletion accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 DELETE FROM public.budget_recurring_rules WHERE user_id=owner_id;
 DELETE FROM public.budget_accounts WHERE user_id=owner_id;
 IF has_table_privilege('authenticated','budget_internal.year_account_refs','INSERT') OR has_table_privilege('authenticated','budget_internal.rule_account_refs','UPDATE') THEN RAISE EXCEPTION 'Private account refs exposed'; END IF;
END $account_probe$;
ROLLBACK;

BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000109'),('00000000-0000-4000-8000-000000000110');
INSERT INTO public.budget_accounts(user_id,id,name) VALUES ('00000000-0000-4000-8000-000000000109','cpm','CPM Federal');
INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('00000000-0000-4000-8000-000000000109',2064,'{"months":[{"income":[{"cpm":"125.50","usaa":0}]}]}');
DO $release_account_probe$
BEGIN
 IF (SELECT count(*) FROM budget_internal.year_account_refs WHERE user_id='00000000-0000-4000-8000-000000000109' AND account_id='cpm')<>1 THEN RAISE EXCEPTION 'Legacy nonzero reference lost'; END IF;
 IF (SELECT budget_data FROM public.budget_ui_years WHERE user_id='00000000-0000-4000-8000-000000000109' AND year=2064) IS DISTINCT FROM '{"months":[{"income":[{"cpm":"125.50","usaa":0}]}]}'::jsonb THEN RAISE EXCEPTION 'Legacy document changed'; END IF;
 BEGIN
 INSERT INTO public.budget_ui_years(user_id,year,budget_data) VALUES ('00000000-0000-4000-8000-000000000110',2064,'{"months":[{"income":[{"cpm":125}]}]}');
 RAISE EXCEPTION 'Cross-owner legacy reference accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.budget_accounts WHERE user_id='00000000-0000-4000-8000-000000000110') THEN RAISE EXCEPTION 'New owner unexpectedly seeded'; END IF;
END $release_account_probe$;
ROLLBACK;
