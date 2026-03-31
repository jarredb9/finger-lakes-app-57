-- Fix search paths and recursion in trip-related RPCs and policies
-- Migration: 20260305200239_fix_rpc_search_paths_and_recursion.sql

-- 1. Redefine is_trip_member with correct search path and explicit uid
CREATE OR REPLACE FUNCTION public.is_trip_member(trip_id_to_check int)
RETURNS boolean AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id = trip_id_to_check
          AND t.user_id = v_user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trip_id_to_check
          AND tm.user_id = v_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 2. Redefine create_trip_with_winery with correct search path
CREATE OR REPLACE FUNCTION public.create_trip_with_winery(
  p_trip_name character varying(255),
  p_trip_date date,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL,
  p_members uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

-- 3. Redefine add_trip_member_by_email with correct search path
CREATE OR REPLACE FUNCTION public.add_trip_member_by_email(
    p_trip_id integer,
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

-- 4. Re-apply the trip_members SELECT policy fix (just in case)
DROP POLICY IF EXISTS "Users can view members of trips they belong to" ON public.trip_members;
CREATE POLICY "Users can view members of trips they belong to" 
ON public.trip_members FOR SELECT 
USING (
    public.is_trip_member(trip_id)
);
