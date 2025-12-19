-- fix_get_paginated_visits_return_fields.sql
-- Update get_paginated_visits_with_winery_and_friends to return google_place_id

CREATE OR REPLACE FUNCTION get_paginated_visits_with_winery_and_friends(
    page_number int,
    page_size int
)
RETURNS TABLE (
    visit_id integer,
    visit_date date,
    user_review text,
    rating integer,
    photos text[],
    winery_id integer,
    winery_name character varying(255),
    winery_address text,
    google_place_id character varying(255),
    friend_visits jsonb
) AS $$
BEGIN
    RETURN QUERY
    WITH user_and_friends_visits AS (
        SELECT
            v.id as visit_id,
            v.visit_date,
            v.user_review,
            v.rating,
            v.photos,
            v.winery_id,
            w.name as winery_name,
            w.address as winery_address,
            w.google_place_id,
            v.user_id
        FROM visits v
        JOIN wineries w ON v.winery_id = w.id
        WHERE v.user_id = auth.uid() OR v.user_id IN (SELECT friend_id FROM get_friends_ids())
    ),
    aggregated_friend_visits AS (
        SELECT
            fv.winery_id,
            fv.visit_date,
            jsonb_agg(jsonb_build_object(
                'user_id', fv.user_id,
                'name', p.name,
                'rating', fv.rating,
                'user_review', fv.user_review
            )) as friend_visits
        FROM user_and_friends_visits fv
        JOIN profiles p ON fv.user_id = p.id
        WHERE fv.user_id != auth.uid()
        GROUP BY fv.winery_id, fv.visit_date
    )
    SELECT
        uv.visit_id,
        uv.visit_date,
        uv.user_review,
        uv.rating,
        uv.photos,
        uv.winery_id,
        uv.winery_name,
        uv.winery_address,
        uv.google_place_id,
        afv.friend_visits
    FROM user_and_friends_visits uv
    LEFT JOIN aggregated_friend_visits afv ON uv.winery_id = afv.winery_id AND uv.visit_date = afv.visit_date
    WHERE uv.user_id = auth.uid()
    ORDER BY uv.visit_date DESC, uv.visit_id DESC
    LIMIT page_size
    OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_paginated_visits_with_winery_and_friends(int, int) TO authenticated;
