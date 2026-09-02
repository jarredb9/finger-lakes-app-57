-- Migration: 20260902100000_indexes_and_query_optimization.sql
-- Description: Add covering relational indexes, optimize get_map_markers with hash joins, and inline is_visible_to_viewer (BE-06, BE-07, BE-08, BE-09).

-- ============================================================================
-- 1. Covering Foreign Key & Lookup Indexes (BE-06, BE-08)
-- ============================================================================

-- Visits lookup and foreign keys
CREATE INDEX IF NOT EXISTS idx_visits_user_id 
    ON public.visits (user_id);

CREATE INDEX IF NOT EXISTS idx_visits_winery_id 
    ON public.visits (winery_id);

CREATE INDEX IF NOT EXISTS idx_visits_winery_user 
    ON public.visits (winery_id, user_id);

-- Trip wineries lookup
CREATE INDEX IF NOT EXISTS idx_trip_wineries_winery_id 
    ON public.trip_wineries (winery_id);

-- Trip members foreign key lookup
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id 
    ON public.trip_members (user_id);

-- Follows foreign key lookup
CREATE INDEX IF NOT EXISTS idx_follows_following_id 
    ON public.follows (following_id);

-- Wineries name index for search & filtering
CREATE INDEX IF NOT EXISTS idx_wineries_name 
    ON public.wineries (name);

-- Activity ledger composite index for event stream lookups
CREATE INDEX IF NOT EXISTS idx_activity_ledger_type_object 
    ON public.activity_ledger (activity_type, object_id);

-- ============================================================================
-- 2. Refactor get_map_markers RPC with Pre-Filtered Hash Joins (BE-07)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
    id integer,
    google_place_id text,
    name text,
    latitude numeric,
    longitude numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    is_favorite_private boolean,
    on_wishlist_private boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Security Enforcement: Only allow viewing own markers
    IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only view your own map markers.';
    END IF;

    RETURN QUERY
    SELECT 
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude,
        w.longitude,
        (f.winery_id IS NOT NULL) AS is_favorite,
        (wi.winery_id IS NOT NULL) AS on_wishlist,
        (v.winery_id IS NOT NULL) AS user_visited,
        COALESCE(f.is_private, false) AS is_favorite_private,
        COALESCE(wi.is_private, false) AS on_wishlist_private
    FROM public.wineries w
    LEFT JOIN (
        SELECT winery_id, is_private 
        FROM public.favorites 
        WHERE user_id = p_user_id
    ) f ON f.winery_id = w.id
    LEFT JOIN (
        SELECT winery_id, is_private 
        FROM public.wishlist 
        WHERE user_id = p_user_id
    ) wi ON wi.winery_id = w.id
    LEFT JOIN (
        SELECT DISTINCT winery_id 
        FROM public.visits 
        WHERE user_id = p_user_id
    ) v ON v.winery_id = w.id;
END;
$$;

GRANT ALL ON FUNCTION public.get_map_markers(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_map_markers(uuid) FROM anon, public;

-- ============================================================================
-- 3. Inline is_visible_to_viewer to LANGUAGE sql STABLE (BE-09)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(
    p_target_user_id uuid,
    p_is_item_private boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT 
        -- 1. Owner always sees their own items
        (auth.uid() IS NOT NULL AND auth.uid() = p_target_user_id)
        OR
        -- 2. Non-owner visibility check (item must not be marked private)
        (
            NOT COALESCE(p_is_item_private, false)
            AND
            EXISTS (
                SELECT 1 FROM public.profiles pr
                WHERE pr.id = p_target_user_id
                  AND (
                      pr.privacy_level = 'public'
                      OR (
                          pr.privacy_level = 'friends_only'
                          AND auth.uid() IS NOT NULL
                          AND (
                              EXISTS (
                                  SELECT 1 FROM public.friends f
                                  WHERE f.status = 'accepted'
                                    AND ((f.user1_id = auth.uid() AND f.user2_id = p_target_user_id)
                                      OR (f.user2_id = auth.uid() AND f.user1_id = p_target_user_id))
                              )
                              OR EXISTS (
                                  SELECT 1 FROM public.follows fl
                                  WHERE fl.follower_id = auth.uid() AND fl.following_id = p_target_user_id
                              )
                          )
                      )
                  )
            )
        );
$$;

GRANT EXECUTE ON FUNCTION public.is_visible_to_viewer(uuid, boolean) TO authenticated, anon, service_role;

-- Update RLS policies to call the STABLE SQL function directly without scalar subquery wrapper
DROP POLICY IF EXISTS "Users can view visits based on privacy settings" ON public.visits;
CREATE POLICY "Users can view visits based on privacy settings" 
ON public.visits 
FOR SELECT 
USING (public.is_visible_to_viewer(visits.user_id, visits.is_private));

DROP POLICY IF EXISTS "Users can view favorites based on privacy settings" ON public.favorites;
CREATE POLICY "Users can view favorites based on privacy settings" 
ON public.favorites 
FOR SELECT 
USING (public.is_visible_to_viewer(favorites.user_id, favorites.is_private));

DROP POLICY IF EXISTS "Users can view wishlist items based on privacy settings" ON public.wishlist;
CREATE POLICY "Users can view wishlist items based on privacy settings" 
ON public.wishlist 
FOR SELECT 
USING (public.is_visible_to_viewer(wishlist.user_id, wishlist.is_private));

DROP POLICY IF EXISTS "Users can view activities based on privacy settings" ON public.activity_ledger;
CREATE POLICY "Users can view activities based on privacy settings" 
ON public.activity_ledger 
FOR SELECT 
USING (public.is_visible_to_viewer(activity_ledger.user_id, (activity_ledger.privacy_level = 'private')));

DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
CREATE POLICY "Profiles are viewable based on privacy settings" 
ON public.profiles 
FOR SELECT 
USING (public.is_visible_to_viewer(profiles.id, false));
