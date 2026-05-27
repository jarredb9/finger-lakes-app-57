-- Migration: 20260527130000_standardize_rpc_parameter_names.sql
-- Goal: Standardize all RPC parameter names to use the 'p_' prefix.
-- Also add missing overloads and ensure 'search_path' is set for security.

-- 1. add_winery_to_trip (Add overload for winery_id)
-- Existing one takes (integer, jsonb, text)
-- New overload takes (integer, integer, text)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(p_trip_id integer, p_winery_id integer, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_max_order integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Get max order
  SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
  FROM public.trip_wineries
  WHERE trip_id = p_trip_id;

  -- Insert into Trip Wineries
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (p_trip_id, p_winery_id, v_max_order + 1, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', p_winery_id);
END;
$$;

-- 2. get_friend_activity_feed (limit_val -> p_limit)
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_feed jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          al.activity_type,
          al.created_at,
          al.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          COALESCE(p.email, 'unknown')::text as user_email,
          (al.metadata->>'winery_id')::integer as winery_id,
          (al.metadata->>'winery_name')::text as winery_name,
          (al.metadata->>'rating')::integer as visit_rating,
          (al.metadata->>'user_review')::text as visit_review,
          CASE 
            WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
            ELSE ARRAY[]::text[]
          END as visit_photos
        FROM public.activity_ledger al
        LEFT JOIN public.profiles p ON al.user_id = p.id
        WHERE 
          al.user_id != v_user_id 
          AND (
            EXISTS (
              SELECT 1 FROM public.friends f
              WHERE f.status = 'accepted'
                AND (
                  (f.user1_id = v_user_id AND f.user2_id = al.user_id)
                  OR
                  (f.user2_id = v_user_id AND f.user1_id = al.user_id)
                )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = al.user_id
            )
          )
        ORDER BY al.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

-- 3. get_friend_profile_with_visits (friend_id_param -> p_friend_id)
DROP FUNCTION IF EXISTS public.get_friend_profile_with_visits(uuid);
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile jsonb;
    v_viewer_id uuid := auth.uid();
BEGIN
    -- 1. Check if the viewer is allowed to see the profile at all
    IF NOT public.is_visible_to_viewer(p_friend_id, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- 2. Build the profile object
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            -- Only return visits visible to the current viewer
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'winery', jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude,
                        'lat', w.latitude,
                        'lng', w.longitude
                    )
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM public.visits v
            JOIN public.wineries w ON v.winery_id = w.id
            WHERE v.user_id = p_friend_id 
              AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
        ),
        'stats', (
            SELECT jsonb_build_object(
                'visit_count', (
                    SELECT count(*)::int 
                    FROM public.visits v 
                    WHERE v.user_id = p_friend_id 
                      AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
                ),
                'wishlist_count', (
                    SELECT count(*)::int 
                    FROM public.wishlist wl 
                    WHERE wl.user_id = p_friend_id 
                      AND (wl.user_id = v_viewer_id OR public.is_visible_to_viewer(wl.user_id, wl.is_private))
                ),
                'favorite_count', (
                    SELECT count(*)::int 
                    FROM public.favorites f 
                    WHERE f.user_id = p_friend_id 
                      AND (f.user_id = v_viewer_id OR public.is_visible_to_viewer(f.user_id, f.is_private))
                )
            )
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_friend_id;

    RETURN v_profile;
END;
$$;

-- 4. get_friends_activity_for_winery (winery_id_param -> p_winery_id)
DROP FUNCTION IF EXISTS public.get_friends_activity_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(p_winery_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_favorited_by json;
    v_wishlisted_by json;
BEGIN
    -- Get friends who favorited this winery from the ledger
    SELECT json_agg(row_to_json(f_data))
    INTO v_favorited_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'favorite'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND (
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
            )
          )
    ) f_data;

    -- Get friends who wishlisted this winery from the ledger
    SELECT json_agg(row_to_json(w_data))
    INTO v_wishlisted_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'wishlist'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND (
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
            )
          )
    ) w_data;

    RETURN json_build_object(
        'favoritedBy', COALESCE(v_favorited_by, '[]'::json),
        'wishlistedBy', COALESCE(v_wishlisted_by, '[]'::json)
    );
