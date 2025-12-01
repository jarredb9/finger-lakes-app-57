-- Fix auth_rls_initplan warnings by wrapping auth.<function>() in (select ...)

-- public.friends
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friends;
CREATE POLICY "Users can create friend requests" ON public.friends
    FOR INSERT WITH CHECK ((select auth.uid()) = user1_id);

DROP POLICY IF EXISTS "Users can delete their own friendships" ON public.friends;
CREATE POLICY "Users can delete their own friendships" ON public.friends
    FOR DELETE USING ((select auth.uid()) = user1_id OR (select auth.uid()) = user2_id);

DROP POLICY IF EXISTS "Users can respond to friend requests" ON public.friends;
CREATE POLICY "Users can respond to friend requests" ON public.friends
    FOR UPDATE USING ((select auth.uid()) = user2_id) WITH CHECK (status IN ('accepted', 'declined'));

DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friends;
CREATE POLICY "Users can view their own friendships" ON public.friends
    FOR SELECT USING ((select auth.uid()) = user1_id OR (select auth.uid()) = user2_id);

-- public.favorites
DROP POLICY IF EXISTS "Users can delete their own favorite items" ON public.favorites;
CREATE POLICY "Users can delete their own favorite items" ON public.favorites
    FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own favorite items" ON public.favorites;
CREATE POLICY "Users can insert their own favorite items" ON public.favorites
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own and friends' favorites" ON public.favorites;
CREATE POLICY "Users can view their own and friends' favorites" ON public.favorites
FOR SELECT USING (
    (select auth.uid()) = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

-- public.trips
DROP POLICY IF EXISTS "Users can delete their own trips" ON public.trips;
CREATE POLICY "Users can delete their own trips" ON public.trips
    FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own trips" ON public.trips;
CREATE POLICY "Users can insert their own trips" ON public.trips
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own trips" ON public.trips;
CREATE POLICY "Users can update their own trips" ON public.trips
    FOR UPDATE USING ((select auth.uid()) = user_id OR (select auth.uid()) = ANY(members));

DROP POLICY IF EXISTS "Users can view their own trips" ON public.trips;
CREATE POLICY "Users can view their own trips" ON public.trips
    FOR SELECT USING ((select auth.uid()) = user_id OR (select auth.uid()) = ANY(members));

-- public.visits
DROP POLICY IF EXISTS "Users can delete their own visits" ON public.visits;
CREATE POLICY "Users can delete their own visits" ON public.visits
    FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own visits" ON public.visits;
CREATE POLICY "Users can insert their own visits" ON public.visits
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own visits" ON public.visits;
CREATE POLICY "Users can update their own visits" ON public.visits
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own and their friends' visits" ON public.visits;
CREATE POLICY "Users can view their own and their friends' visits" ON public.visits
FOR SELECT USING (
    (select auth.uid()) = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

-- public.wishlist
DROP POLICY IF EXISTS "Users can delete their own wishlist items" ON public.wishlist;
CREATE POLICY "Users can delete their own wishlist items" ON public.wishlist
    FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own wishlist items" ON public.wishlist;
CREATE POLICY "Users can insert their own wishlist items" ON public.wishlist
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own and friends' wishlist items" ON public.wishlist;
CREATE POLICY "Users can view their own and friends' wishlist items" ON public.wishlist
FOR SELECT USING (
    (select auth.uid()) = user_id
    OR
    user_id IN (SELECT friend_id FROM get_friends_ids())
);

-- public.profiles
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles
    FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile." ON public.profiles
    FOR UPDATE USING ((select auth.uid()) = id);


-- Fix multiple_permissive_policies warning
-- Drop duplicate policy on wineries
DROP POLICY IF EXISTS "Allow authenticated users to insert wineries" ON public.wineries;
