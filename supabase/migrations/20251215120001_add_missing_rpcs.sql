-- Fix for get_friends_activity_for_winery (Error 22P02)
-- Correcting variable types from JSON[] to JSON
CREATE OR REPLACE FUNCTION get_friends_activity_for_winery(winery_id_param integer)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    friends_list UUID[];
    favorited_by_list JSON;
    wishlisted_by_list JSON;
BEGIN
    -- Get the current user's friends
    SELECT ARRAY(
        SELECT
            CASE
                WHEN f.user1_id = auth.uid() THEN f.user2_id
                ELSE f.user1_id
            END
        FROM friends f
        WHERE (f.user1_id = auth.uid() OR f.user2_id = auth.uid()) AND f.status = 'accepted'
    ) INTO friends_list;

    -- Get friends who favorited the winery
    SELECT COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email)), '[]')
    INTO favorited_by_list
    FROM profiles p
    JOIN favorites f ON p.id = f.user_id
    WHERE f.winery_id = winery_id_param AND p.id = ANY(friends_list);

    -- Get friends who have the winery on their wishlist
    SELECT COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email)), '[]')
    INTO wishlisted_by_list
    FROM profiles p
    JOIN wishlist w ON p.id = w.user_id
    WHERE w.winery_id = winery_id_param AND p.id = ANY(friends_list);

    -- Return the result as JSON
    RETURN json_build_object(
        'favoritedBy', favorited_by_list,
        'wishlistedBy', wishlisted_by_list
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_friends_activity_for_winery(integer) TO authenticated;


-- Add missing function get_paginated_visits_with_winery_and_friends (Error 404)
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
