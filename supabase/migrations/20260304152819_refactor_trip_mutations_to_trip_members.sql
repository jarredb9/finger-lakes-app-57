-- Refactor trip mutation RPCs to manage trip_members join table
-- Ensures atomic synchronization between trips.members (legacy) and trip_members (new)

-- 1. Redefine is_trip_member to use trip_members
CREATE OR REPLACE FUNCTION public.is_trip_member(trip_id_to_check int)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id = trip_id_to_check
          AND (auth.uid() = t.user_id)
    ) OR EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trip_id_to_check
          AND tm.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Redefine create_trip_with_winery
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

  -- Create Trip
  INSERT INTO public.trips (user_id, trip_date, name, members)
  VALUES (auth.uid(), p_trip_date, p_trip_name, v_members)
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

-- 3. Redefine remove_winery_from_trip
CREATE OR REPLACE FUNCTION public.remove_winery_from_trip(
  p_trip_id integer,
  p_winery_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 4. Redefine add_winery_to_trips
CREATE OR REPLACE FUNCTION public.add_winery_to_trips(
    p_winery_id integer,
    p_trip_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 5. Redefine delete_trip
CREATE OR REPLACE FUNCTION public.delete_trip(p_trip_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Validate authorization
    IF NOT public.is_trip_member(p_trip_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this trip';
    END IF;

    -- 2. Delete relationships (Required if no ON DELETE CASCADE)
    -- trip_wineries has ON DELETE CASCADE in the schema usually, but explicit delete is safer.
    DELETE FROM public.trip_wineries WHERE trip_id = p_trip_id;
    -- trip_members has ON DELETE CASCADE from migration 20260304120000

    -- 3. Delete trip
    DELETE FROM public.trips WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Redefine add_trip_member_by_email
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

    -- 4. Add member to the array (legacy support)
    UPDATE public.trips
    SET members = array_append(members, v_target_user_id)
    WHERE id = p_trip_id;

    -- 5. Add member to trip_members
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    VALUES (p_trip_id, v_target_user_id, 'member', 'joined')
    ON CONFLICT (trip_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'user_id', v_target_user_id);
END;
$$;

-- 7. Redefine update_trip_winery_notes
CREATE OR REPLACE FUNCTION public.update_trip_winery_notes(
    p_trip_id integer,
    p_winery_id integer,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 8. Redefine add_winery_to_trip (jsonb version)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
  p_trip_id integer,
  p_winery_data jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 9. Redefine add_winery_to_trip (integer version)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
    trip_id_param integer,
    winery_id_param integer,
    notes_param text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_order integer;
BEGIN
    -- Check if user is a member of the trip
    IF NOT public.is_trip_member(trip_id_param) THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- Lock the trip rows to prevent concurrent updates to order
    PERFORM 1 FROM public.trip_wineries WHERE trip_id = trip_id_param FOR UPDATE;

    -- Calculate the next visit order safely
    SELECT COALESCE(MAX(visit_order), -1) + 1
    INTO next_order
    FROM public.trip_wineries
    WHERE trip_id = trip_id_param;

    -- Insert the new winery
    INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
    VALUES (trip_id_param, winery_id_param, next_order, notes_param)
    ON CONFLICT (trip_id, winery_id) DO NOTHING;

    RETURN true;
END;
$$;

-- 10. reorder_trip_wineries
CREATE OR REPLACE FUNCTION public.reorder_trip_wineries(
  p_trip_id integer,
  p_winery_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winery_id integer;
  v_index integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Clear current orders (optional, but ensures fresh start)
  -- Or just update them in a loop.
  
  FOR v_index IN 1..array_length(p_winery_ids, 1) LOOP
    v_winery_id := p_winery_ids[v_index];
    
    UPDATE public.trip_wineries
    SET visit_order = v_index - 1
    WHERE trip_id = p_trip_id AND winery_id = v_winery_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Ensure grants are correct
GRANT EXECUTE ON FUNCTION public.is_trip_member(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_with_winery(character varying, date, jsonb, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_winery_from_trip(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trips(integer, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_trip_member_by_email(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_winery_notes(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_winery_to_trip(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_trip_wineries(integer, integer[]) TO authenticated;
