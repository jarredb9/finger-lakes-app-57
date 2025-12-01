-- Atomic function to add a winery to a trip
-- Prevents race conditions on 'visit_order' by handling the logic inside a transaction/lock

CREATE OR REPLACE FUNCTION add_winery_to_trip(
    trip_id_param integer,
    winery_id_param integer,
    notes_param text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    next_order integer;
BEGIN
    -- Check if user is a member of the trip (security check)
    IF NOT EXISTS (
        SELECT 1 FROM trips 
        WHERE id = trip_id_param 
        AND (user_id = auth.uid() OR auth.uid() = ANY(members))
    ) THEN
        RAISE EXCEPTION 'Not authorized to modify this trip';
    END IF;

    -- Lock the trip rows to prevent concurrent updates to order
    PERFORM 1 FROM trip_wineries WHERE trip_id = trip_id_param FOR UPDATE;

    -- Calculate the next visit order safely
    SELECT COALESCE(MAX(visit_order), -1) + 1
    INTO next_order
    FROM trip_wineries
    WHERE trip_id = trip_id_param;

    -- Insert the new winery
    INSERT INTO trip_wineries (trip_id, winery_id, visit_order, notes)
    VALUES (trip_id_param, winery_id_param, next_order, notes_param);

    RETURN true;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION add_winery_to_trip(integer, integer, text) TO authenticated;
