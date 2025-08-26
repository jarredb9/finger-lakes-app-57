-- This script provides the definitive fix for the Row Level Security (RLS) policy
-- on the 'visits' table by granting execute permissions on the helper function.

-- Step 1: Grant usage permissions on the function to authenticated users.
-- This is the critical missing step that allows RLS policies to execute the function.
GRANT EXECUTE ON FUNCTION public.get_friends_ids() TO authenticated;

-- Step 2: Drop the old policies to ensure a clean slate.
-- This ensures that no conflicting rules are left over.
DROP POLICY IF EXISTS "Users can view their own and their friends' visits" ON public.visits;
DROP POLICY IF EXISTS "Users can view their own visits" ON public.visits;

-- Step 3: Create the new, correct policy that uses the function.
-- This policy allows a user to see a visit if:
-- a) It's their own visit.
-- b) The visit's user_id is in the list of their friends returned by the function.
CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);