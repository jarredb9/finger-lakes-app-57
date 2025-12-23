-- RPCs for visit mutations (Update and Delete)
-- These provide atomicity and ensure only the owner can modify their visits.

-- 1. update_visit
CREATE OR REPLACE FUNCTION update_visit(
    p_visit_id integer,
    p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_updated_record record;
BEGIN
    -- Update the visit, ensuring it belongs to the current user
    UPDATE visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        updated_at = NOW()
    WHERE id = p_visit_id AND user_id = v_user_id
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    -- Return the updated record joined with winery data
    RETURN (
        SELECT jsonb_build_object(
            'id', v.id,
            'user_id', v.user_id,
            'visit_date', v.visit_date,
            'rating', v.rating,
            'user_review', v.user_review,
            'photos', v.photos,
            'winery_id', v.winery_id,
            'winery_name', w.name,
            'winery_address', w.address,
            'google_place_id', w.google_place_id
        )
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        WHERE v.id = v_updated_record.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION update_visit(integer, jsonb) TO authenticated;

-- 2. delete_visit
CREATE OR REPLACE FUNCTION delete_visit(p_visit_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    DELETE FROM visits
    WHERE id = p_visit_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_visit(integer) TO authenticated;
