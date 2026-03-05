-- Optimize RLS policies by wrapping visibility helper in SELECT for better performance
-- Migration: 20260305140740_optimize_rls_performance.sql

-- 1. Profiles
DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
CREATE POLICY "Profiles are viewable based on privacy settings" ON public.profiles
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(id))
);

-- 2. Visits
DROP POLICY IF EXISTS "Users can view visits based on privacy settings" ON public.visits;
CREATE POLICY "Users can view visits based on privacy settings" ON public.visits
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(user_id, is_private))
);

-- 3. Favorites
DROP POLICY IF EXISTS "Users can view favorites based on privacy settings" ON public.favorites;
CREATE POLICY "Users can view favorites based on privacy settings" ON public.favorites
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(user_id, is_private))
);

-- 4. Wishlist
DROP POLICY IF EXISTS "Users can view wishlist items based on privacy settings" ON public.wishlist;
CREATE POLICY "Users can view wishlist items based on privacy settings" ON public.wishlist
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(user_id, is_private))
);

-- 5. Activity Ledger
DROP POLICY IF EXISTS "Users can view activities based on privacy settings" ON public.activity_ledger;
CREATE POLICY "Users can view activities based on privacy settings" ON public.activity_ledger
FOR SELECT USING (
    (SELECT public.is_visible_to_viewer(user_id, privacy_level = 'private'))
);

-- 6. Missing Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_follow_requests_follower_id ON public.follow_requests(follower_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_following_id ON public.follow_requests(following_id);
