-- Fix create_trip_with_winery RPC to remove references to the dropped members column
-- Migration: 20260305140135_fix_create_trip_with_winery_rpc.sql

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
SET search_path = public
AS $$
DECLARE
  v_winery_id integer;
  v_trip_id integer;
  v_members uuid[];
BEGIN
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
  v_members := COALESCE(p_members, ARRAY[auth.uid()]);
  -- Ensure creator is in members if p_members was provided but missed creator
  IF NOT (auth.uid() = ANY(v_members)) THEN
    v_members := array_append(v_members, auth.uid());
  END IF;

  -- Create Trip (REMOVE members column)
  INSERT INTO public.trips (user_id, trip_date, name)
  VALUES (auth.uid(), p_trip_date, p_trip_name)
  RETURNING id INTO v_trip_id;

  -- Add members to trip_members join table
  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  SELECT v_trip_id, u_id, 
         CASE WHEN u_id = auth.uid() THEN 'owner' ELSE 'member' END,
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

-- 2. Redefine add_trip_member_by_email
CREATE OR REPLACE FUNCTION public.add_trip_member_by_email(
    p_trip_id integer,
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user_id uuid;
    v_is_owner boolean;
BEGIN
    -- 1. Verify caller is the trip owner
    SELECT (user_id = auth.uid()) INTO v_is_owner
    FROM public.trips
    WHERE id = p_trip_id;

    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Only trip owners can add new members';
    END IF;

    -- 2. Find target user by email
    SELECT id INTO v_target_user_id
    FROM public.profiles
    WHERE email ILIKE TRIM(p_email);

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_email;
    END IF;

    -- 3. Check if already a member in trip_members
    IF EXISTS (
        SELECT 1 FROM public.trip_members 
        WHERE trip_id = p_trip_id AND user_id = v_target_user_id
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'User is already a member');
    END IF;

    -- 4. REMOVED: Add member to the array (legacy support)
    -- UPDATE public.trips
    -- SET members = array_append(members, v_target_user_id)
    -- WHERE id = p_trip_id;

    -- 5. Add member to trip_members
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    VALUES (p_trip_id, v_target_user_id, 'member', 'joined')
    ON CONFLICT (trip_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_user_id);
END;
$$;
