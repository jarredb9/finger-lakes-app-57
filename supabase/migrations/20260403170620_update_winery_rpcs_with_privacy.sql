-- Migration: 20260403000000_update_winery_rpcs_with_privacy.sql
-- Update winery-related RPCs to include privacy columns for favorites and wishlist

-- 1. Update get_map_markers
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);
DROP FUNCTION IF EXISTS public.get_map_markers();

CREATE OR REPLACE FUNCTION public.get_map_markers(user_id_param uuid DEFAULT auth.uid())
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
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude,
        w.longitude,
        EXISTS (SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_id_param) as is_favorite,
        EXISTS (SELECT 1 FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = user_id_param) as on_wishlist,
        EXISTS (SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_id_param) as user_visited,
        COALESCE((SELECT f.is_private FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_id_param), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = user_id_param), false) as on_wishlist_private
    FROM wineries w;
END;
$$;

-- 2. Update get_winery_details_by_id
DROP FUNCTION IF EXISTS public.get_winery_details_by_id(integer);

CREATE OR REPLACE FUNCTION public.get_winery_details_by_id(winery_id_param integer)
 RETURNS TABLE(
    id integer, 
    google_place_id text, 
    name text, 
    address text, 
    lat numeric, 
    lng numeric, 
    phone text, 
    website text, 
    google_rating numeric, 
    opening_hours jsonb, 
    reviews jsonb, 
    reservable boolean, 
    is_favorite boolean, 
    on_wishlist boolean, 
    user_visited boolean, 
    is_favorite_private boolean,
    on_wishlist_private boolean,
    visits jsonb, 
    trip_info jsonb
)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth
AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.address,
        w.latitude as lat,
        w.longitude as lng,
        w.phone::text,
        w.website::text,
        w.google_rating,
        w.opening_hours,
        w.reviews,
        w.reservable,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid) as user_visited,
        COALESCE((SELECT f.is_private FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = user_uuid), false) as on_wishlist_private,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'is_private', v.is_private
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM visits v
            WHERE v.winery_id = w.id AND v.user_id = user_uuid
        ) as visits,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'trip_id', t.id,
                    'trip_name', t.name,
                    'trip_date', t.trip_date,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY t.trip_date ASC, tw.visit_order ASC
            ), '[]'::jsonb)
            FROM trip_wineries tw
            JOIN trips t ON tw.trip_id = t.id
            WHERE tw.winery_id = w.id 
            AND (
                t.user_id = user_uuid 
                OR EXISTS (
                    SELECT 1 FROM trip_members tm 
                    WHERE tm.trip_id = t.id AND tm.user_id = user_uuid
                )
            )
            AND t.trip_date >= CURRENT_DATE
        ) as trip_info
    FROM
        wineries w
    WHERE
        w.id = winery_id_param;
END;
$$;
