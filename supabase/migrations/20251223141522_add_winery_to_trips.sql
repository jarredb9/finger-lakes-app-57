-- RPC to add a single winery to multiple trips atomically
-- Handles membership validation and visit order calculation for each trip.

CREATE OR REPLACE FUNCTION add_winery_to_trips(
    p_winery_id integer,
    p_trip_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_trip_id integer;
    v_max_order integer;
    v_added_count integer := 0;
BEGIN
    -- Loop through each trip ID
    FOREACH v_trip_id IN ARRAY p_trip_ids
    LOOP
        -- 1. Validate membership for this specific trip
        IF EXISTS (
            SELECT 1 FROM trips 
            WHERE id = v_trip_id AND (user_id = v_user_id OR v_user_id = ANY(members))
        ) THEN
            -- 2. Get current max order for this trip
            SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
            FROM trip_wineries
            WHERE trip_id = v_trip_id;

            -- 3. Insert relationship (ignore if already exists in this trip)
            INSERT INTO trip_wineries (trip_id, winery_id, visit_order)
            VALUES (v_trip_id, p_winery_id, v_max_order + 1)
            ON CONFLICT (trip_id, winery_id) DO NOTHING;

            v_added_count := v_added_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'trips_processed', array_length(p_trip_ids, 1), 'added_to', v_added_count);
END;
$$;

GRANT EXECUTE ON FUNCTION add_winery_to_trips(integer, integer[]) TO authenticated;
