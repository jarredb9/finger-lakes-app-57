-- Migration: 20261007090000_enrich_map_markers_rpc.sql
-- Description: Expand get_map_markers RPC with ratings, review count, Vibe Tag columns, and enrichment tier (Issue #44)

-- Safe transaction migration: Drop existing function and recreate with expanded RETURNS TABLE signature
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);

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
    on_wishlist_private boolean,
    google_rating numeric,
    user_rating_count integer,
    allows_dogs boolean,
    good_for_children boolean,
    outdoor_seating boolean,
    has_ev_charging boolean,
    enrichment_tier text
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
        COALESCE(wi.is_private, false) AS on_wishlist_private,
        w.google_rating,
        w.user_rating_count,
        w.allows_dogs,
        w.good_for_children,
        w.outdoor_seating,
        w.has_ev_charging,
        COALESCE(w.enrichment_tier, 'basic')::text AS enrichment_tier
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

ALTER FUNCTION public.get_map_markers(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_map_markers(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_map_markers(uuid) FROM anon, public;
