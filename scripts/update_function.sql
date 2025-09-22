CREATE OR REPLACE FUNCTION get_friends_ratings_for_winery(winery_id_param integer)
RETURNS TABLE(user_id uuid, name text, email text, rating integer, user_review text, photos text[])
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.name,
        p.email,
        v.rating,
        v.user_review,
        v.photos
    FROM
        visits v
    JOIN
        profiles p ON v.user_id = p.id
    WHERE
        v.winery_id = winery_id_param
        AND v.user_id IN (SELECT friend_id FROM get_friends_ids())
        AND (v.rating IS NOT NULL OR v.user_review IS NOT NULL);
END;
$$;