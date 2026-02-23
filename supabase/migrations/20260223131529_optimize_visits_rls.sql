-- Optimize visits RLS policy for better performance
-- Based on supabase-postgres-best-practices (security-rls-performance.md)

DROP POLICY IF EXISTS "Users can view their own and their friends' visits" ON public.visits;

CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
FOR SELECT USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM public.friends
        WHERE status = 'accepted'
          AND (
            (user1_id = auth.uid() AND user2_id = public.visits.user_id)
            OR
            (user2_id = auth.uid() AND user1_id = public.visits.user_id)
          )
    )
);
