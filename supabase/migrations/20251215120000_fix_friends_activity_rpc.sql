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
