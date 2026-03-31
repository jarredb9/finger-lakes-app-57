-- Update get_trip_details to return structured member objects with profile data
-- Migration: 20260311000001_update_get_trip_details_members.sql

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
        -- Members array with profile data
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
