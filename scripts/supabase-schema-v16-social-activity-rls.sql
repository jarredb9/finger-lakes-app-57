-- This script updates the RLS policies on the 'favorites' and 'wishlist' tables
-- to allow friends to see each other's activity.

-- Step 1: Update RLS Policy for 'favorites' table
DROP POLICY IF EXISTS "Users can view their own favorite items" ON public.favorites;
CREATE POLICY "Users can view their own and friends' favorites" ON public.favorites
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

-- Step 2: Update RLS Policy for 'wishlist' table
DROP POLICY IF EXISTS "Users can view their own wishlist items" ON public.wishlist;
CREATE POLICY "Users can view their own and friends' wishlist items" ON public.wishlist
FOR SELECT USING (
    auth.uid() = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);