END;
$$;

-- 5. get_friends_ratings_for_winery (winery_id_param -> p_winery_id)
DROP FUNCTION IF EXISTS public.get_friends_ratings_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(p_winery_id integer)
RETURNS TABLE(user_id uuid, name text, email text, rating integer, user_review text, photos text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    RETURN QUERY
    SELECT 
        p.id as user_id,
        COALESCE(p.name, 'Friend')::text as name,
        COALESCE(p.email, 'hidden')::text as email,
        (al.metadata->>'rating')::integer as rating,
        (al.metadata->>'user_review')::text as user_review,
        CASE 
          WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
          ELSE ARRAY[]::text[]
        END as photos
    FROM public.activity_ledger al
    JOIN public.profiles p ON al.user_id = p.id
    WHERE al.activity_type = 'visit'
      AND (al.metadata->>'winery_id')::integer = p_winery_id
      AND al.user_id != v_user_id
      -- Social check
      AND (
        EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
        )
        OR
        EXISTS (
          SELECT 1 FROM public.follows fol
          WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
        )
      )
    ORDER BY al.created_at DESC;
END;
$$;

-- 6. get_map_markers (user_id_param -> p_user_id)
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);
CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id integer, google_place_id text, name text, latitude numeric, longitude numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, is_favorite_private boolean, on_wishlist_private boolean)
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
        EXISTS (SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id) as is_favorite,
        EXISTS (SELECT 1 FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id) as on_wishlist,
        EXISTS (SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = p_user_id) as user_visited,
        COALESCE((SELECT f.is_private FROM favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id), false) as on_wishlist_private
    FROM wineries w;
END;
$$;

-- 7. get_paginated_trips_with_wineries (trip_type, page_number, page_size -> p_trip_type, p_page_number, p_page_size)
DROP FUNCTION IF EXISTS public.get_paginated_trips_with_wineries(text, integer, integer);
CREATE OR REPLACE FUNCTION public.get_paginated_trips_with_wineries(p_trip_type text, p_page_number integer, p_page_size integer)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name character varying, created_at timestamp with time zone, wineries jsonb, total_count bigint)
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
    _total_count bigint;
BEGIN
    -- Calculate total count first
    SELECT COUNT(t.id)
    INTO _total_count
    FROM public.trips t
    WHERE public.is_trip_member(t.id)
      AND CASE
            WHEN p_trip_type = 'upcoming' THEN t.trip_date >= CURRENT_DATE
            WHEN p_trip_type = 'past' THEN t.trip_date < CURRENT_DATE
            ELSE TRUE 
          END;

    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.google_place_id,
                    'dbId', w.id,
                    'name', w.name,
                    'address', w.address,
                    'lat', w.latitude,
                    'lng', w.longitude,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'rating', w.google_rating,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ), '[]'::jsonb) as wineries,
        _total_count
    FROM trips t
    WHERE public.is_trip_member(t.id)
      AND CASE
            WHEN p_trip_type = 'upcoming' THEN t.trip_date >= CURRENT_DATE
            WHEN p_trip_type = 'past' THEN t.trip_date < CURRENT_DATE
            ELSE TRUE
          END
    ORDER BY
        CASE WHEN p_trip_type = 'upcoming' THEN t.trip_date END ASC,
        CASE WHEN p_trip_type = 'past' THEN t.trip_date END DESC
    OFFSET (p_page_number - 1) * p_page_size
    LIMIT p_page_size;
END;
$$;

