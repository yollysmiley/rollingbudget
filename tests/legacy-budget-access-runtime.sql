BEGIN;
DO $$ DECLARE p text; BEGIN
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
 IF has_table_privilege('anon','public.budget_data',p) OR has_table_privilege('authenticated','public.budget_data',p) <> (p IN ('SELECT','INSERT','UPDATE','DELETE')) OR NOT has_table_privilege('service_role','public.budget_data',p) THEN RAISE EXCEPTION 'Privilege mismatch: %',p; END IF;
 END LOOP;
END $$;
SET ROLE service_role;
DO $service$
BEGIN
 IF (SELECT count(*) FROM public.budget_data) <> 2 THEN RAISE EXCEPTION 'Service role cannot read both fixture owners'; END IF;
 UPDATE public.budget_data SET state=state;
 IF NOT FOUND THEN RAISE EXCEPTION 'Service role update failed'; END IF;
END $service$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.budget_data; RAISE EXCEPTION 'Anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000103');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',false);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.budget_data) THEN RAISE EXCEPTION 'New user not empty'; END IF;
 INSERT INTO public.budget_data(user_id,state) VALUES ('00000000-0000-4000-8000-000000000103','{}');
 INSERT INTO public.budget_data(user_id,state) VALUES ('00000000-0000-4000-8000-000000000103','{"updated":true}') ON CONFLICT(user_id) DO UPDATE SET state=excluded.state;
 IF (SELECT state FROM public.budget_data) IS DISTINCT FROM '{"updated":true}'::jsonb THEN RAISE EXCEPTION 'Upsert failed'; END IF;
 UPDATE public.budget_data SET state='{}' WHERE user_id='00000000-0000-4000-8000-000000000101';
 IF FOUND THEN RAISE EXCEPTION 'Cross owner update'; END IF;
 DELETE FROM public.budget_data WHERE user_id='00000000-0000-4000-8000-000000000101';
 IF FOUND THEN RAISE EXCEPTION 'Cross owner delete'; END IF;
 BEGIN INSERT INTO public.budget_data(user_id,state) VALUES ('00000000-0000-4000-8000-000000000101','{}'); RAISE EXCEPTION 'Spoof allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.budget_data SET user_id='00000000-0000-4000-8000-000000000101'; RAISE EXCEPTION 'Transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE public.budget_data; RAISE EXCEPTION 'Truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM public.budget_data;
 IF NOT FOUND THEN RAISE EXCEPTION 'Own delete failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.budget_data) THEN RAISE EXCEPTION 'Missing identity read'; END IF; END $$;
RESET ROLE;
ROLLBACK;
