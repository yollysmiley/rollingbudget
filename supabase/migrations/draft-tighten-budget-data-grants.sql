-- DRAFT — DO NOT APPLY WITHOUT EXPLICIT APPROVAL
-- Target: production project awalptqpsjflrahkrjzk (Rolling Budget)
-- Purpose: tighten client grants and retarget RLS policies on public.budget_data
-- to match the staging-validated configuration.
--
-- Changes no data. Rollback: restore prior grants/policies from the 2026-10-30
-- backup record. Current production state (2026-10-30 inspection):
--   - anon and authenticated hold SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES, TRIGGER on public.budget_data
--   - four policies targeted to PUBLIC, including a redundant ALL policy
--   - FK user_id -> auth.users(id) ON DELETE CASCADE (unchanged by this draft)

BEGIN;

-- 1. Anonymous clients get no table privileges.
REVOKE ALL PRIVILEGES
    ON TABLE public.budget_data
    FROM anon;

-- 2. Authenticated clients keep only the four row operations.
REVOKE TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.budget_data
    FROM authenticated;

-- 3. Retarget ownership policies from PUBLIC to authenticated and replace
--    the redundant ALL policy with an explicit DELETE policy.
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

COMMIT;

-- Post-apply verification: run the read-only queries from the staging
-- repository's supabase/verification/verify-budget-data-access.sql, then
-- confirm ordinary-client access with a test account before considering
-- this complete.