-- 8. get_paginated_visits_with_winery_and_friends (page_number, page_size -> p_page_number, p_page_size)
DROP FUNCTION IF EXISTS public.get_paginated_visits_with_winery_and_friends(integer, integer);
CREATE OR REPLACE FUNCTION public.get_paginated_visits_with_winery_and_friends(p_page_number integer, p_page_size integer)
RETURNS TABLE(visit_id integer, visit_date date, user_review text, rating integer, photos text[], winery_id integer, winery_name character varying, winery_address text, google_place_id character varying, friend_visits jsonb, latitude numeric, longitude numeric)
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    WITH user_and_friends_visits AS (
        SELECT
            v.id as visit_id,
            v.visit_date,
            v.user_review,
            v.rating,
            v.photos,
            v.winery_id,
            w.name as winery_name,
            w.address as winery_address,
            w.google_place_id,
            v.user_id,
            w.latitude,
            w.longitude
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        WHERE v.user_id = auth.uid() OR v.user_id IN (SELECT friend_id FROM get_friends_ids())
    ),
    aggregated_friend_visits AS (
        SELECT
            fv.winery_id,
            fv.visit_date,
            jsonb_agg(jsonb_build_object(
                'user_id', fv.user_id,
                'name', p.name,
                'rating', fv.rating,
                'user_review', fv.user_review
            )) as friend_visits
        FROM user_and_friends_visits fv
        JOIN profiles p ON fv.user_id = p.id
        WHERE fv.user_id != auth.uid()
        GROUP BY fv.winery_id, fv.visit_date
    )
    SELECT
        uv.visit_id,
        uv.visit_date,
        uv.user_review,
        uv.rating,
        uv.photos,
        uv.winery_id,
        uv.winery_name,
        uv.winery_address,
        uv.google_place_id,
        afv.friend_visits,
        uv.latitude,
        uv.longitude
    FROM user_and_friends_visits uv
    LEFT JOIN aggregated_friend_visits afv ON uv.winery_id = afv.winery_id AND uv.visit_date = afv.visit_date
    WHERE uv.user_id = auth.uid()
    ORDER BY uv.visit_date DESC, uv.visit_id DESC
    LIMIT p_page_size
    OFFSET (p_page_number - 1) * p_page_size;
END;
$$;

-- 9. get_trip_by_id_with_wineries (trip_id_param -> p_trip_id)
DROP FUNCTION IF EXISTS public.get_trip_by_id_with_wineries(integer);
CREATE OR REPLACE FUNCTION public.get_trip_by_id_with_wineries(p_trip_id integer)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name character varying, created_at timestamp with time zone, wineries jsonb)
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.user_id,
        t.trip_date,
        t.name,
        t.created_at,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.google_place_id,
                    'dbId', w.id,
                    'name', w.name,
                    'address', w.address,
                    'lat', w.latitude,
                    'lng', w.longitude,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'rating', w.google_rating,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order
                ) ORDER BY tw.visit_order
            )
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = t.id
        ), '[]'::jsonb) as wineries
    FROM trips t
    WHERE t.id = p_trip_id
      AND public.is_trip_member(t.id);
END;
$$;

