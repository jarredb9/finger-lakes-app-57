-- Fix search paths and result types for remaining critical RPCs
-- Migration: 20260305200812_fix_remaining_rpcs_search_path_and_types.sql

-- 1. get_trips_for_date (Fix result type mismatch by explicit casting)
CREATE OR REPLACE FUNCTION public.get_trips_for_date(target_date date)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name text, wineries jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, 
        t.user_id, 
        t.trip_date, 
        t.name::text, -- Explicit cast to match RETURNS TABLE
        COALESCE(jsonb_agg(row_to_json(w_data)) FILTER (WHERE w_data.id IS NOT NULL), '[]'::jsonb) as wineries
    FROM trips t
    LEFT JOIN (
        SELECT 
            tw.trip_id,
            w.id,
            w.google_place_id,
            w.name,
            w.address,
            w.latitude,
            w.longitude,
            tw.visit_order,
            tw.notes
        FROM trip_wineries tw
        JOIN wineries w ON tw.winery_id = w.id
    ) w_data ON t.id = w_data.trip_id
    WHERE t.trip_date = target_date
      AND public.is_trip_member(t.id)
    GROUP BY t.id, t.user_id, t.trip_date, t.name;
END;
$$;

-- 2. get_map_markers (Explicit uid and search path)
CREATE OR REPLACE FUNCTION public.get_map_markers(user_id_param uuid DEFAULT auth.uid())
RETURNS TABLE(
    id integer,
    google_place_id text,
    name text,
    latitude numeric,
    longitude numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean
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
        EXISTS (SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_id_param) as user_visited
    FROM wineries w;
END;
$$;

-- 3. get_friends_and_requests (Explicit uid and search path)
CREATE OR REPLACE FUNCTION public.get_friends_and_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_friends jsonb;
    v_pending_incoming jsonb;
    v_pending_outgoing jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('friends', '[]'::jsonb, 'pending_incoming', '[]'::jsonb, 'pending_outgoing', '[]'::jsonb);
    END IF;

    -- Mutual friends
    SELECT COALESCE(jsonb_agg(row_to_json(f_data)), '[]'::jsonb) INTO v_friends
    FROM (
        SELECT p.id, p.name, p.email, p.privacy_level
        FROM friends f
        JOIN profiles p ON (f.user1_id = p.id OR f.user2_id = p.id)
        WHERE (f.user1_id = v_user_id OR f.user2_id = v_user_id)
          AND p.id != v_user_id
          AND f.status = 'accepted'
    ) f_data;

    -- Pending incoming
    SELECT COALESCE(jsonb_agg(row_to_json(f_data)), '[]'::jsonb) INTO v_pending_incoming
    FROM (
        SELECT p.id, p.name, p.email
        FROM friends f
        JOIN profiles p ON f.user1_id = p.id
        WHERE f.user2_id = v_user_id AND f.status = 'pending'
    ) f_data;

    -- Pending outgoing
    SELECT COALESCE(jsonb_agg(row_to_json(f_data)), '[]'::jsonb) INTO v_pending_outgoing
    FROM (
        SELECT p.id, p.name, p.email
        FROM friends f
        JOIN profiles p ON f.user2_id = p.id
        WHERE f.user1_id = v_user_id AND f.status = 'pending'
    ) f_data;

    RETURN jsonb_build_object(
        'friends', v_friends,
        'pending_incoming', v_pending_incoming,
        'pending_outgoing', v_pending_outgoing
    );
END;
$$;

-- 4. log_visit (Explicit uid and search path)
CREATE OR REPLACE FUNCTION public.log_visit(
    p_winery_data jsonb,
    p_visit_date date,
    p_user_review text,
    p_rating integer,
    p_photos text[] DEFAULT ARRAY[]::text[],
    p_is_private boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_winery_id integer;
    v_visit_id uuid;
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Ensure Winery exists
    INSERT INTO public.wineries (
        google_place_id, name, address, latitude, longitude, 
        phone, website, google_rating
    )
    VALUES (
        p_winery_data->>'id',
        p_winery_data->>'name',
        p_winery_data->>'address',
        (p_winery_data->>'lat')::numeric,
        (p_winery_data->>'lng')::numeric,
        p_winery_data->>'phone',
        p_winery_data->>'website',
        (p_winery_data->>'rating')::numeric
    )
    ON CONFLICT (google_place_id) 
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_winery_id;

    -- 2. Insert Visit
    INSERT INTO public.visits (
        user_id, winery_id, visit_date, user_review, rating, photos, is_private
    )
    VALUES (
        v_user_id, v_winery_id, p_visit_date, p_user_review, p_rating, p_photos, p_is_private
    )
    RETURNING id INTO v_visit_id;

    RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;
