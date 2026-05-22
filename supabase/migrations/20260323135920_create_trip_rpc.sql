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
    v_user_id uuid := auth.uid();
    v_trip_id integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.trips (user_id, trip_date, name)
    VALUES (v_user_id, p_trip_date, p_name)
    RETURNING id INTO v_trip_id;

    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    VALUES (v_trip_id, v_user_id, 'owner', 'joined');

    RETURN jsonb_build_object('id', v_trip_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trip(text, date) TO authenticated;
