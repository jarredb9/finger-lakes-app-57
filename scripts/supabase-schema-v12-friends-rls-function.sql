-- This script creates a database function to securely fetch a user's friends
-- and updates the RLS policy on the 'visits' table to use this function.
-- This is the definitive fix for allowing users to see their friends' visit ratings.

-- Step 1: Create a function that returns a set of the current user's friends' IDs.
-- The "SECURITY DEFINER" clause allows this function to run with elevated privileges,
-- safely bypassing RLS for this specific, controlled query.
CREATE OR REPLACE FUNCTION get_friends_ids()
RETURNS TABLE(friend_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN user1_id = auth.uid() THEN user2_id
            ELSE user1_id
        END
    FROM
        public.friends
    WHERE
        (user1_id = auth.uid() OR user2_id = auth.uid()) AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 2: Drop the previous, non-functional policy for viewing visits.
DROP POLICY IF EXISTS "Users can view their own and their friends' visits" ON public.visits;

-- Step 3: Create the new, correct policy using the function.
-- This policy allows a user to see a visit if:
-- a) It's their own visit.
-- b) The visit's user_id is in the list of their friends returned by our new function.
CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);