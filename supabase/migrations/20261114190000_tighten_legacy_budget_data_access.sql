-- Tighten access to the retained legacy budget table.
-- This migration changes grants and RLS policies only; it does not modify rows,
-- delete users, or alter the new public.budget_ui_years storage table.

BEGIN;

-- Anonymous clients must not access legacy financial records.
REVOKE ALL PRIVILEGES
    ON TABLE public.budget_data
    FROM PUBLIC, anon;

-- Authenticated users retain ordinary row operations, but cannot truncate the
-- table, create triggers, or create references against it.
REVOKE TRUNCATE, REFERENCES, TRIGGER
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

COMMIT;
