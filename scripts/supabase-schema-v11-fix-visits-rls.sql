-- This script updates the RLS policy on the 'visits' table to allow friends to see each other's ratings.

-- Step 1: Drop the old, restrictive policy for viewing visits.
DROP POLICY IF EXISTS "Users can view their own visits" ON public.visits;

-- Step 2: Create a new policy that allows viewing your own visits OR your friends' visits.
CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
    FOR SELECT USING (
        -- Condition 1: Allow access if you are the owner of the visit
        auth.uid() = user_id
        OR
        -- Condition 2: Allow access if the owner of the visit is your accepted friend
        EXISTS (
            SELECT 1
            FROM public.friends
            WHERE
                friends.status = 'accepted'
                AND (
                    (friends.user1_id = auth.uid() AND friends.user2_id = visits.user_id)
                    OR
                    (friends.user2_id = auth.uid() AND friends.user1_id = visits.user_id)
                )
        )
    );