-- 10. get_trip_details (trip_id_param -> p_trip_id)
DROP FUNCTION IF EXISTS public.get_trip_details(integer);
CREATE OR REPLACE FUNCTION public.get_trip_details(p_trip_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid;
    v_trip_record record;
    v_result jsonb;
    v_is_member boolean;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Fetch main trip record
    SELECT * INTO v_trip_record
    FROM public.trips
    WHERE id = p_trip_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found (ID: %)', p_trip_id;
    END IF;

    -- 2. Verify access
    v_is_member := public.is_trip_member(p_trip_id);
    
    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Access denied for trip % (User: %)', p_trip_id, COALESCE(v_user_id::text, 'NULL');
    END IF;

    -- 3. Assemble result
    SELECT jsonb_build_object(
        'id', v_trip_record.id,
        'user_id', v_trip_record.user_id,
        'trip_date', v_trip_record.trip_date,
        'name', v_trip_record.name,
        'updated_at', v_trip_record.updated_at,
        'members', (
            SELECT COALESCE(jsonb_agg(m_data), '[]'::jsonb)
            FROM (
                SELECT 
                    tm.user_id as id,
                    tm.role,
                    tm.status,
                    p.name,
                    p.email
                FROM public.trip_members tm
                JOIN public.profiles p ON tm.user_id = p.id
                WHERE tm.trip_id = p_trip_id
            ) m_data
        ),
        'wineries', (
            SELECT COALESCE(jsonb_agg(row_to_json(w_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    w.id as "dbId",
                    w.google_place_id as id,
                    w.name,
                    w.address,
                    w.latitude as lat,
                    w.longitude as lng,
                    w.latitude,
                    w.longitude,
                    tw.visit_order,
                    tw.notes,
                    tw.updated_at,
                    (
                        SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
                        FROM (
                            SELECT 
                                v.id,
                                v.visit_date,
                                v.user_review,
                                v.rating,
                                v.user_id,
                                COALESCE(v.photos, ARRAY[]::text[]) as photos,
                                p.name as user_name
                            FROM public.visits v
                            JOIN public.profiles p ON v.user_id = p.id
                            WHERE v.winery_id = w.id
                              AND (
                                  v.user_id = v_trip_record.user_id 
                                  OR 
                                  EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = p_trip_id AND user_id = v.user_id)
                              )
                              AND public.is_visible_to_viewer(v.user_id, v.is_private)
                        ) v_data
                    ) as visits
                FROM public.trip_wineries tw
                JOIN public.wineries w ON tw.winery_id = w.id
                WHERE tw.trip_id = p_trip_id
                ORDER BY tw.visit_order ASC
            ) w_data
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 11. get_trips_for_date (target_date -> p_target_date)
DROP FUNCTION IF EXISTS public.get_trips_for_date(date);
CREATE OR REPLACE FUNCTION public.get_trips_for_date(p_target_date date)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name text, updated_at timestamp with time zone, wineries jsonb)
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
        t.name::text, 
        t.updated_at,
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
            tw.notes,
            tw.updated_at
        FROM trip_wineries tw
        JOIN wineries w ON tw.winery_id = w.id
    ) w_data ON t.id = w_data.trip_id
    WHERE t.trip_date = p_target_date
      AND public.is_trip_member(t.id)
    GROUP BY t.id, t.user_id, t.trip_date, t.name, t.updated_at;
END;
$$;

-- 12. get_wineries_for_trip_planner (trip_date_param -> p_trip_date)
DROP FUNCTION IF EXISTS public.get_wineries_for_trip_planner(date);
CREATE OR REPLACE FUNCTION public.get_wineries_for_trip_planner(p_trip_date date)
RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, trip_id integer, trip_name character varying, trip_date date, visit_order integer, notes text)
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    WITH user_trips AS (
        SELECT t.id, t.name, t.trip_date
        FROM public.trips t
        WHERE t.user_id = auth.uid() AND t.trip_date = p_trip_date
    ),
    wineries_in_trips AS (
        SELECT
            tw.winery_id,
            ut.id as trip_id,
            ut.name as trip_name,
            ut.trip_date,
            tw.visit_order,
            tw.notes
        FROM public.trip_wineries tw
        JOIN user_trips ut ON tw.trip_id = ut.id
    )
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::character varying as phone,
        w.website::character varying as website,
        w.google_rating,
        bool_or(f.user_id IS NOT NULL) as is_favorite,
        bool_or(wl.user_id IS NOT NULL) as on_wishlist,
        bool_or(v.user_id IS NOT NULL) as user_visited,
        wit.trip_id,
        wit.trip_name,
        wit.trip_date,
        wit.visit_order,
        wit.notes
    FROM public.wineries w
    JOIN wineries_in_trips wit ON w.id = wit.winery_id
    LEFT JOIN public.favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN public.wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN public.visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id, wit.trip_id, wit.trip_name, wit.trip_date, wit.visit_order, wit.notes;
END;
$$;

-- 13. get_wineries_in_bounds (min_lat, min_lng, max_lat, max_lng -> p_min_latitude, p_min_longitude, p_max_latitude, p_max_longitude)
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_wineries_in_bounds(
    p_min_latitude double precision, 
    p_min_longitude double precision, 
    p_max_latitude double precision, 
    p_max_longitude double precision
) 
RETURNS SETOF public.wineries
LANGUAGE sql STABLE
SET search_path = public, auth
AS $$
  SELECT *
  FROM wineries
  WHERE
    latitude >= p_min_latitude AND
    latitude <= p_max_latitude AND
    longitude >= p_min_longitude AND
    longitude <= p_max_longitude;
$$;

-- 14. get_winery_details (winery_id_param -> p_winery_id)
DROP FUNCTION IF EXISTS public.get_winery_details(integer);
CREATE OR REPLACE FUNCTION public.get_winery_details(p_winery_id integer)
RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, visits jsonb)
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
DECLARE
    v_visits jsonb;
