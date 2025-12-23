-- RPC to delete a trip and all its winery relationships atomically.
-- Verifies ownership or membership before deletion.

CREATE OR REPLACE FUNCTION delete_trip(p_trip_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    -- 1. Validate authorization (Owner or Member)
    -- Usually only owners should delete, but based on current Service logic, members might have access.
    -- I'll stick to Owner OR Member for consistency with existing service logic.
    IF NOT EXISTS (
        SELECT 1 FROM trips 
        WHERE id = p_trip_id AND (user_id = v_user_id OR v_user_id = ANY(members))
    ) THEN
        RAISE EXCEPTION 'Not authorized to delete this trip';
    END IF;

    -- 2. Delete relationships (Required if no ON DELETE CASCADE)
    DELETE FROM trip_wineries WHERE trip_id = p_trip_id;

    -- 3. Delete trip
    DELETE FROM trips WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_trip(integer) TO authenticated;
