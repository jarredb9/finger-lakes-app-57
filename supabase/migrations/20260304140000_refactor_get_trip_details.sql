-- Refactor get_trip_details to use trip_members table
CREATE OR REPLACE FUNCTION public.get_trip_details(trip_id_param integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_trip_record record;
    v_result jsonb;
    v_member_ids uuid[];
BEGIN
    -- 1. Verify access via trip_members table (or owner)
    SELECT * INTO v_trip_record
    FROM trips
    WHERE id = trip_id_param 
      AND (
        user_id = v_user_id 
        OR EXISTS (
            SELECT 1 FROM trip_members 
            WHERE trip_id = trip_id_param AND user_id = v_user_id
        )
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found or unauthorized';
    END IF;

    -- 2. Get all member IDs for this trip (for visit filtering)
    SELECT array_agg(user_id) INTO v_member_ids
    FROM trip_members
    WHERE trip_id = trip_id_param;

    -- 3. Build the result object
    SELECT jsonb_build_object(
        'id', v_trip_record.id,
        'user_id', v_trip_record.user_id,
        'trip_date', v_trip_record.trip_date,
        'name', v_trip_record.name,
        'created_at', v_trip_record.created_at,
        'members', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', tm.user_id,
                    'role', tm.role,
                    'status', tm.status,
                    'name', p.name
                )
            ), '[]'::jsonb)
            FROM trip_members tm
            JOIN profiles p ON tm.user_id = p.id
            WHERE tm.trip_id = trip_id_param
        ),
        'wineries', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', w.google_place_id,
                    'dbId', w.id,
                    'name', w.name,
                    'address', w.address,
                    'lat', w.latitude,
                    'lng', w.longitude,
                    'phone', w.phone,
                    'website', w.website,
                    'rating', w.google_rating,
                    'notes', tw.notes,
                    'visit_order', tw.visit_order,
                    'visits', (
                        -- Nested visits by ANY trip member on THIS specific trip date
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', v.id,
                                'user_id', v.user_id,
                                'visit_date', v.visit_date,
                                'rating', v.rating,
                                'user_review', v.user_review,
                                'photos', v.photos,
                                'user_name', p.name
                            ) ORDER BY v.created_at DESC
                        ), '[]'::jsonb)
                        FROM visits v
                        JOIN profiles p ON v.user_id = p.id
                        WHERE v.winery_id = w.id 
                          AND v.visit_date = v_trip_record.trip_date
                          AND (v.user_id = ANY(v_member_ids))
                    )
                ) ORDER BY tw.visit_order ASC
            ), '[]'::jsonb)
            FROM trip_wineries tw
            JOIN wineries w ON tw.winery_id = w.id
            WHERE tw.trip_id = trip_id_param
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;