BEGIN
    SELECT jsonb_agg(v_agg)
    INTO v_visits
    FROM (
        SELECT v.id, v.visit_date, v.user_review, v.rating, v.photos
        FROM public.visits v
        WHERE v.winery_id = p_winery_id AND v.user_id = auth.uid()
        ORDER BY v.visit_date DESC
    ) AS v_agg;

    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::character varying as phone,
        w.website::character varying as website,
        w.google_rating,
        f.user_id IS NOT NULL AS is_favorite,
        wl.user_id IS NOT NULL AS on_wishlist,
        v_visits IS NOT NULL AND jsonb_array_length(v_visits) > 0 AS user_visited,
        v_visits AS visits
    FROM public.wineries w
    LEFT JOIN public.favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN public.wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    WHERE w.id = p_winery_id;
END;
$$;

-- 15. get_winery_details_by_id (winery_id_param -> p_winery_id)
DROP FUNCTION IF EXISTS public.get_winery_details_by_id(integer);
CREATE OR REPLACE FUNCTION public.get_winery_details_by_id(p_winery_id integer)
RETURNS TABLE(id integer, google_place_id text, name text, address text, lat numeric, lng numeric, latitude numeric, longitude numeric, phone text, website text, google_rating numeric, opening_hours jsonb, reviews jsonb, reservable boolean, is_favorite boolean, on_wishlist boolean, user_visited boolean, is_favorite_private boolean, on_wishlist_private boolean, visits jsonb, trip_info jsonb)
LANGUAGE plpgsql SECURITY DEFINER
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
        w.latitude,
        w.longitude,
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
        w.id = p_winery_id;
END;
$$;

-- 16. is_trip_member (trip_id_to_check -> p_trip_id)
-- We need to drop and recreate policies that depend on this function
DROP POLICY IF EXISTS "Members can add wineries to a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can remove wineries from a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can update wineries on a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can view trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;

DROP FUNCTION IF EXISTS public.is_trip_member(integer);
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id = p_trip_id
          AND t.user_id = v_user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = p_trip_id
          AND tm.user_id = v_user_id
    );
END;
$$;

-- Recreate policies for is_trip_member
CREATE POLICY "Members can add wineries to a trip" ON "public"."trip_wineries" FOR INSERT WITH CHECK ("public"."is_trip_member"("trip_id"));
CREATE POLICY "Members can remove wineries from a trip" ON "public"."trip_wineries" FOR DELETE USING ("public"."is_trip_member"("trip_id"));
CREATE POLICY "Members can update wineries on a trip" ON "public"."trip_wineries" FOR UPDATE USING ("public"."is_trip_member"("trip_id"));
CREATE POLICY "Members can view trip wineries" ON "public"."trip_wineries" FOR SELECT USING ("public"."is_trip_member"("trip_id"));
CREATE POLICY "Users can view members of trips they belong to" ON "public"."trip_members" FOR SELECT USING ("public"."is_trip_member"("trip_id"));


