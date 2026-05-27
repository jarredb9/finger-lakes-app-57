


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";

-- RE-BASELINE: Drop legacy functions and policies to prevent RPC ambiguity
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);
DROP FUNCTION IF EXISTS public.get_friend_profile_with_visits(uuid);
DROP FUNCTION IF EXISTS public.get_friends_activity_for_winery(integer);
DROP FUNCTION IF EXISTS public.get_friends_ratings_for_winery(integer);
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);
DROP FUNCTION IF EXISTS public.get_paginated_trips_with_wineries(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_paginated_visits_with_winery_and_friends(integer, integer);
DROP FUNCTION IF EXISTS public.get_trip_by_id_with_wineries(integer);
DROP FUNCTION IF EXISTS public.get_trip_details(integer);
DROP FUNCTION IF EXISTS public.get_trips_for_date(date);
DROP FUNCTION IF EXISTS public.get_wineries_for_trip_planner(date);
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_winery_details(integer);
DROP FUNCTION IF EXISTS public.get_winery_details_by_id(integer);

DROP POLICY IF EXISTS "Members can add wineries to a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can remove wineries from a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can update wineries on a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can view trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;
DROP FUNCTION IF EXISTS public.is_trip_member(integer);

DROP FUNCTION IF EXISTS public.remove_friend(uuid);
DROP FUNCTION IF EXISTS public.respond_to_friend_request(uuid, boolean);
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision);
DROP FUNCTION IF EXISTS public.search_wineries_by_name_and_location(text, double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.send_friend_request(text);
DROP FUNCTION IF EXISTS public.upsert_wineries_from_search(jsonb[]);






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."privacy_level" AS ENUM (
    'public',
    'friends_only',
    'private'
);


ALTER TYPE "public"."privacy_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_to_wishlist"("p_winery_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_is_private boolean;
BEGIN
  v_is_private := COALESCE((p_winery_data->>'is_private')::boolean, false);

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Insert into Wishlist
  INSERT INTO public.wishlist (user_id, winery_id, is_private)
  VALUES (auth.uid(), v_winery_id, v_is_private)
  ON CONFLICT (user_id, winery_id) 
  DO UPDATE SET is_private = EXCLUDED.is_private;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;


ALTER FUNCTION "public"."add_to_wishlist"("p_winery_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_trip_member_by_email"("p_trip_id" integer, "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_target_user_id uuid;
    v_is_owner boolean;
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Verify caller is the trip owner
    SELECT (user_id = v_user_id) INTO v_is_owner
    FROM public.trips
    WHERE id = p_trip_id;

    IF NOT COALESCE(v_is_owner, FALSE) THEN
        RAISE EXCEPTION 'Only trip owners can add new members';
    END IF;

    -- 2. Find target user by email
    SELECT id INTO v_target_user_id
    FROM public.profiles
    WHERE email ILIKE TRIM(p_email);

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_email;
    END IF;

    -- 3. Add to trip_members
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    VALUES (p_trip_id, v_target_user_id, 'member', 'joined')
    ON CONFLICT (trip_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_user_id);
END;
$$;


ALTER FUNCTION "public"."add_trip_member_by_email"("p_trip_id" integer, "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_max_order integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Upsert Winery
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
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Get max order
  SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
  FROM public.trip_wineries
  WHERE trip_id = p_trip_id;

  -- Insert into Trip Wineries
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (p_trip_id, v_winery_id, v_max_order + 1, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;


ALTER FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_winery_to_trips"("p_winery_id" integer, "p_trip_ids" integer[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_trip_id integer;
    v_max_order integer;
    v_added_count integer := 0;
BEGIN
    -- Loop through each trip ID
    FOREACH v_trip_id IN ARRAY p_trip_ids
    LOOP
        -- 1. Validate membership for this specific trip
        IF public.is_trip_member(v_trip_id) THEN
            -- 2. Get current max order for this trip
            SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
            FROM public.trip_wineries
            WHERE trip_id = v_trip_id;

            -- 3. Insert relationship
            INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order)
            VALUES (v_trip_id, p_winery_id, v_max_order + 1)
            ON CONFLICT (trip_id, winery_id) DO NOTHING;

            v_added_count := v_added_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'trips_processed', array_length(p_trip_ids, 1), 'added_to', v_added_count);
END;
$$;


ALTER FUNCTION "public"."add_winery_to_trips"("p_winery_id" integer, "p_trip_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip"("p_name" "text", "p_trip_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_trip_id integer;
BEGIN
  -- 1. Create Trip
  INSERT INTO public.trips (user_id, trip_date, name)
  VALUES (auth.uid(), p_trip_date, p_name)
  RETURNING id INTO v_trip_id;

  -- 2. Add creator to trip_members join table as owner
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  VALUES (v_trip_id, auth.uid(), 'owner', 'joined')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- 3. Return the new trip record
  RETURN jsonb_build_object(
    'id', v_trip_id,
    'user_id', auth.uid(),
    'trip_date', p_trip_date,
    'name', p_name
  );
END;
$$;


ALTER FUNCTION "public"."create_trip"("p_name" "text", "p_trip_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text" DEFAULT NULL::"text", "p_members" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_trip_id integer;
  v_members uuid[];
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Default members to include creator
  v_members := COALESCE(p_members, ARRAY[v_user_id]);
  -- Ensure creator is in members if p_members was provided but missed creator
  IF NOT (v_user_id = ANY(v_members)) THEN
    v_members := array_append(v_members, v_user_id);
  END IF;

  -- Create Trip
  INSERT INTO public.trips (user_id, trip_date, name)
  VALUES (v_user_id, p_trip_date, p_trip_name)
  RETURNING id INTO v_trip_id;

  -- Add members to trip_members join table
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  SELECT v_trip_id, u_id, 
         CASE WHEN u_id = v_user_id THEN 'owner' ELSE 'member' END,
         'joined'
  FROM unnest(v_members) as u_id
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- Add Winery to Trip
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (v_trip_id, v_winery_id, 0, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('trip_id', v_trip_id, 'winery_id', v_winery_id);
END;
$$;


ALTER FUNCTION "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text", "p_members" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_trip"("p_trip_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    -- 1. Validate authorization (Only owner can delete)
    IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this trip';
    END IF;

    -- 2. Delete relationships
    DELETE FROM public.trip_wineries WHERE trip_id = p_trip_id;
    DELETE FROM public.trip_members WHERE trip_id = p_trip_id;

    -- 3. Delete trip
    DELETE FROM public.trips WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."delete_trip"("p_trip_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_visit"("p_visit_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    DELETE FROM visits
    WHERE id = p_visit_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."delete_visit"("p_visit_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_winery"("p_winery_data" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
BEGIN
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  RETURN v_winery_id;
END;
$$;


ALTER FUNCTION "public"."ensure_winery"("p_winery_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_user_visits_list"() RETURNS TABLE("id" integer, "visit_date" "date", "rating" integer, "user_review" "text", "photos" "text"[], "winery_id" integer, "winery_name" "text", "winery_address" "text", "google_place_id" "text", "latitude" numeric, "longitude" numeric, "lat" numeric, "lng" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.visit_date,
        v.rating,
        v.user_review,
        v.photos,
        w.id as winery_id,
        w.name::text as winery_name,
        w.address,
        w.google_place_id,
        w.latitude,
        w.longitude,
        w.latitude as lat,
        w.longitude as lng
    FROM
        visits v
    JOIN
        wineries w ON v.winery_id = w.id
    WHERE
        v.user_id = auth.uid()
    ORDER BY
        v.visit_date DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_user_visits_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_wineries_with_user_data"() RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
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
        bool_or(f.user_id IS NOT NULL) as is_favorite,
        bool_or(wl.user_id IS NOT NULL) as on_wishlist,
        bool_or(v.user_id IS NOT NULL) as user_visited
    FROM public.wineries w
    LEFT JOIN public.favorites f ON w.id = f.winery_id AND f.user_id = auth.uid()
    LEFT JOIN public.wishlist wl ON w.id = wl.winery_id AND wl.user_id = auth.uid()
    LEFT JOIN public.visits v ON w.id = v.winery_id AND v.user_id = auth.uid()
    GROUP BY w.id;
END;
$$;


ALTER FUNCTION "public"."get_all_wineries_with_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friend_activity_feed"("p_limit" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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
          -- Privacy Check: Must be visible to viewer
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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


ALTER FUNCTION "public"."get_friend_activity_feed"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friend_profile_with_visits"("p_friend_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_friend_profile_with_visits"("p_friend_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_activity_for_winery"("p_winery_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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
          -- Privacy Check
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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
          -- Privacy Check
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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


ALTER FUNCTION "public"."get_friends_activity_for_winery"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_and_requests"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_friends_and_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_ids"() RETURNS TABLE("friend_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN user1_id = auth.uid() THEN user2_id
            ELSE user1_id
        END
    FROM
        public.friends
    WHERE
        (user1_id = auth.uid() OR user2_id = auth.uid()) AND status = 'accepted';
END;
$$;


ALTER FUNCTION "public"."get_friends_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friends_ratings_for_winery"("p_winery_id" integer) RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "rating" integer, "user_review" "text", "photos" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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
      -- Privacy Check
      AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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


ALTER FUNCTION "public"."get_friends_ratings_for_winery"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_map_markers"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("id" integer, "google_place_id" "text", "name" "text", "latitude" numeric, "longitude" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "is_favorite_private" boolean, "on_wishlist_private" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    -- Security Enforcement: Only allow viewing own markers
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only view your own map markers.';
    END IF;

    RETURN QUERY
    SELECT 
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude,
        w.longitude,
        EXISTS (SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id) as is_favorite,
        EXISTS (SELECT 1 FROM public.wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id) as on_wishlist,
        EXISTS (SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = p_user_id) as user_visited,
        COALESCE((SELECT f.is_private FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM public.wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id), false) as on_wishlist_private
    FROM public.wineries w;
END;
$$;


ALTER FUNCTION "public"."get_map_markers"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_paginated_trips_with_wineries"("p_trip_type" "text", "p_page_number" integer, "p_page_size" integer) RETURNS TABLE("id" integer, "user_id" "uuid", "trip_date" "date", "name" character varying, "created_at" timestamp with time zone, "wineries" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_paginated_trips_with_wineries"("p_trip_type" "text", "p_page_number" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_paginated_visits_with_winery_and_friends"("p_page_number" integer, "p_page_size" integer) RETURNS TABLE("visit_id" integer, "visit_date" "date", "user_review" "text", "rating" integer, "photos" "text"[], "winery_id" integer, "winery_name" character varying, "winery_address" "text", "google_place_id" "text", "friend_visits" "jsonb", "latitude" numeric, "longitude" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_paginated_visits_with_winery_and_friends"("p_page_number" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_paginated_wineries"("p_page" integer DEFAULT 1, "p_limit" integer DEFAULT 20) RETURNS TABLE("id" integer, "google_place_id" "text", "name" "text", "address" "text", "latitude" numeric, "longitude" numeric, "phone" "text", "website" "text", "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_total_count bigint;
BEGIN
    -- 1. Get total count
    SELECT COUNT(*) INTO v_total_count FROM wineries;

    -- 2. Return paginated rows with flags
    RETURN QUERY
    SELECT
        w.id,
        w.google_place_id,
        w.name::text,
        w.address,
        w.latitude,
        w.longitude,
        w.phone::text,
        w.website::text,
        w.google_rating,
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = v_user_id) as is_favorite,
        EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = v_user_id) as on_wishlist,
        EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = v_user_id) as user_visited,
        v_total_count
    FROM
        wineries w
    ORDER BY
        w.name ASC
    LIMIT p_limit
    OFFSET (p_page - 1) * p_limit;
END;
$$;


ALTER FUNCTION "public"."get_paginated_wineries"("p_page" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trip_by_id_with_wineries"("p_trip_id" integer) RETURNS TABLE("id" integer, "user_id" "uuid", "trip_date" "date", "name" character varying, "created_at" timestamp with time zone, "wineries" "jsonb")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_trip_by_id_with_wineries"("p_trip_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trip_details"("p_trip_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_trip_details"("p_trip_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trips_for_date"("p_target_date" "date") RETURNS TABLE("id" integer, "user_id" "uuid", "trip_date" "date", "name" "text", "updated_at" timestamp with time zone, "wineries" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_trips_for_date"("p_target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_dashboard"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'profile', (
            SELECT to_jsonb(p) - 'email' FROM profiles p WHERE p.id = v_user_id
        ),
        'friend_requests_received', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'requester_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'friend_requests_sent', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', f.id,
                    'receiver_id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        ),
        'upcoming_trips', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'trip_date', t.trip_date
                )
            ORDER BY t.trip_date ASC), '[]'::jsonb)
            FROM trips t
            WHERE (
                t.user_id = v_user_id 
                OR EXISTS (
                    SELECT 1 FROM trip_members tm 
                    WHERE tm.trip_id = t.id AND tm.user_id = v_user_id
                )
            ) 
            AND t.trip_date >= CURRENT_DATE
        ),
        'recent_visits', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'winery_id', v.winery_id,
                    'winery_name', w.name,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'latitude', w.latitude,
                    'longitude', w.longitude,
                    'lat', w.latitude,
                    'lng', w.longitude
                )
            ORDER BY v.visit_date DESC), '[]'::jsonb)
            FROM visits v
            JOIN wineries w ON v.winery_id = w.id
            WHERE v.user_id = v_user_id
            LIMIT 5 
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_user_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_winery_data_aggregated"() RETURNS TABLE("wineries_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    user_uuid uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', w.google_place_id,
                'dbId', w.id,
                'name', w.name,
                'address', w.address,
                'latitude', w.latitude,
                'longitude', w.longitude,
                'lat', w.latitude,
                'lng', w.longitude,
                'phone', w.phone,
                'website', w.website,
                'rating', w.google_rating,
                'isFavorite', EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid),
                'onWishlist', EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid),
                'userVisited', EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid),
                'visits', (
                    SELECT COALESCE(jsonb_agg(
                        jsonb_build_object(
                            'id', v.id,
                            'visit_date', v.visit_date,
                            'rating', v.rating,
                            'user_review', v.user_review,
                            'photos', v.photos
                        ) ORDER BY v.visit_date DESC
                    ), '[]'::jsonb)
                    FROM visits v
                    WHERE v.winery_id = w.id AND v.user_id = user_uuid
                ),
                'tripInfo', (
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
                    AND t.trip_date >= CURRENT_DATE -- Only upcoming trips
                )
            )
        ), '[]'::jsonb)
    FROM
        wineries w
    WHERE
        -- Filter for wineries relevant to the current user
        EXISTS(SELECT 1 FROM favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid)
        OR EXISTS(SELECT 1 FROM trip_wineries tw JOIN trips t ON tw.trip_id = t.id
                  WHERE tw.winery_id = w.id 
                  AND (
                      t.user_id = user_uuid 
                      OR EXISTS (
                          SELECT 1 FROM trip_members tm 
                          WHERE tm.trip_id = t.id AND tm.user_id = user_uuid
                      )
                  )
                  AND t.trip_date >= CURRENT_DATE);
END;
$$;


ALTER FUNCTION "public"."get_user_winery_data_aggregated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_wineries_for_trip_planner"("p_trip_date" "date") RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "trip_id" integer, "trip_name" character varying, "trip_date" "date", "visit_order" integer, "notes" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_wineries_for_trip_planner"("p_trip_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."wineries" (
    "id" integer NOT NULL,
    "google_place_id" "text",
    "name" character varying(255) NOT NULL,
    "address" "text" NOT NULL,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "phone" "text",
    "website" "text",
    "google_rating" numeric(2,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "opening_hours" "jsonb",
    "reviews" "jsonb",
    "reservable" boolean
);


ALTER TABLE "public"."wineries" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_wineries_in_bounds"("p_min_latitude" double precision, "p_min_longitude" double precision, "p_max_latitude" double precision, "p_max_longitude" double precision) RETURNS SETOF "public"."wineries"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT *
  FROM wineries
  WHERE
    latitude >= p_min_latitude AND
    latitude <= p_max_latitude AND
    longitude >= p_min_longitude AND
    longitude <= p_max_longitude;
$$;


ALTER FUNCTION "public"."get_wineries_in_bounds"("p_min_latitude" double precision, "p_min_longitude" double precision, "p_max_latitude" double precision, "p_max_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_winery_details"("p_winery_id" integer) RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "visits" "jsonb")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_winery_details"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_winery_details_by_id"("p_winery_id" integer) RETURNS TABLE("id" integer, "google_place_id" "text", "name" "text", "address" "text", "lat" numeric, "lng" numeric, "latitude" numeric, "longitude" numeric, "phone" "text", "website" "text", "google_rating" numeric, "opening_hours" "jsonb", "reviews" "jsonb", "reservable" boolean, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "is_favorite_private" boolean, "on_wishlist_private" boolean, "visits" "jsonb", "trip_info" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_winery_details_by_id"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_activity_ledger_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_winery_name text;
    v_winery_id integer;
    v_winery_latitude numeric;
    v_winery_longitude numeric;
    v_privacy_level text;
    v_user_privacy text;
BEGIN
    -- Determine privacy level
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get user's default privacy level as a fallback
        SELECT privacy_level::text INTO v_user_privacy FROM public.profiles WHERE id = NEW.user_id;
        
        IF NEW.is_private THEN
            v_privacy_level := 'private';
        ELSIF v_user_privacy = 'friends_only' THEN
            v_privacy_level := 'friends_only';
        ELSE
            v_privacy_level := 'public';
        END IF;

        -- Get winery details for metadata
        SELECT id, name, latitude, longitude 
        INTO v_winery_id, v_winery_name, v_winery_latitude, v_winery_longitude 
        FROM public.wineries 
        WHERE id = NEW.winery_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'visits' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'visit', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'favorite', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'wishlist', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                ),
                NEW.created_at
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Update existing ledger entry using table-specific logic to avoid field access errors
        IF TG_TABLE_NAME = 'visits' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                )
            WHERE activity_type = 'visit' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                )
            WHERE activity_type = 'favorite' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            UPDATE public.activity_ledger
            SET 
                privacy_level = v_privacy_level,
                metadata = jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'latitude', v_winery_latitude,
                    'longitude', v_winery_longitude,
                    'lat', v_winery_latitude,
                    'lng', v_winery_longitude
                )
            WHERE activity_type = 'wishlist' AND object_id = OLD.id::text;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        -- Remove ledger entry using table-specific logic
        IF TG_TABLE_NAME = 'visits' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'visit' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'favorite' AND object_id = OLD.id::text;
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            DELETE FROM public.activity_ledger WHERE activity_type = 'wishlist' AND object_id = OLD.id::text;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."handle_activity_ledger_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (new.id, new.raw_user_meta_data->>'name', new.email);
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_member"("p_trip_id" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."is_trip_member"("p_trip_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_visible_to_viewer"("p_target_user_id" "uuid", "p_is_item_private" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_target_privacy public.privacy_level;
BEGIN
    -- 1. Owner can always see their own
    IF v_viewer_id IS NOT NULL AND v_viewer_id = p_target_user_id THEN
        RETURN TRUE;
    END IF;

    -- 2. If the item itself is private, no one else can see it
    IF COALESCE(p_is_item_private, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- 3. Get target profile privacy
    SELECT privacy_level INTO v_target_privacy FROM public.profiles WHERE id = p_target_user_id;

    -- 4. Profile-level privacy handling
    
    -- If target is private, only owner can see (already handled in step 1)
    IF v_target_privacy = 'private' THEN
        RETURN FALSE;
    END IF;

    -- If target is public, anyone can see non-private items
    IF v_target_privacy = 'public' THEN
        RETURN TRUE;
    END IF;

    -- If target is friends_only, MUST be authenticated and a friend/follower
    IF v_target_privacy = 'friends_only' THEN
        IF v_viewer_id IS NULL THEN
            RETURN FALSE;
        END IF;

        RETURN EXISTS (
            -- Check mutual friendship
            SELECT 1 FROM public.friends
            WHERE status = 'accepted'
              AND (
                (user1_id = v_viewer_id AND user2_id = p_target_user_id)
                OR
                (user2_id = v_viewer_id AND user1_id = p_target_user_id)
              )
        ) OR EXISTS (
            -- Check asymmetric follow
            SELECT 1 FROM public.follows
            WHERE follower_id = v_viewer_id AND following_id = p_target_user_id
        );
    END IF;

    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."is_visible_to_viewer"("p_target_user_id" "uuid", "p_is_item_private" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_is_private boolean;
BEGIN
  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Extract is_private flag
  v_is_private := COALESCE((p_visit_data->>'is_private')::boolean, false);

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    google_rating = EXCLUDED.google_rating
  RETURNING id INTO v_winery_id;

  -- Insert Visit
  INSERT INTO public.visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos,
    is_private
  )
  VALUES (
    (SELECT auth.uid()),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;


ALTER FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friend"("p_target_friend_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."remove_friend"("p_target_friend_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_winery_from_trip"("p_trip_id" integer, "p_winery_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  DELETE FROM public.trip_wineries
  WHERE trip_id = p_trip_id AND winery_id = p_winery_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."remove_winery_from_trip"("p_trip_id" integer, "p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_trip_wineries"("p_trip_id" integer, "p_winery_ids" integer[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  FOR v_index IN 1..array_length(p_winery_ids, 1) LOOP
    v_winery_id := p_winery_ids[v_index];
    
    UPDATE public.trip_wineries
    SET visit_order = v_index - 1
    WHERE trip_id = p_trip_id AND winery_id = v_winery_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."reorder_trip_wineries"("p_trip_id" integer, "p_winery_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_follow_request"("p_follower_id" "uuid", "p_accept" boolean) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_request_exists BOOLEAN;
BEGIN
    -- 1. Verify request exists
    SELECT EXISTS (
        SELECT 1 FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid() AND status = 'pending'
    ) INTO v_request_exists;

    IF NOT v_request_exists THEN
        RETURN json_build_object('status', 'error', 'message', 'Request not found or already processed');
    END IF;

    -- 2. Handle response
    IF p_accept THEN
        -- Add to follows
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (p_follower_id, auth.uid())
        ON CONFLICT DO NOTHING;

        -- Delete request
        DELETE FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid();

        RETURN json_build_object('status', 'accepted', 'message', 'Follow request accepted');
    ELSE
        -- Update/Delete request
        DELETE FROM public.follow_requests 
        WHERE follower_id = p_follower_id AND following_id = auth.uid();

        RETURN json_build_object('status', 'declined', 'message', 'Follow request declined');
    END IF;
END;
$$;


ALTER FUNCTION "public"."respond_to_follow_request"("p_follower_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_friend_request"("p_requester_id" "uuid", "p_accept" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."respond_to_friend_request"("p_requester_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_wineries_by_name_and_location"("p_search_query" "text", "p_user_latitude" double precision, "p_user_longitude" double precision) RETURNS TABLE("id" integer, "google_place_id" "text", "name" character varying, "address" "text", "latitude" numeric, "longitude" numeric, "phone" character varying, "website" character varying, "google_rating" numeric, "is_favorite" boolean, "on_wishlist" boolean, "user_visited" boolean, "distance_meters" double precision)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth', 'extensions'
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


ALTER FUNCTION "public"."search_wineries_by_name_and_location"("p_search_query" "text", "p_user_latitude" double precision, "p_user_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_follow_request"("p_target_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_privacy_level privacy_level;
    v_already_following BOOLEAN;
BEGIN
    -- 1. Check if already following
    SELECT EXISTS (
        SELECT 1 FROM public.follows 
        WHERE follower_id = auth.uid() AND following_id = p_target_id
    ) INTO v_already_following;

    IF v_already_following THEN
        RETURN json_build_object('status', 'already_following', 'message', 'You are already following this user');
    END IF;

    -- 2. Get target privacy level
    SELECT privacy_level INTO v_privacy_level FROM public.profiles WHERE id = p_target_id;

    IF v_privacy_level IS NULL THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;

    -- 3. Logic based on privacy
    IF v_privacy_level = 'public' THEN
        -- Instant follow
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (auth.uid(), p_target_id)
        ON CONFLICT DO NOTHING;
        
        RETURN json_build_object('status', 'followed', 'message', 'Following started instantly');
    ELSE
        -- Create request
        INSERT INTO public.follow_requests (follower_id, following_id)
        VALUES (auth.uid(), p_target_id)
        ON CONFLICT (follower_id, following_id) DO UPDATE SET status = 'pending';
        
        RETURN json_build_object('status', 'request_sent', 'message', 'Follow request sent');
    END IF;
END;
$$;


ALTER FUNCTION "public"."send_follow_request"("p_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_target_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."send_friend_request"("p_target_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_favorite"("p_winery_data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_id uuid;
  v_winery_id integer;
  v_exists boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure winery exists
  v_winery_id := ensure_winery(p_winery_data);

  -- Check if already a favorite
  SELECT EXISTS (
    SELECT 1 FROM favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    RETURN false; -- Removed
  ELSE
    -- Add
    INSERT INTO favorites (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    RETURN true; -- Added
  END IF;

END;
$$;


ALTER FUNCTION "public"."toggle_favorite"("p_winery_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_favorite_privacy"("p_winery_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_new_state boolean;
BEGIN
    UPDATE public.favorites
    SET is_private = NOT is_private,
        created_at = created_at -- dummy to trigger update if needed
    WHERE user_id = v_user_id AND winery_id = p_winery_id
    RETURNING is_private INTO v_new_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Favorite item not found for this user';
    END IF;

    RETURN jsonb_build_object('success', true, 'is_private', v_new_state);
END;
$$;


ALTER FUNCTION "public"."toggle_favorite_privacy"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_wishlist"("p_winery_data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_id uuid;
  v_winery_id integer;
  v_exists boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure winery exists (using existing RPC logic or calling it if possible)
  -- Since ensure_winery is SECURITY DEFINER, we can call it.
  v_winery_id := ensure_winery(p_winery_data);

  -- Check if already in wishlist
  SELECT EXISTS (
    SELECT 1 FROM wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    RETURN false; -- Removed
  ELSE
    -- Add
    INSERT INTO wishlist (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    RETURN true; -- Added
  END IF;

END;
$$;


ALTER FUNCTION "public"."toggle_wishlist"("p_winery_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_wishlist_privacy"("p_winery_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_new_state boolean;
BEGIN
    UPDATE public.wishlist
    SET is_private = NOT is_private,
        created_at = created_at
    WHERE user_id = v_user_id AND winery_id = p_winery_id
    RETURNING is_private INTO v_new_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wishlist item not found for this user';
    END IF;

    RETURN jsonb_build_object('success', true, 'is_private', v_new_state);
END;
$$;


ALTER FUNCTION "public"."toggle_wishlist_privacy"("p_winery_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_privacy"("p_privacy_level" "public"."privacy_level") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    UPDATE public.profiles
    SET privacy_level = p_privacy_level
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'privacy_level', p_privacy_level);
END;
$$;


ALTER FUNCTION "public"."update_profile_privacy"("p_privacy_level" "public"."privacy_level") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_trip_winery_notes"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    -- 1. Verify authorization
    IF NOT public.is_trip_member(p_trip_id) THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- 2. Update notes
    UPDATE public.trip_wineries
    SET notes = p_notes
    WHERE trip_id = p_trip_id AND winery_id = p_winery_id;

    RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."update_trip_winery_notes"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_updated_record record;
BEGIN
    UPDATE public.visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        is_private = COALESCE((p_visit_data->>'is_private')::boolean, is_private),
        updated_at = NOW()
    WHERE id = p_visit_id AND user_id = v_user_id
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'id', v.id,
            'user_id', v.user_id,
            'visit_date', v.visit_date,
            'rating', v.rating,
            'user_review', v.user_review,
            'photos', v.photos,
            'is_private', v.is_private,
            'winery_id', v.winery_id,
            'winery_name', w.name,
            'winery_address', w.address,
            'google_place_id', w.google_place_id,
            'latitude', w.latitude,
            'longitude', w.longitude,
            'lat', w.latitude,
            'lng', w.longitude
        )
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        WHERE v.id = v_updated_record.id
    );
END;
$$;


ALTER FUNCTION "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_wineries_from_search"("p_wineries_data" "jsonb"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."upsert_wineries_from_search"("p_wineries_data" "jsonb"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "object_id" "text" NOT NULL,
    "privacy_level" "text" DEFAULT 'public'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_private" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."favorites_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."favorites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."favorites_id_seq" OWNED BY "public"."favorites"."id";



CREATE TABLE IF NOT EXISTS "public"."follow_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."follow_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cannot_follow_self" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friends" (
    "id" integer NOT NULL,
    "user1_id" "uuid" NOT NULL,
    "user2_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friends_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."friends" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."friends_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."friends_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."friends_id_seq" OWNED BY "public"."friends"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "privacy_level" "public"."privacy_level" DEFAULT 'public'::"public"."privacy_level"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'joined'::"text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_wineries" (
    "id" integer NOT NULL,
    "trip_id" integer NOT NULL,
    "winery_id" integer NOT NULL,
    "visit_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_wineries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."trip_wineries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."trip_wineries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."trip_wineries_id_seq" OWNED BY "public"."trip_wineries"."id";



CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trip_date" "date" NOT NULL,
    "name" character varying(255),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."trips_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."trips_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."trips_id_seq" OWNED BY "public"."trips"."id";



CREATE TABLE IF NOT EXISTS "public"."visit_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'tagged'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visit_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "visit_date" "date" NOT NULL,
    "user_review" "text",
    "rating" integer,
    "photos" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_private" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "visits_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."visits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."visits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."visits_id_seq" OWNED BY "public"."visits"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."wineries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wineries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wineries_id_seq" OWNED BY "public"."wineries"."id";



CREATE TABLE IF NOT EXISTS "public"."wishlist" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "winery_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_private" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."wishlist" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."wishlist_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wishlist_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."wishlist_id_seq" OWNED BY "public"."wishlist"."id";



ALTER TABLE ONLY "public"."favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."friends" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."friends_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."trip_wineries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."trip_wineries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."trips" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."trips_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."visits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."visits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wineries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wineries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."wishlist" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wishlist_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_ledger"
    ADD CONSTRAINT "activity_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_winery_id_key" UNIQUE ("user_id", "winery_id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user1_id_user2_id_key" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_trip_id_winery_id_key" UNIQUE ("trip_id", "winery_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_participants"
    ADD CONSTRAINT "visit_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_participants"
    ADD CONSTRAINT "visit_participants_visit_id_user_id_key" UNIQUE ("visit_id", "user_id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wineries"
    ADD CONSTRAINT "wineries_google_place_id_key" UNIQUE ("google_place_id");



ALTER TABLE ONLY "public"."wineries"
    ADD CONSTRAINT "wineries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_user_id_winery_id_key" UNIQUE ("user_id", "winery_id");



CREATE INDEX "idx_friends_user1_id" ON "public"."friends" USING "btree" ("user1_id");



CREATE INDEX "idx_friends_user2_id" ON "public"."friends" USING "btree" ("user2_id");



CREATE INDEX "idx_trip_members_trip_id" ON "public"."trip_members" USING "btree" ("trip_id");



CREATE INDEX "idx_trips_user_id_trip_date" ON "public"."trips" USING "btree" ("user_id", "trip_date");



CREATE INDEX "idx_wineries_google_place_id" ON "public"."wineries" USING "btree" ("google_place_id");



CREATE OR REPLACE TRIGGER "tr_favorites_activity_ledger" AFTER INSERT OR DELETE OR UPDATE ON "public"."favorites" FOR EACH ROW EXECUTE FUNCTION "public"."handle_activity_ledger_entry"();



CREATE OR REPLACE TRIGGER "tr_trip_wineries_updated_at" BEFORE UPDATE ON "public"."trip_wineries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "tr_trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "tr_visits_activity_ledger" AFTER INSERT OR DELETE OR UPDATE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."handle_activity_ledger_entry"();



CREATE OR REPLACE TRIGGER "tr_visits_updated_at" BEFORE UPDATE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "tr_wishlist_activity_ledger" AFTER INSERT OR DELETE OR UPDATE ON "public"."wishlist" FOR EACH ROW EXECUTE FUNCTION "public"."handle_activity_ledger_entry"();

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



ALTER TABLE ONLY "public"."activity_ledger"
    ADD CONSTRAINT "activity_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_wineries"
    ADD CONSTRAINT "trip_wineries_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_participants"
    ADD CONSTRAINT "visit_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_participants"
    ADD CONSTRAINT "visit_participants_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_winery_id_fkey" FOREIGN KEY ("winery_id") REFERENCES "public"."wineries"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view wineries" ON "public"."wineries" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert wineries" ON "public"."wineries" FOR INSERT TO "authenticated" WITH CHECK ((("name" IS NOT NULL) AND ("google_place_id" IS NOT NULL)));



CREATE POLICY "Members can add wineries to a trip" ON "public"."trip_wineries" FOR INSERT WITH CHECK ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Members can remove wineries from a trip" ON "public"."trip_wineries" FOR DELETE USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Members can update wineries on a trip" ON "public"."trip_wineries" FOR UPDATE USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Members can view trip wineries" ON "public"."trip_wineries" FOR SELECT USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Owners can delete their trips" ON "public"."trips" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Owners can update their trips" ON "public"."trips" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Participants can update their own status" ON "public"."visit_participants" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Profiles are viewable based on privacy settings" ON "public"."profiles" FOR SELECT USING (( SELECT "public"."is_visible_to_viewer"("profiles"."id") AS "is_visible_to_viewer"));



CREATE POLICY "System can manage activity_ledger" ON "public"."activity_ledger" USING ((( SELECT ("auth"."jwt"() ->> 'role'::"text")) = 'service_role'::"text"));



CREATE POLICY "Trip owners can add members" ON "public"."trip_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "trip_members"."trip_id") AND ("trips"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Trip owners can remove members" ON "public"."trip_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "trip_members"."trip_id") AND ("trips"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Trip owners can update member roles" ON "public"."trip_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips"
  WHERE (("trips"."id" = "trip_members"."trip_id") AND ("trips"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can create friend requests" ON "public"."friends" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user1_id"));



CREATE POLICY "Users can delete their own favorite items" ON "public"."favorites" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own friendships" ON "public"."friends" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user1_id") OR (( SELECT "auth"."uid"() AS "uid") = "user2_id")));



CREATE POLICY "Users can delete their own visits" ON "public"."visits" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own wishlist items" ON "public"."wishlist" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can follow others" ON "public"."follows" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can insert their own favorite items" ON "public"."favorites" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can insert their own trips" ON "public"."trips" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own visits" ON "public"."visits" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own wishlist items" ON "public"."wishlist" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can respond to friend requests" ON "public"."friends" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user2_id")) WITH CHECK (("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text"])));



CREATE POLICY "Users can unfollow" ON "public"."follows" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can update their own profile." ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update their own visits" ON "public"."visits" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view activities based on privacy settings" ON "public"."activity_ledger" FOR SELECT USING (( SELECT "public"."is_visible_to_viewer"("activity_ledger"."user_id", ("activity_ledger"."privacy_level" = 'private'::"text")) AS "is_visible_to_viewer"));



CREATE POLICY "Users can view favorites based on privacy settings" ON "public"."favorites" FOR SELECT USING (( SELECT "public"."is_visible_to_viewer"("favorites"."user_id", "favorites"."is_private") AS "is_visible_to_viewer"));



CREATE POLICY "Users can view follows" ON "public"."follows" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "follower_id") OR (( SELECT "auth"."uid"() AS "uid") = "following_id")));



CREATE POLICY "Users can view members of trips they belong to" ON "public"."trip_members" FOR SELECT USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "Users can view participants of visits they are part of" ON "public"."visit_participants" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."visits"
  WHERE (("visits"."id" = "visit_participants"."visit_id") AND ("visits"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can view requests they sent or received" ON "public"."follow_requests" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "follower_id") OR (( SELECT "auth"."uid"() AS "uid") = "following_id")));



CREATE POLICY "Users can view their own friendships" ON "public"."friends" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user1_id") OR (( SELECT "auth"."uid"() AS "uid") = "user2_id")));



CREATE POLICY "Users can view trips they belong to" ON "public"."trips" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."trip_members"
  WHERE (("trip_members"."trip_id" = "trips"."id") AND ("trip_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can view visits based on privacy settings" ON "public"."visits" FOR SELECT USING (( SELECT "public"."is_visible_to_viewer"("visits"."user_id", "visits"."is_private") AS "is_visible_to_viewer"));



CREATE POLICY "Users can view wishlist items based on privacy settings" ON "public"."wishlist" FOR SELECT USING (( SELECT "public"."is_visible_to_viewer"("wishlist"."user_id", "wishlist"."is_private") AS "is_visible_to_viewer"));



CREATE POLICY "Visit owners can remove participants" ON "public"."visit_participants" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."visits"
  WHERE (("visits"."id" = "visit_participants"."visit_id") AND ("visits"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Visit owners can tag participants" ON "public"."visit_participants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits"
  WHERE (("visits"."id" = "visit_participants"."visit_id") AND ("visits"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."activity_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_wineries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wineries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friends";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."visits";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."add_to_wishlist"("p_winery_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_to_wishlist"("p_winery_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_to_wishlist"("p_winery_data" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_trip_member_by_email"("p_trip_id" integer, "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_trip_member_by_email"("p_trip_id" integer, "p_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_trip_member_by_email"("p_trip_id" integer, "p_email" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_winery_to_trips"("p_winery_id" integer, "p_trip_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_winery_to_trips"("p_winery_id" integer, "p_trip_ids" integer[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."add_winery_to_trips"("p_winery_id" integer, "p_trip_ids" integer[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_trip_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_trip_date" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_trip_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text", "p_members" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text", "p_members" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."create_trip_with_winery"("p_trip_name" character varying, "p_trip_date" "date", "p_winery_data" "jsonb", "p_notes" "text", "p_members" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_trip"("p_trip_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_trip"("p_trip_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_trip"("p_trip_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_visit"("p_visit_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_visit"("p_visit_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_visit"("p_visit_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_winery"("p_winery_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_winery"("p_winery_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."ensure_winery"("p_winery_data" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_all_user_visits_list"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_all_user_visits_list"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_all_user_visits_list"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_all_wineries_with_user_data"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_friend_activity_feed"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_activity_feed"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friend_profile_with_visits"("p_friend_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_profile_with_visits"("p_friend_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friends_activity_for_winery"("p_winery_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_activity_for_winery"("p_winery_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_friends_and_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_friends_and_requests"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_friends_and_requests"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_friends_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_friends_ids"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_friends_ids"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_friends_ratings_for_winery"("p_winery_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friends_ratings_for_winery"("p_winery_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_map_markers"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_map_markers"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_paginated_trips_with_wineries"("p_trip_type" "text", "p_page_number" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_paginated_trips_with_wineries"("p_trip_type" "text", "p_page_number" integer, "p_page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_paginated_visits_with_winery_and_friends"("p_page_number" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_paginated_visits_with_winery_and_friends"("p_page_number" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_paginated_wineries"("p_page" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_paginated_wineries"("p_page" integer, "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_paginated_wineries"("p_page" integer, "p_limit" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_trip_by_id_with_wineries"("p_trip_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_by_id_with_wineries"("p_trip_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trip_details"("p_trip_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_details"("p_trip_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trips_for_date"("p_target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trips_for_date"("p_target_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_dashboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_dashboard"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_dashboard"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_user_winery_data_aggregated"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_winery_data_aggregated"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_winery_data_aggregated"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_wineries_for_trip_planner"("p_trip_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_wineries_for_trip_planner"("p_trip_date" "date") TO "service_role";



GRANT ALL ON TABLE "public"."wineries" TO "authenticated";
GRANT ALL ON TABLE "public"."wineries" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_wineries_in_bounds"("p_min_latitude" double precision, "p_min_longitude" double precision, "p_max_latitude" double precision, "p_max_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_wineries_in_bounds"("p_min_latitude" double precision, "p_min_longitude" double precision, "p_max_latitude" double precision, "p_max_longitude" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_winery_details"("p_winery_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_winery_details"("p_winery_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_winery_details_by_id"("p_winery_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_winery_details_by_id"("p_winery_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_activity_ledger_entry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_activity_ledger_entry"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_visible_to_viewer"("p_target_user_id" "uuid", "p_is_item_private" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_visible_to_viewer"("p_target_user_id" "uuid", "p_is_item_private" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."is_visible_to_viewer"("p_target_user_id" "uuid", "p_is_item_private" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."remove_friend"("p_target_friend_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friend"("p_target_friend_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_winery_from_trip"("p_trip_id" integer, "p_winery_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_winery_from_trip"("p_trip_id" integer, "p_winery_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."remove_winery_from_trip"("p_trip_id" integer, "p_winery_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reorder_trip_wineries"("p_trip_id" integer, "p_winery_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_trip_wineries"("p_trip_id" integer, "p_winery_ids" integer[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."reorder_trip_wineries"("p_trip_id" integer, "p_winery_ids" integer[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."respond_to_follow_request"("p_follower_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_follow_request"("p_follower_id" "uuid", "p_accept" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."respond_to_follow_request"("p_follower_id" "uuid", "p_accept" boolean) TO "authenticated";



GRANT ALL ON FUNCTION "public"."respond_to_friend_request"("p_requester_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_friend_request"("p_requester_id" "uuid", "p_accept" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_wineries_by_name_and_location"("p_search_query" "text", "p_user_latitude" double precision, "p_user_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_wineries_by_name_and_location"("p_search_query" "text", "p_user_latitude" double precision, "p_user_longitude" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_follow_request"("p_target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_follow_request"("p_target_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."send_follow_request"("p_target_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."send_friend_request"("p_target_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_target_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_favorite"("p_winery_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_favorite"("p_winery_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."toggle_favorite"("p_winery_data" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."toggle_favorite_privacy"("p_winery_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_favorite_privacy"("p_winery_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."toggle_favorite_privacy"("p_winery_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."toggle_wishlist"("p_winery_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_wishlist"("p_winery_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."toggle_wishlist"("p_winery_data" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."toggle_wishlist_privacy"("p_winery_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_wishlist_privacy"("p_winery_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."toggle_wishlist_privacy"("p_winery_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_profile_privacy"("p_privacy_level" "public"."privacy_level") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_profile_privacy"("p_privacy_level" "public"."privacy_level") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_profile_privacy"("p_privacy_level" "public"."privacy_level") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_trip_winery_notes"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_trip_winery_notes"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_trip_winery_notes"("p_trip_id" integer, "p_winery_id" integer, "p_notes" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_visit"("p_visit_id" integer, "p_visit_data" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."upsert_wineries_from_search"("p_wineries_data" "jsonb"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_wineries_from_search"("p_wineries_data" "jsonb"[]) TO "service_role";

















































































GRANT ALL ON TABLE "public"."activity_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."follow_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_requests" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."friends" TO "authenticated";
GRANT ALL ON TABLE "public"."friends" TO "service_role";



GRANT ALL ON SEQUENCE "public"."friends_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."friends_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."trip_wineries" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_wineries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trip_wineries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trip_wineries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON SEQUENCE "public"."trips_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."trips_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."visit_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_participants" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."visits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."visits_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wineries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wineries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Storage Configuration
INSERT INTO storage.buckets (id, name, public) 
VALUES ('visit-photos', 'visit-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "User can delete their own photos" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'visit-photos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

CREATE POLICY "User can upload a photo to a visit" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'visit-photos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

CREATE POLICY "Users can view their own and friends photos" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'visit-photos'::"text") AND ((("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") OR (("storage"."foldername"("name"))[1] IN ( SELECT ("get_friends_ids"."friend_id")::"text" AS "friend_id"
   FROM "public"."get_friends_ids"() "get_friends_ids"("friend_id"))))));
