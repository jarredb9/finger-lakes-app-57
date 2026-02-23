-- Update get_friends_and_requests to include auth_uid for debugging
CREATE OR REPLACE FUNCTION public.get_friends_and_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'debug_auth_uid', v_user_id,
        'friends', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON (f.user1_id = v_user_id AND f.user2_id = p.id) OR (f.user2_id = v_user_id AND f.user1_id = p.id)
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
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'sent_requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'email', p.email
                )
            ), '[]'::jsonb)
            FROM friends f
            JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        )
    ) INTO result;

    RETURN result;
END;
$$;
