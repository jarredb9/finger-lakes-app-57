-- Update get_trip_details and get_trips_for_date to return updated_at
-- Migration: 20260402000001_update_trip_rpcs_updated_at.sql

CREATE OR REPLACE FUNCTION public.get_trip_details(trip_id_param integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid;
    v_trip_record record;
    v_result jsonb;
    v_is_member boolean;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Fetch main trip record
    SELECT * INTO v_trip_record
    FROM public.trips
    WHERE id = trip_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found (ID: %)', trip_id_param;
    END IF;

    -- 2. Verify access
    v_is_member := public.is_trip_member(trip_id_param);
    
    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Access denied for trip % (User: %)', trip_id_param, COALESCE(v_user_id::text, 'NULL');
    END IF;

    -- 3. Assemble result
    SELECT jsonb_build_object(
        'id', v_trip_record.id,
        'user_id', v_trip_record.user_id,
        'trip_date', v_trip_record.trip_date,
        'name', v_trip_record.name,
        'updated_at', v_trip_record.updated_at,
        'members', (
            SELECT COALESCE(jsonb_agg(m_data), '[]'::jsonb)
            FROM (
                SELECT 
                    tm.user_id as id,
                    tm.role,
                    tm.status,
                    p.name,
                    p.email
                FROM public.trip_members tm
                JOIN public.profiles p ON tm.user_id = p.id
                WHERE tm.trip_id = trip_id_param
            ) m_data
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
                    tw.updated_at,
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

-- Update get_trips_for_date to include updated_at
DROP FUNCTION IF EXISTS public.get_trips_for_date(date);
CREATE OR REPLACE FUNCTION public.get_trips_for_date(target_date date)
RETURNS TABLE(id integer, user_id uuid, trip_date date, name text, updated_at timestamp with time zone, wineries jsonb)
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
        t.name::text, -- Explicit cast to match RETURNS TABLE
        t.updated_at,
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
            tw.notes,
            tw.updated_at
        FROM trip_wineries tw
        JOIN wineries w ON tw.winery_id = w.id
    ) w_data ON t.id = w_data.trip_id
    WHERE t.trip_date = target_date
      AND public.is_trip_member(t.id)
    GROUP BY t.id, t.user_id, t.trip_date, t.name, t.updated_at;
END;
$$;
