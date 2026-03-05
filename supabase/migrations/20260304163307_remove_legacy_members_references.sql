-- Refactor remaining RPCs to remove legacy members column references

-- 1. Redefine get_trips_for_date (DROP first due to return type change)
DROP FUNCTION IF EXISTS public.get_trips_for_date(date);
CREATE OR REPLACE FUNCTION public.get_trips_for_date(target_date date)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name text, wineries jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, 
        t.user_id, 
        t.trip_date, 
        t.name,
        COALESCE(jsonb_agg(row_to_json(w_data)) FILTER (WHERE w_data.id IS NOT NULL), '[]'::jsonb) as wineries
    FROM trips t
    LEFT JOIN (
        SELECT 
            tw.trip_id,
            w.id,
            w.google_place_id,
            w.name,
            w.address,
            w.latitude,
            w.longitude,
            tw.visit_order,
            tw.notes
        FROM trip_wineries tw
        JOIN wineries w ON tw.winery_id = w.id
    ) w_data ON t.id = w_data.trip_id
    WHERE t.trip_date = target_date
      AND public.is_trip_member(t.id)
    GROUP BY t.id, t.user_id, t.trip_date, t.name;
END;
$$;

-- 2. Redefine delete_trip (Ensuring no references to members)
CREATE OR REPLACE FUNCTION public.delete_trip(p_trip_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    -- 1. Validate authorization (Only owner can delete)
    IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this trip';
    END IF;

    -- 2. Delete relationships
    DELETE FROM public.trip_wineries WHERE trip_id = p_trip_id;
    DELETE FROM public.trip_members WHERE trip_id = p_trip_id;

    -- 3. Delete trip
    DELETE FROM public.trips WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Redefine get_trip_details (Pull members from trip_members table)
CREATE OR REPLACE FUNCTION public.get_trip_details(trip_id_param integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_trip_record record;
    v_result jsonb;
BEGIN
    -- 1. Fetch main trip record and verify access
    SELECT * INTO v_trip_record
    FROM public.trips
    WHERE id = trip_id_param
      AND public.is_trip_member(id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found or access denied';
    END IF;

    -- 2. Assemble result with wineries and members from new table
    SELECT jsonb_build_object(
        'id', v_trip_record.id,
        'user_id', v_trip_record.user_id,
        'trip_date', v_trip_record.trip_date,
        'name', v_trip_record.name,
        -- Members array for frontend compatibility (from join table)
        'members', (
            SELECT COALESCE(jsonb_agg(tm.user_id), '[]'::jsonb)
            FROM public.trip_members tm
            WHERE tm.trip_id = trip_id_param
        ),
        'wineries', (
            SELECT COALESCE(jsonb_agg(row_to_json(w_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    w.id as "dbId",
                    w.google_place_id as id,
                    w.name,
                    w.address,
                    w.latitude as lat,
                    w.longitude as lng,
                    tw.visit_order,
                    tw.notes,
                    (
                        SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
                        FROM (
                            SELECT 
                                v.id,
                                v.visit_date,
                                v.user_review,
                                v.rating,
                                v.user_id,
                                COALESCE(v.photos, ARRAY[]::text[]) as photos,
                                p.name as user_name
                            FROM public.visits v
                            JOIN public.profiles p ON v.user_id = p.id
                            WHERE v.winery_id = w.id
                              -- Show visits from trip members OR owner
                              AND (
                                  v.user_id = v_trip_record.user_id 
                                  OR 
                                  EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = trip_id_param AND user_id = v.user_id)
                              )
                              AND public.is_visible_to_viewer(v.user_id, v.is_private)
                        ) v_data
                    ) as visits
                FROM public.trip_wineries tw
                JOIN public.wineries w ON tw.winery_id = w.id
                WHERE tw.trip_id = trip_id_param
                ORDER BY tw.visit_order ASC
            ) w_data
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trips_for_date(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_details(integer) TO authenticated;
