-- ============================================================================
-- Migration: 20261104110000_harden_trips_and_wineries.sql
-- Description: Hardens trip_members RLS, validates mutual friendship in trip RPCs,
--              and enforces catalog input validation on ensure_winery.
-- ADR References: ADR-0007, ADR-0010
-- Tracking: Issue #93, Phase 2 (Green phase)
-- ============================================================================

-- 1. Harden public.trip_members RLS Policies
-- 1.1 INSERT: Require caller to be trip owner AND candidate member to be owner or accepted mutual friend
DROP POLICY IF EXISTS "Trip owners can add members" ON public.trip_members;
CREATE POLICY "Trip owners can add members"
ON public.trip_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.trips WHERE id = trip_members.trip_id AND user_id = auth.uid())
  AND (
    trip_members.user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.friends
      WHERE status = 'accepted'
        AND (
          (user1_id = auth.uid() AND user2_id = trip_members.user_id)
          OR
          (user2_id = auth.uid() AND user1_id = trip_members.user_id)
        )
    )
  )
);

-- 1.2 DELETE: Permit trip owner OR member themselves (user_id = auth.uid()) to delete membership row
DROP POLICY IF EXISTS "Trip owners can remove members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners or members themselves can remove membership" ON public.trip_members;
CREATE POLICY "Trip owners or members themselves can remove membership"
ON public.trip_members FOR DELETE TO authenticated
USING (
  trip_members.user_id = auth.uid()
  OR
  EXISTS (SELECT 1 FROM public.trips WHERE id = trip_members.trip_id AND user_id = auth.uid())
);

-- 2. Harden public.create_trip_with_winery RPC (Validate Mutual Friendship for Members)
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
  v_member_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate members: all candidate members must be caller or accepted mutual friends
  IF p_members IS NOT NULL THEN
    FOREACH v_member_id IN ARRAY p_members
    LOOP
      IF v_member_id IS NULL OR v_member_id <> v_user_id THEN
        IF v_member_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.friends
          WHERE status = 'accepted'
            AND ((user1_id = v_user_id AND user2_id = v_member_id)
              OR (user2_id = v_user_id AND user1_id = v_member_id))
        ) THEN
          RAISE EXCEPTION 'Trip members must be accepted mutual friends';
        END IF;
      END IF;
    END LOOP;
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

-- 3. Harden public.add_trip_member_by_email RPC (Exact Match & Mutual Friendship Gate)
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

    -- 2. Find target user by exact normalized lower-case email
    SELECT id INTO v_target_user_id
    FROM public.profiles
    WHERE LOWER(email) = LOWER(TRIM(p_email));

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_email;
    END IF;

    -- 3. Verify target user is an accepted mutual friend of the caller
    IF NOT EXISTS (
        SELECT 1 FROM public.friends
        WHERE status = 'accepted'
          AND ((user1_id = v_user_id AND user2_id = v_target_user_id)
            OR (user2_id = v_user_id AND user1_id = v_target_user_id))
    ) THEN
        RAISE EXCEPTION 'Trip members must be accepted mutual friends';
    END IF;

    -- 4. Add to trip_members
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    VALUES (p_trip_id, v_target_user_id, 'member', 'joined')
    ON CONFLICT (trip_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_user_id);
END;
$$;

ALTER FUNCTION public.add_trip_member_by_email(integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_trip_member_by_email(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_trip_member_by_email(integer, text) TO authenticated, service_role;

-- 4. Harden public.ensure_winery (Input Validation for Coordinates, Rating, and Website URL)
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
  v_raw_rating numeric;
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

  -- 1. Rating validation (bounds 0..5, normalize 0 to NULL)
  IF (p_winery_data->>'rating') IS NOT NULL AND trim(p_winery_data->>'rating') <> '' THEN
    v_raw_rating := (p_winery_data->>'rating')::numeric;
  ELSIF (p_winery_data->>'google_rating') IS NOT NULL AND trim(p_winery_data->>'google_rating') <> '' THEN
    v_raw_rating := (p_winery_data->>'google_rating')::numeric;
  ELSE
    v_raw_rating := NULL;
  END IF;

  IF v_raw_rating IS NOT NULL AND (v_raw_rating < 0 OR v_raw_rating > 5) THEN
    RAISE EXCEPTION 'Rating must be between 0 and 5';
  END IF;

  v_rating := CASE 
    WHEN v_raw_rating > 0 THEN v_raw_rating 
    ELSE NULL 
  END;

  -- 2. Coordinates validation (latitude -90..90, longitude -180..180)
  v_lat := (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric;
  v_lng := (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric;

  IF v_lat IS NOT NULL AND (v_lat < -90 OR v_lat > 90) THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF v_lng IS NOT NULL AND (v_lng < -180 OR v_lng > 180) THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  -- 3. Website URL protocol validation (HTTP/HTTPS only)
  IF p_winery_data->>'website' IS NOT NULL 
     AND trim(p_winery_data->>'website') <> '' 
     AND (p_winery_data->>'website') !~* '^https?://' THEN
    RAISE EXCEPTION 'Website must be a valid HTTP or HTTPS URL';
  END IF;

  -- 4. Check if winery already exists
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

  -- 5. New winery: insert with fallbacks for NOT NULL columns
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
