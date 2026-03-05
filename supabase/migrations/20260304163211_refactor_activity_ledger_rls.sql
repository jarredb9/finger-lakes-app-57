-- Refactor activity_ledger RLS to use the centralized visibility helper
-- Ensures consistency with profiles, visits, and follows

DROP POLICY IF EXISTS "Users can view public activities" ON public.activity_ledger;
DROP POLICY IF EXISTS "Users can view their own activities" ON public.activity_ledger;
DROP POLICY IF EXISTS "Users can view friends-only activities" ON public.activity_ledger;

CREATE POLICY "Users can view activities based on privacy settings"
ON public.activity_ledger FOR SELECT
USING (
    public.is_visible_to_viewer(
        user_id, 
        CASE WHEN privacy_level = 'private' THEN true ELSE false END
    )
);
