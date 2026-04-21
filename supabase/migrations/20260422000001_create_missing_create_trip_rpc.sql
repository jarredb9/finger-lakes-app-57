-- Create missing create_trip RPC
-- This RPC creates a new trip and adds the creator as the owner in trip_members.

-- Drop existing version if it exists with different types (text vs varchar)
DROP FUNCTION IF EXISTS public.create_trip(text, date);
DROP FUNCTION IF EXISTS public.create_trip(character varying, date);

CREATE OR REPLACE FUNCTION public.create_trip(
  p_name text,
  p_trip_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

GRANT EXECUTE ON FUNCTION public.create_trip(text, date) TO authenticated;