-- 17. remove_friend (target_friend_id -> p_target_friend_id)
DROP FUNCTION IF EXISTS public.remove_friend(uuid);
CREATE OR REPLACE FUNCTION public.remove_friend(p_target_friend_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM friends
  WHERE (user1_id = current_user_id AND user2_id = p_target_friend_id)
     OR (user1_id = p_target_friend_id AND user2_id = current_user_id);
END;
$$;

-- 18. respond_to_friend_request (requester_id, accept -> p_requester_id, p_accept)
DROP FUNCTION IF EXISTS public.respond_to_friend_request(uuid, boolean);
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(p_requester_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id uuid;
  new_status text;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_accept THEN
    new_status := 'accepted';
  ELSE
    new_status := 'declined';
  END IF;

  UPDATE friends
  SET status = new_status,
      updated_at = NOW()
  WHERE user1_id = p_requester_id
    AND user2_id = current_user_id
    AND status = 'pending';
END;
$$;

-- 19. search_wineries_by_name_and_location (search_query, user_lat, user_lng -> p_search_query, p_user_latitude, p_user_longitude)
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision);
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.search_wineries_by_name_and_location(
    p_search_query text, 
    p_user_latitude double precision, 
    p_user_longitude double precision
) 
RETURNS TABLE(id integer, google_place_id text, name character varying, address text, latitude numeric, longitude numeric, phone character varying, website character varying, google_rating numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, distance_meters double precision)
LANGUAGE plpgsql
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN QUERY
    WITH winery_matches AS (
        SELECT
            w.id,
            w.google_place_id,
            w.name,
            w.address,
            w.latitude,
            w.longitude,
            w.phone,
            w.website,
            w.google_rating,
            bool_or(f.user_id IS NOT NULL) as is_favorite,
            bool_or(wl.user_id IS NOT NULL) as on_wishlist,
            bool_or(v.user_id IS NOT NULL) as user_visited
        FROM public.wineries w
        LEFT JOIN public.favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
        LEFT JOIN public.wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
        LEFT JOIN public.visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
        WHERE w.name ILIKE '%' || p_search_query || '%'
        GROUP BY w.id
    )
    SELECT
        wm.*,
        extensions.ST_Distance(
            extensions.ST_MakePoint(wm.longitude::double precision, wm.latitude::double precision)::extensions.geography,
            extensions.ST_MakePoint(p_user_longitude, p_user_latitude)::extensions.geography
        ) as distance_meters
    FROM winery_matches wm
    ORDER BY distance_meters;
END;
$$;

-- 20. send_friend_request (target_email -> p_target_email)
DROP FUNCTION IF EXISTS public.send_friend_request(text);
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id uuid;
  v_target_user_id uuid;
  existing_request record;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_target_user_id
  FROM profiles
  WHERE email ILIKE TRIM(p_target_email);

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_target_user_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  SELECT * INTO existing_request
  FROM friends
  WHERE (user1_id = current_user_id AND user2_id = v_target_user_id)
     OR (user1_id = v_target_user_id AND user2_id = current_user_id)
  LIMIT 1;

  IF existing_request.id IS NOT NULL THEN
    IF existing_request.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends.';
    ELSIF existing_request.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent or pending.';
    ELSE
      UPDATE friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = v_target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO friends (user1_id, user2_id, status)
  VALUES (current_user_id, v_target_user_id, 'pending');
END;
$$;

-- 21. upsert_wineries_from_search (wineries_data -> p_wineries_data)
DROP FUNCTION IF EXISTS public.upsert_wineries_from_search(jsonb[]);
CREATE OR REPLACE FUNCTION public.upsert_wineries_from_search(p_wineries_data jsonb[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  winery_record jsonb;
BEGIN
  FOREACH winery_record IN ARRAY p_wineries_data
  LOOP
    INSERT INTO wineries (
      google_place_id,
      name,
      address,
      latitude,
      longitude,
      google_rating
    )
    VALUES (
      winery_record->>'google_place_id',
      winery_record->>'name',
      winery_record->>'address',
      (winery_record->>'latitude')::double precision,
      (winery_record->>'longitude')::double precision,
      (winery_record->>'google_rating')::double precision
    )
    ON CONFLICT (google_place_id) 
    DO UPDATE SET
        google_rating = COALESCE(EXCLUDED.google_rating, wineries.google_rating),
        name = COALESCE(EXCLUDED.name, wineries.name),
        address = COALESCE(EXCLUDED.address, wineries.address),
        latitude = COALESCE(EXCLUDED.latitude, wineries.latitude),
        longitude = COALESCE(EXCLUDED.longitude, wineries.longitude);
  END LOOP;
END;
$$;

-- 22. GRANT EXECUTE to authenticated for changed functions
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_profile_with_visits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_activity_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_map_markers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_trips_with_wineries(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_visits_with_winery_and_friends(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_by_id_with_wineries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trips_for_date(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wineries_for_trip_planner(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wineries_in_bounds(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winery_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winery_details_by_id(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_member(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_wineries_by_name_and_location(text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_wineries_from_search(jsonb[]) TO authenticated;
