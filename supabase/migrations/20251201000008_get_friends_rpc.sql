-- RPC to fetch accepted friends and pending friend requests in a single call.
-- Replaces multiple round-trips in /api/friends.

CREATE OR REPLACE FUNCTION get_friends_and_requests()
RETURNS jsonb AS $$
DECLARE
    user_id uuid := auth.uid();
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'friends', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON (f.user1_id = user_id AND f.user2_id = p.id) OR (f.user2_id = user_id AND f.user1_id = p.id)
            WHERE f.status = 'accepted'
        ),
        'requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = user_id AND f.status = 'pending'
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_friends_and_requests() TO authenticated;
