-- Migration: 20261026000000_harden_rls_and_security_invoker_rpcs.sql
-- Description: Comprehensive database security hardening migration implementing ADR-0007 (Issue #87).
--   1. Teardown pg_graphql extension and eliminate Supabase linter 0026/0027 warnings.
--   2. Revoke all privileges in schema public from anon and PUBLIC, updating default privileges.
--   3. Revoke access from anon/authenticated on deprecated tables (follows, follow_requests, visit_participants).
--   4. Drop obsolete "Authenticated users can insert wineries" policy and revoke INSERT/UPDATE/DELETE on wineries from authenticated.
--   5. Replace global idempotency constraints with composite (user_id, idempotency_key) unique constraints on visits and trips.
--   6. Drop 10 dead/deprecated RPCs.
--   7. Harden ensure_winery as SECURITY DEFINER with caller auth check, place ID aliasing, rating normalization, and conflict backfilling.
--   8. Update is_visible_to_viewer to reject unauthenticated callers and drop legacy follows references.
--   9. Modernize boundary SECURITY DEFINER RPCs (allowlist of 7).
--  10. Convert 8 read RPCs and 18 write RPCs to SECURITY INVOKER with explicit caller auth guards and scoped idempotency.
--  11. Lock down trigger function execution privileges (handle_new_user, handle_activity_ledger_notification, handle_activity_ledger_entry).
--  12. Re-create all client-facing RLS policies with explicit TO authenticated and add missing FOR UPDATE policies on collections.

-- ============================================================================
-- 1. Extension Teardown & Schema-Level Privilege Lockdown
-- ============================================================================

-- Drop unused pg_graphql extension CASCADE
DROP EXTENSION IF EXISTS pg_graphql CASCADE;

-- Revoke all public schema privileges from anon and PUBLIC
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;

-- Alter default privileges for future objects created by role postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;

-- Deprecated tables: revoke access from client roles; retain service_role access for expand-and-contract safety
REVOKE ALL ON TABLE public.follows FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.follow_requests FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.visit_participants FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.follows, public.follow_requests, public.visit_participants TO service_role;

-- Ensure authenticated role can use sequences for legitimate table inserts
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- 2. Table Constraints & Winery Direct Mutation Lockdown
-- ============================================================================

-- Replace global idempotency constraints with composite (user_id, idempotency_key) constraints
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_idempotency_key_key;
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_user_id_idempotency_key_key;
ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_idempotency_key_key;
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_user_id_idempotency_key_key;
ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);

-- Revoke direct mutation privileges on public.wineries from authenticated and anon
DROP POLICY IF EXISTS "Authenticated users can insert wineries" ON public.wineries;
DROP POLICY IF EXISTS "Anyone can view wineries" ON public.wineries;
DROP POLICY IF EXISTS "Authenticated users can view wineries" ON public.wineries;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.wineries FROM authenticated, anon, PUBLIC;
GRANT SELECT ON TABLE public.wineries TO authenticated;
GRANT ALL ON TABLE public.wineries TO service_role;

CREATE POLICY "Authenticated users can view wineries"
ON public.wineries FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 3. Prune 10 Dead/Deprecated RPCs
-- ============================================================================

