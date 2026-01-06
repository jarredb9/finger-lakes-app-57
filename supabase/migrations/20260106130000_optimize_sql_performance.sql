-- Optimize RLS performance by wrapping auth.uid() in (select ...)
-- This prevents the function from being re-evaluated for every row in the result set.

-- 1. Optimize public.profiles "Users can view their own and their friends' profiles" policy
ALTER POLICY "Users can view their own and their friends' profiles" ON public.profiles
USING ((SELECT auth.uid()) = id OR id IN (SELECT friend_id FROM public.get_friends_ids()));

-- 2. Optimize is_trip_member function
CREATE OR REPLACE FUNCTION public.is_trip_member(trip_id_to_check int)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.trips
        WHERE id = trip_id_to_check
          AND ((SELECT auth.uid()) = user_id OR (SELECT auth.uid()) = ANY(members))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Optimize get_map_markers function signature (default value)
CREATE OR REPLACE FUNCTION public.get_map_markers(user_id_param uuid DEFAULT auth.uid())
RETURNS TABLE (
    id integer,
    google_place_id text,
    name text,
    lat numeric,
    lng numeric,
    address text,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude as lat,
        w.longitude as lng,
        w.address,
        EXISTS(SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = user_id_param) as is_favorite,
        EXISTS(SELECT 1 FROM public.wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_id_param) as on_wishlist,
        EXISTS(SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = user_id_param) as user_visited
    FROM
        public.wineries w;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Cleanup redundant indexes (covered by unique constraints on user_id + winery_id)
DROP INDEX IF EXISTS public.idx_favorites_user_id;
DROP INDEX IF EXISTS public.idx_wishlist_user_id;
