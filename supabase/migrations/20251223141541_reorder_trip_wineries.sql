-- RPC to reorder wineries within a trip atomically.
-- Accepts an array of winery IDs in the desired order.
-- Preserves existing notes for each winery relationship.

CREATE OR REPLACE FUNCTION reorder_trip_wineries(
    p_trip_id integer,
    p_winery_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_winery_id integer;
    v_index integer := 0;
BEGIN
    -- 1. Validate membership
    IF NOT EXISTS (
        SELECT 1 FROM trips 
        WHERE id = p_trip_id AND (user_id = v_user_id OR v_user_id = ANY(members))
    ) THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- 2. Update order for each winery in the provided array
    -- We use a loop to ensure we only update wineries that belong to this trip
    FOREACH v_winery_id IN ARRAY p_winery_ids
    LOOP
        UPDATE trip_wineries
        SET visit_order = v_index
        WHERE trip_id = p_trip_id AND winery_id = v_winery_id;
        
        v_index := v_index + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_trip_wineries(integer, integer[]) TO authenticated;