DROP FUNCTION IF EXISTS public.upsert_wineries_from_search(jsonb[]) CASCADE;
DROP FUNCTION IF EXISTS public.get_all_user_visits_list() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_dashboard() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_winery_data_aggregated() CASCADE;
DROP FUNCTION IF EXISTS public.get_winery_details(integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, boolean, boolean, boolean, boolean, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.add_winery_to_trips(integer, integer[]) CASCADE;
DROP FUNCTION IF EXISTS public.add_to_wishlist(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.send_follow_request(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.respond_to_follow_request(uuid, boolean) CASCADE;

-- ============================================================================
-- 4. Boundary SECURITY DEFINER Functions (Strict Allowlist of 7)
-- ============================================================================

-- 4.1 Row Visibility Helper
CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(
  p_target_user_id uuid,
  p_is_item_private boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_viewer_id uuid := auth.uid();
    v_target_privacy public.privacy_level;
BEGIN
    -- 1. Unauthenticated callers have zero visibility
    IF v_viewer_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. Owner can always see their own
    IF v_viewer_id = p_target_user_id THEN
        RETURN TRUE;
    END IF;

    -- 3. If the item itself is private, no one else can see it
    IF COALESCE(p_is_item_private, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- 4. Get target profile privacy
    SELECT privacy_level INTO v_target_privacy FROM public.profiles WHERE id = p_target_user_id;

    -- 5. Profile-level privacy handling
    IF v_target_privacy = 'public' THEN
        RETURN TRUE;
    END IF;

    IF v_target_privacy = 'friends_only' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.friends
            WHERE status = 'accepted'
              AND (
                (user1_id = v_viewer_id AND user2_id = p_target_user_id)
                OR
                (user2_id = v_viewer_id AND user1_id = p_target_user_id)
              )
        );
    END IF;

    RETURN FALSE;
END;
$$;

ALTER FUNCTION public.is_visible_to_viewer(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_visible_to_viewer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_visible_to_viewer(uuid, boolean) TO authenticated, service_role;

-- 4.2 Winery Canonical Upsert & Immutability Boundary
CREATE OR REPLACE FUNCTION public.ensure_winery(
  p_winery_data jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_winery_id integer;
  v_place_id text;
  v_rating numeric;
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_winery_data IS NULL OR jsonb_typeof(p_winery_data) != 'object' THEN
    RAISE EXCEPTION 'Invalid winery data: payload must be a JSON object';
  END IF;

  v_place_id := COALESCE(p_winery_data->>'google_place_id', p_winery_data->>'id');
  IF v_place_id IS NULL OR length(trim(v_place_id)) = 0 THEN
    RAISE EXCEPTION 'google_place_id is required';
  END IF;

  v_rating := CASE 
    WHEN (p_winery_data->>'rating')::numeric > 0 THEN (p_winery_data->>'rating')::numeric 
    WHEN (p_winery_data->>'google_rating')::numeric > 0 THEN (p_winery_data->>'google_rating')::numeric
    ELSE NULL 
  END;

  v_lat := (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric;
  v_lng := (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric;

  -- 1. Check if winery already exists
  SELECT id INTO v_winery_id
  FROM public.wineries
  WHERE google_place_id = v_place_id;

  IF v_winery_id IS NOT NULL THEN
    -- Backfill only null attributes; preserve existing canonical values
    UPDATE public.wineries SET
      name = COALESCE(wineries.name, p_winery_data->>'name'),
      address = COALESCE(wineries.address, p_winery_data->>'address'),
      latitude = COALESCE(wineries.latitude, v_lat),
      longitude = COALESCE(wineries.longitude, v_lng),
      phone = COALESCE(wineries.phone, p_winery_data->>'phone'),
      website = COALESCE(wineries.website, p_winery_data->>'website'),
      google_rating = COALESCE(wineries.google_rating, v_rating)
    WHERE id = v_winery_id;

    RETURN v_winery_id;
  END IF;

  -- 2. New winery: insert with fallbacks for NOT NULL columns
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude,
    phone, website, google_rating
  )
  VALUES (
    v_place_id,
    COALESCE(p_winery_data->>'name', 'Unknown Winery'),
    COALESCE(p_winery_data->>'address', ''),
    v_lat,
    v_lng,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    v_rating
  )
  ON CONFLICT (google_place_id) DO UPDATE SET
    name = COALESCE(wineries.name, EXCLUDED.name),
    address = COALESCE(wineries.address, NULLIF(EXCLUDED.address, '')),
    latitude = COALESCE(wineries.latitude, EXCLUDED.latitude),
    longitude = COALESCE(wineries.longitude, EXCLUDED.longitude),
    phone = COALESCE(wineries.phone, EXCLUDED.phone),
    website = COALESCE(wineries.website, EXCLUDED.website),
    google_rating = COALESCE(wineries.google_rating, EXCLUDED.google_rating)
  RETURNING id INTO v_winery_id;

  RETURN v_winery_id;
END;
$$;

ALTER FUNCTION public.ensure_winery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_winery(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_winery(jsonb) TO authenticated, service_role;

-- 4.3 Trip Membership Guard
CREATE OR REPLACE FUNCTION public.is_trip_member(
  p_trip_id integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
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

ALTER FUNCTION public.is_trip_member(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_trip_member(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trip_member(integer) TO authenticated, service_role;

-- 4.4 Trip Member Invitation
CREATE OR REPLACE FUNCTION public.add_trip_member_by_email(
  p_trip_id integer,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
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

ALTER FUNCTION public.add_trip_member_by_email(integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_trip_member_by_email(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_trip_member_by_email(integer, text) TO authenticated, service_role;

-- 4.5 Friend Request Dispatch
CREATE OR REPLACE FUNCTION public.send_friend_request(
  p_target_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
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
  FROM public.profiles
  WHERE email ILIKE TRIM(p_target_email);

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_target_user_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  SELECT * INTO existing_request
  FROM public.friends
  WHERE (user1_id = current_user_id AND user2_id = v_target_user_id)
     OR (user1_id = v_target_user_id AND user2_id = current_user_id)
  LIMIT 1;

  IF existing_request.id IS NOT NULL THEN
    IF existing_request.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends.';
    ELSIF existing_request.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent or pending.';
    ELSE
      UPDATE public.friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = v_target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.friends (user1_id, user2_id, status)
  VALUES (current_user_id, v_target_user_id, 'pending');
END;
$$;

ALTER FUNCTION public.send_friend_request(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated, service_role;

-- 4.6 Social Graph & Incoming Requests Lookup
CREATE OR REPLACE FUNCTION public.get_friends_and_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
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
        FROM public.friends f
        JOIN public.profiles p ON (f.user1_id = p.id OR f.user2_id = p.id)
        WHERE (f.user1_id = v_user_id OR f.user2_id = v_user_id)
          AND p.id != v_user_id
          AND f.status = 'accepted'
    ) f_data;

    -- Pending incoming
    SELECT COALESCE(jsonb_agg(row_to_json(f_data)), '[]'::jsonb) INTO v_pending_incoming
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.friends f
        JOIN public.profiles p ON f.user1_id = p.id
        WHERE f.user2_id = v_user_id AND f.status = 'pending'
    ) f_data;

    -- Pending outgoing
    SELECT COALESCE(jsonb_agg(row_to_json(f_data)), '[]'::jsonb) INTO v_pending_outgoing
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.friends f
        JOIN public.profiles p ON f.user2_id = p.id
        WHERE f.user1_id = v_user_id AND f.status = 'pending'
    ) f_data;

    RETURN jsonb_build_object(
        'friends', v_friends,
        'pending_incoming', v_pending_incoming,
        'pending_outgoing', v_pending_outgoing
    );
END;
$$;

ALTER FUNCTION public.get_friends_and_requests() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friends_and_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_and_requests() TO authenticated, service_role;

-- 4.7 Trip Details Composite Query
CREATE OR REPLACE FUNCTION public.get_trip_details(
  p_trip_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_trip_record record;
    v_result jsonb;
    v_is_member boolean;
BEGIN
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

ALTER FUNCTION public.get_trip_details(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trip_details(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(integer) TO authenticated, service_role;

-- ============================================================================
-- 5. Read RPCs (8 Converted to SECURITY INVOKER)
-- ============================================================================

-- 5.1 Map Markers Discovery
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);
CREATE OR REPLACE FUNCTION public.get_map_markers(
  p_user_id uuid DEFAULT auth.uid()
) RETURNS TABLE(
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
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
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
REVOKE ALL ON FUNCTION public.get_map_markers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_map_markers(uuid) TO authenticated, service_role;

-- 5.2 Paginated Wineries Discovery
DROP FUNCTION IF EXISTS public.get_paginated_wineries(integer, integer);
CREATE OR REPLACE FUNCTION public.get_paginated_wineries(
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
) RETURNS TABLE(
  id integer,
  google_place_id text,
  name text,
  address text,
  latitude numeric,
  longitude numeric,
  phone text,
  website text,
  google_rating numeric,
  is_favorite boolean,
  on_wishlist boolean,
  user_visited boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_total_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_total_count FROM public.wineries;

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
        EXISTS(SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = v_user_id) as is_favorite,
        EXISTS(SELECT 1 FROM public.wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = v_user_id) as on_wishlist,
        EXISTS(SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = v_user_id) as user_visited,
        v_total_count
    FROM
        public.wineries w
    ORDER BY
        w.name ASC
    LIMIT p_limit
    OFFSET (p_page - 1) * p_limit;
END;
$$;

ALTER FUNCTION public.get_paginated_wineries(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_paginated_wineries(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paginated_wineries(integer, integer) TO authenticated, service_role;

-- 5.3 Winery Details by ID
DROP FUNCTION IF EXISTS public.get_winery_details_by_id(integer);
CREATE OR REPLACE FUNCTION public.get_winery_details_by_id(
  p_winery_id integer
) RETURNS TABLE(
  id integer,
  google_place_id text,
  name text,
  address text,
  latitude numeric,
  longitude numeric,
  phone text,
  website text,
  google_rating numeric,
  user_rating_count integer,
  opening_hours jsonb,
  reviews jsonb,
  reservable boolean,
  is_favorite boolean,
  on_wishlist boolean,
  user_visited boolean,
  is_favorite_private boolean,
  on_wishlist_private boolean,
  visits jsonb,
  trip_info jsonb,
  enrichment_tier text,
  last_enriched_at timestamp with time zone,
  generative_summary jsonb,
  neighborhood_summary jsonb,
  editorial_summary jsonb,
  primary_photo_reference text,
  photo_references jsonb,
  allows_dogs boolean,
  good_for_children boolean,
  outdoor_seating boolean,
  has_ev_charging boolean,
  serves_wine boolean,
  parking_options jsonb,
  accessibility_flags jsonb,
  varietals jsonb,
  vibe_tags text[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$ 
DECLARE 
  user_uuid uuid := auth.uid(); 
BEGIN 
  RETURN QUERY SELECT 
    w.id, 
    w.google_place_id, 
    w.name::text, 
    w.address, 
    w.latitude, 
    w.longitude, 
    w.phone::text, 
    w.website::text, 
    w.google_rating, 
    w.user_rating_count,
    w.opening_hours, 
    w.reviews, 
    w.reservable, 
    EXISTS(SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid) as is_favorite, 
    EXISTS(SELECT 1 FROM public.wishlist wl WHERE wl.winery_id = w.id AND wl.user_id = user_uuid) as on_wishlist, 
    EXISTS(SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid) as user_visited, 
    COALESCE((SELECT f.is_private FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = user_uuid), false) as is_favorite_private, 
    COALESCE((SELECT wi.is_private FROM public.wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = user_uuid), false) as on_wishlist_private, 
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
      ), '[]'::jsonb) FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = user_uuid 
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
      FROM public.trip_wineries tw 
      JOIN public.trips t ON tw.trip_id = t.id 
      WHERE tw.winery_id = w.id 
      AND ( 
        t.user_id = user_uuid 
        OR EXISTS ( 
          SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = user_uuid 
        ) 
      ) 
      AND t.trip_date >= CURRENT_DATE 
    ) as trip_info, 
    w.enrichment_tier, 
    w.last_enriched_at, 
    w.generative_summary, 
    w.neighborhood_summary, 
    w.editorial_summary, 
    w.primary_photo_reference, 
    w.photo_references, 
    w.allows_dogs, 
    w.good_for_children, 
    w.outdoor_seating, 
    w.has_ev_charging, 
    w.serves_wine, 
    w.parking_options, 
    w.accessibility_flags,
    w.varietals,
    w.vibe_tags
  FROM public.wineries w 
  WHERE w.id = p_winery_id; 
END; 
$$;

ALTER FUNCTION public.get_winery_details_by_id(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_winery_details_by_id(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_winery_details_by_id(integer) TO authenticated, service_role;

-- 5.4 Trips for Target Date
DROP FUNCTION IF EXISTS public.get_trips_for_date(date);
CREATE OR REPLACE FUNCTION public.get_trips_for_date(
  p_target_date date
) RETURNS TABLE(
  id integer,
  user_id uuid,
  trip_date date,
  name text,
  updated_at timestamp with time zone,
  wineries jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
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
    FROM public.trips t
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
        FROM public.trip_wineries tw
        JOIN public.wineries w ON tw.winery_id = w.id
    ) w_data ON t.id = w_data.trip_id
    WHERE t.trip_date = p_target_date
      AND public.is_trip_member(t.id)
    GROUP BY t.id, t.user_id, t.trip_date, t.name, t.updated_at;
END;
$$;

ALTER FUNCTION public.get_trips_for_date(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trips_for_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_for_date(date) TO authenticated, service_role;

-- 5.5 Friend Activity Feed
DROP FUNCTION IF EXISTS public.get_friend_activity_feed(integer);
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_feed jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

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
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user1_id = v_user_id AND f.user2_id = al.user_id)
                OR
                (f.user2_id = v_user_id AND f.user1_id = al.user_id)
              )
          )
        ORDER BY al.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_friend_activity_feed(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friend_activity_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated, service_role;

-- 5.6 Friend Profile with Visits & Email Redaction
DROP FUNCTION IF EXISTS public.get_friend_profile_with_visits(uuid);
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(
  p_friend_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_profile jsonb;
    v_viewer_id uuid := auth.uid();
    v_is_friend_or_self boolean;
BEGIN
    IF v_viewer_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 1. Check if the viewer is allowed to see the profile at all
    IF NOT public.is_visible_to_viewer(p_friend_id, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- Check if viewer is friend or self for email visibility
    v_is_friend_or_self := (v_viewer_id = p_friend_id) OR EXISTS (
      SELECT 1 FROM public.friends
      WHERE status = 'accepted'
        AND ((user1_id = v_viewer_id AND user2_id = p_friend_id)
          OR (user2_id = v_viewer_id AND user1_id = p_friend_id))
    );

    -- 2. Build the profile object with conditional email redaction
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', CASE WHEN v_is_friend_or_self THEN p.email ELSE NULL END,
            'privacy_level', p.privacy_level
        ),
        'visits', (
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

ALTER FUNCTION public.get_friend_profile_with_visits(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friend_profile_with_visits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_profile_with_visits(uuid) TO authenticated, service_role;

-- 5.7 Friends Activity for Winery
DROP FUNCTION IF EXISTS public.get_friends_activity_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(
  p_winery_id integer
) RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_favorited_by json;
    v_wishlisted_by json;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN json_build_object('favoritedBy', '[]'::json, 'wishlistedBy', '[]'::json);
    END IF;

    SELECT json_agg(row_to_json(f_data))
    INTO v_favorited_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'favorite'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
          )
    ) f_data;

    SELECT json_agg(row_to_json(w_data))
    INTO v_wishlisted_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'wishlist'
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
          AND EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
          )
    ) w_data;

    RETURN json_build_object(
        'favoritedBy', COALESCE(v_favorited_by, '[]'::json),
        'wishlistedBy', COALESCE(v_wishlisted_by, '[]'::json)
    );
END;
$$;

ALTER FUNCTION public.get_friends_activity_for_winery(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friends_activity_for_winery(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_activity_for_winery(integer) TO authenticated, service_role;

-- 5.8 Friends Ratings for Winery
DROP FUNCTION IF EXISTS public.get_friends_ratings_for_winery(integer);
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(
  p_winery_id integer
) RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  rating integer,
  user_review text,
  photos text[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

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
      AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
      AND EXISTS (
        SELECT 1 FROM public.friends fr
        WHERE fr.status = 'accepted'
          AND (
            (fr.user1_id = v_user_id AND fr.user2_id = p.id)
            OR
            (fr.user2_id = v_user_id AND fr.user1_id = p.id)
          )
      )
    ORDER BY al.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_friends_ratings_for_winery(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friends_ratings_for_winery(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated, service_role;

-- ============================================================================
-- 6. Write RPCs (18 Converted to SECURITY INVOKER)
-- ============================================================================

-- 6.1 Create Trip (Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.create_trip(
  p_name text,
  p_trip_date date,
  p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_trip_id integer;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Scoped idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id
    FROM public.trips
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
    
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_trip_id,
        'user_id', v_user_id,
        'trip_date', p_trip_date,
        'name', p_name
      );
    END IF;
  END IF;

  -- 1. Create Trip with composite conflict check
  INSERT INTO public.trips (user_id, trip_date, name, idempotency_key)
  VALUES (v_user_id, p_trip_date, p_name, p_idempotency_key)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_trip_id;

  IF v_trip_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id FROM public.trips WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
  END IF;

  -- 2. Add creator to trip_members join table as owner
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  VALUES (v_trip_id, v_user_id, 'owner', 'joined')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- 3. Return the new trip record
  RETURN jsonb_build_object(
    'id', v_trip_id,
    'user_id', v_user_id,
    'trip_date', p_trip_date,
    'name', p_name
  );
END;
$$;

ALTER FUNCTION public.create_trip(text, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_trip(text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip(text, date, uuid) TO authenticated, service_role;

-- 6.2 Create Trip with Winery (Delegates to ensure_winery, Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.create_trip_with_winery(
  p_trip_name character varying,
  p_trip_date date,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL::text,
  p_members uuid[] DEFAULT NULL::uuid[],
  p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
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

  -- Scoped idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id, tw.winery_id INTO v_trip_id, v_winery_id
    FROM public.trips t
    LEFT JOIN public.trip_wineries tw ON t.id = tw.trip_id
    WHERE t.user_id = v_user_id AND t.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('trip_id', v_trip_id, 'winery_id', v_winery_id);
    END IF;
  END IF;

  -- Delegate winery upsert to ensure_winery
  v_winery_id := public.ensure_winery(p_winery_data);

  -- Default members to include creator
  v_members := COALESCE(p_members, ARRAY[v_user_id]);
  IF NOT (v_user_id = ANY(v_members)) THEN
    v_members := array_append(v_members, v_user_id);
  END IF;

  -- Create Trip
  INSERT INTO public.trips (user_id, trip_date, name, idempotency_key)
  VALUES (v_user_id, p_trip_date, p_trip_name, p_idempotency_key)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_trip_id;

  IF v_trip_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_trip_id FROM public.trips WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
  END IF;

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

ALTER FUNCTION public.create_trip_with_winery(character varying, date, jsonb, text, uuid[], uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_trip_with_winery(character varying, date, jsonb, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_with_winery(character varying, date, jsonb, text, uuid[], uuid) TO authenticated, service_role;

-- 6.3 Delete Trip
CREATE OR REPLACE FUNCTION public.delete_trip(
  p_trip_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validate authorization (Only owner can delete)
    IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this trip';
    END IF;

    -- Delete relationships
    DELETE FROM public.trip_wineries WHERE trip_id = p_trip_id;
    DELETE FROM public.trip_members WHERE trip_id = p_trip_id;

    -- Delete trip
    DELETE FROM public.trips WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.delete_trip(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_trip(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_trip(integer) TO authenticated, service_role;

-- 6.4 Add Winery to Trip (ID Overload)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
  p_trip_id integer,
  p_winery_id integer,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
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

ALTER FUNCTION public.add_winery_to_trip(integer, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_winery_to_trip(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, integer, text) TO authenticated, service_role;

-- 6.5 Add Winery to Trip (JSONB Overload, Delegates to ensure_winery)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
  p_trip_id integer,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_winery_id integer;
  v_max_order integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Delegate winery upsert to ensure_winery
  v_winery_id := public.ensure_winery(p_winery_data);

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

ALTER FUNCTION public.add_winery_to_trip(integer, jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_winery_to_trip(integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, jsonb, text) TO authenticated, service_role;

-- 6.6 Remove Winery from Trip
CREATE OR REPLACE FUNCTION public.remove_winery_from_trip(
  p_trip_id integer,
  p_winery_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
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

ALTER FUNCTION public.remove_winery_from_trip(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_winery_from_trip(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_winery_from_trip(integer, integer) TO authenticated, service_role;

-- 6.7 Reorder Trip Wineries
CREATE OR REPLACE FUNCTION public.reorder_trip_wineries(
  p_trip_id integer,
  p_winery_ids integer[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
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

ALTER FUNCTION public.reorder_trip_wineries(integer, integer[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_trip_wineries(integer, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_trip_wineries(integer, integer[]) TO authenticated, service_role;

-- 6.8 Update Trip Winery Notes
CREATE OR REPLACE FUNCTION public.update_trip_winery_notes(
  p_trip_id integer,
  p_winery_id integer,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
    -- Verify authorization
    IF NOT public.is_trip_member(p_trip_id) THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- Update notes
    UPDATE public.trip_wineries
    SET notes = p_notes
    WHERE trip_id = p_trip_id AND winery_id = p_winery_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.update_trip_winery_notes(integer, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_trip_winery_notes(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_trip_winery_notes(integer, integer, text) TO authenticated, service_role;

-- 6.9 Log Visit (Delegates to ensure_winery, Scoped Idempotency, Autoclears Wishlist)
CREATE OR REPLACE FUNCTION public.log_visit(
  p_winery_data jsonb,
  p_visit_data jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_is_private boolean;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Scoped idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, winery_id INTO v_visit_id, v_winery_id
    FROM public.visits
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
    END IF;
  END IF;

  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Extract is_private flag
  v_is_private := COALESCE((p_visit_data->>'is_private')::boolean, false);

  -- Delegate winery upsert to ensure_winery
  v_winery_id := public.ensure_winery(p_winery_data);

  -- Insert Visit with composite conflict check
  INSERT INTO public.visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos,
    is_private,
    idempotency_key
  )
  VALUES (
    v_user_id,
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private,
    p_idempotency_key
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_visit_id;

  IF v_visit_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_visit_id FROM public.visits WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
  END IF;

  -- Auto-clear wishlist entry for visited winery (ADR-0001 / Issue #54)
  DELETE FROM public.wishlist
  WHERE user_id = v_user_id AND winery_id = v_winery_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION public.log_visit(jsonb, jsonb, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.log_visit(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_visit(jsonb, jsonb, uuid) TO authenticated, service_role;

-- 6.10 Update Visit (Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.update_visit(
  p_visit_id integer,
  p_visit_data jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_updated_record record;
    v_visit_id integer;
BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Scoped idempotency check
    IF p_idempotency_key IS NOT NULL THEN
      SELECT id INTO v_visit_id
      FROM public.visits
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
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
          WHERE v.id = v_visit_id
        );
      END IF;
    END IF;

    UPDATE public.visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        is_private = COALESCE((p_visit_data->>'is_private')::boolean, is_private),
        idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
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

ALTER FUNCTION public.update_visit(integer, jsonb, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_visit(integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_visit(integer, jsonb, uuid) TO authenticated, service_role;

-- 6.11 Delete Visit
CREATE OR REPLACE FUNCTION public.delete_visit(
  p_visit_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.visits
    WHERE id = p_visit_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.delete_visit(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_visit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_visit(integer) TO authenticated, service_role;

-- 6.12 Toggle Favorite
CREATE OR REPLACE FUNCTION public.toggle_favorite(
  p_winery_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_winery_id integer;
  v_exists boolean;
  v_is_favorite boolean;
BEGIN
  IF p_winery_data IS NULL OR jsonb_typeof(p_winery_data) != 'object' THEN
    RAISE EXCEPTION 'Invalid winery data: payload must be a JSON object';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_winery_id := public.ensure_winery(p_winery_data);
  IF v_winery_id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure winery record';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    v_is_favorite := false;
  ELSE
    INSERT INTO public.favorites (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    v_is_favorite := true;
  END IF;

  RETURN jsonb_build_object('is_favorite', v_is_favorite, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION public.toggle_favorite(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_favorite(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite(jsonb) TO authenticated, service_role;

-- 6.13 Toggle Wishlist
CREATE OR REPLACE FUNCTION public.toggle_wishlist(
  p_winery_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_winery_id integer;
  v_exists boolean;
  v_on_wishlist boolean;
BEGIN
  IF p_winery_data IS NULL OR jsonb_typeof(p_winery_data) != 'object' THEN
    RAISE EXCEPTION 'Invalid winery data: payload must be a JSON object';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_winery_id := public.ensure_winery(p_winery_data);
  IF v_winery_id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure winery record';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    v_on_wishlist := false;
  ELSE
    INSERT INTO public.wishlist (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    v_on_wishlist := true;
  END IF;

  RETURN jsonb_build_object('on_wishlist', v_on_wishlist, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION public.toggle_wishlist(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_wishlist(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist(jsonb) TO authenticated, service_role;

-- 6.14 Toggle Favorite Privacy
CREATE OR REPLACE FUNCTION public.toggle_favorite_privacy(
  p_winery_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_new_state boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.favorites
    SET is_private = NOT is_private,
        created_at = created_at
    WHERE user_id = v_user_id AND winery_id = p_winery_id
    RETURNING is_private INTO v_new_state;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Favorite item not found for this user';
    END IF;

    RETURN jsonb_build_object('success', true, 'is_private', v_new_state);
END;
$$;

ALTER FUNCTION public.toggle_favorite_privacy(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_favorite_privacy(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_privacy(integer) TO authenticated, service_role;

-- 6.15 Toggle Wishlist Privacy
CREATE OR REPLACE FUNCTION public.toggle_wishlist_privacy(
  p_winery_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_new_state boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

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

ALTER FUNCTION public.toggle_wishlist_privacy(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_wishlist_privacy(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist_privacy(integer) TO authenticated, service_role;

-- 6.16 Update Profile Privacy
CREATE OR REPLACE FUNCTION public.update_profile_privacy(
  p_privacy_level public.privacy_level
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.profiles
    SET privacy_level = p_privacy_level
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'privacy_level', p_privacy_level);
END;
$$;

ALTER FUNCTION public.update_profile_privacy(public.privacy_level) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_profile_privacy(public.privacy_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile_privacy(public.privacy_level) TO authenticated, service_role;

-- 6.17 Remove Friend
CREATE OR REPLACE FUNCTION public.remove_friend(
  p_target_friend_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.friends
  WHERE (user1_id = current_user_id AND user2_id = p_target_friend_id)
     OR (user1_id = p_target_friend_id AND user2_id = current_user_id);
END;
$$;

ALTER FUNCTION public.remove_friend(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated, service_role;

-- 6.18 Respond to Friend Request
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_requester_id uuid,
  p_accept boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  new_status text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_accept THEN
    new_status := 'accepted';
  ELSE
    new_status := 'declined';
  END IF;

  UPDATE public.friends
  SET status = new_status,
      updated_at = NOW()
  WHERE user1_id = p_requester_id
    AND user2_id = current_user_id
    AND status = 'pending';
END;
$$;

ALTER FUNCTION public.respond_to_friend_request(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO authenticated, service_role;

-- ============================================================================
-- 7. Trigger Function Privilege Lockdown
-- ============================================================================

-- Internal trigger: user provisioning on auth.users insert
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Internal trigger: outbound webhook dispatch on activity ledger insert
REVOKE ALL ON FUNCTION public.handle_activity_ledger_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_activity_ledger_notification() TO service_role;

-- DML trigger: activity ledger entry creation executed during user writes
REVOKE ALL ON FUNCTION public.handle_activity_ledger_entry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_activity_ledger_entry() TO authenticated, service_role;

-- ============================================================================
-- 8. Client-Facing RLS Policy Modernization & Explicit Authentication
-- ============================================================================

-- Table Grants for client and admin operations
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wishlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_wineries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friends TO authenticated;
GRANT SELECT ON TABLE public.activity_ledger TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 8.1 profiles
DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;

CREATE POLICY "Profiles are viewable based on privacy settings"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_visible_to_viewer(id));

CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- 8.2 visits
DROP POLICY IF EXISTS "Users can view visits based on privacy settings" ON public.visits;
DROP POLICY IF EXISTS "Users can insert their own visits" ON public.visits;
DROP POLICY IF EXISTS "Users can update their own visits" ON public.visits;
DROP POLICY IF EXISTS "Users can delete their own visits" ON public.visits;

CREATE POLICY "Users can view visits based on privacy settings"
ON public.visits FOR SELECT TO authenticated
USING (public.is_visible_to_viewer(user_id, is_private));

CREATE POLICY "Users can insert their own visits"
ON public.visits FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own visits"
ON public.visits FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own visits"
ON public.visits FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 8.3 favorites
DROP POLICY IF EXISTS "Users can view favorites based on privacy settings" ON public.favorites;
DROP POLICY IF EXISTS "Users can insert their own favorite items" ON public.favorites;
DROP POLICY IF EXISTS "Users can update their own favorite items" ON public.favorites;
DROP POLICY IF EXISTS "Users can delete their own favorite items" ON public.favorites;

CREATE POLICY "Users can view favorites based on privacy settings"
ON public.favorites FOR SELECT TO authenticated
USING (public.is_visible_to_viewer(user_id, is_private));

CREATE POLICY "Users can insert their own favorite items"
ON public.favorites FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own favorite items"
ON public.favorites FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorite items"
ON public.favorites FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 8.4 wishlist
DROP POLICY IF EXISTS "Users can view wishlist items based on privacy settings" ON public.wishlist;
DROP POLICY IF EXISTS "Users can insert their own wishlist items" ON public.wishlist;
DROP POLICY IF EXISTS "Users can update their own wishlist items" ON public.wishlist;
DROP POLICY IF EXISTS "Users can delete their own wishlist items" ON public.wishlist;

CREATE POLICY "Users can view wishlist items based on privacy settings"
ON public.wishlist FOR SELECT TO authenticated
USING (public.is_visible_to_viewer(user_id, is_private));

CREATE POLICY "Users can insert their own wishlist items"
ON public.wishlist FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wishlist items"
ON public.wishlist FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wishlist items"
ON public.wishlist FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 8.5 trips
DROP POLICY IF EXISTS "Users can view trips they belong to" ON public.trips;
DROP POLICY IF EXISTS "Users can insert their own trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can update their trips" ON public.trips;
DROP POLICY IF EXISTS "Owners can delete their trips" ON public.trips;

CREATE POLICY "Users can view trips they belong to"
ON public.trips FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_trip_member(id));

CREATE POLICY "Users can insert their own trips"
ON public.trips FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their trips"
ON public.trips FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their trips"
ON public.trips FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 8.6 trip_members
DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can add members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can update member roles" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can remove members" ON public.trip_members;

CREATE POLICY "Users can view members of trips they belong to"
ON public.trip_members FOR SELECT TO authenticated
USING (public.is_trip_member(trip_id));

CREATE POLICY "Trip owners can add members"
ON public.trip_members FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.trips WHERE id = trip_members.trip_id AND user_id = auth.uid()));

CREATE POLICY "Trip owners can update member roles"
ON public.trip_members FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.trips WHERE id = trip_members.trip_id AND user_id = auth.uid()));

CREATE POLICY "Trip owners can remove members"
ON public.trip_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.trips WHERE id = trip_members.trip_id AND user_id = auth.uid()));

-- 8.7 trip_wineries
DROP POLICY IF EXISTS "Members can view trip wineries" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can add wineries to a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can update wineries on a trip" ON public.trip_wineries;
DROP POLICY IF EXISTS "Members can remove wineries from a trip" ON public.trip_wineries;

CREATE POLICY "Members can view trip wineries"
ON public.trip_wineries FOR SELECT TO authenticated
USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can add wineries to a trip"
ON public.trip_wineries FOR INSERT TO authenticated
WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update wineries on a trip"
ON public.trip_wineries FOR UPDATE TO authenticated
USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can remove wineries from a trip"
ON public.trip_wineries FOR DELETE TO authenticated
USING (public.is_trip_member(trip_id));

-- 8.8 friends
DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friends;
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friends;
DROP POLICY IF EXISTS "Users can respond to friend requests" ON public.friends;
DROP POLICY IF EXISTS "Users can delete their own friendships" ON public.friends;

CREATE POLICY "Users can view their own friendships"
ON public.friends FOR SELECT TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create friend requests"
ON public.friends FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user1_id);

CREATE POLICY "Users can respond to friend requests"
ON public.friends FOR UPDATE TO authenticated
USING (auth.uid() = user2_id)
WITH CHECK (status = ANY (ARRAY['accepted'::text, 'declined'::text]));

CREATE POLICY "Users can delete their own friendships"
ON public.friends FOR DELETE TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- 8.9 activity_ledger
DROP POLICY IF EXISTS "Users can view activities based on privacy settings" ON public.activity_ledger;
DROP POLICY IF EXISTS "System can manage activity_ledger" ON public.activity_ledger;

CREATE POLICY "Users can view activities based on privacy settings"
ON public.activity_ledger FOR SELECT TO authenticated
USING (public.is_visible_to_viewer(user_id, privacy_level = 'private'));

CREATE POLICY "System can manage activity_ledger"
ON public.activity_ledger FOR ALL TO service_role
USING (true)
WITH CHECK (true);
