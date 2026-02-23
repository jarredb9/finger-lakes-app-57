-- Harden get_friends_and_requests with LEFT JOINs and fallbacks
-- This ensures friendship data is returned even if profiles are not yet initialized.

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
                    'id', COALESCE(p.id, f.other_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM (
                SELECT CASE WHEN user1_id = v_user_id THEN user2_id ELSE user1_id END as other_id
                FROM friends 
                WHERE (user1_id = v_user_id OR user2_id = v_user_id) AND status = 'accepted'
            ) f
            LEFT JOIN profiles p ON f.other_id = p.id
        ),
        'requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.user1_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM friends f
            LEFT JOIN profiles p ON f.user1_id = p.id
            WHERE f.user2_id = v_user_id AND f.status = 'pending'
        ),
        'sent_requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.user2_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM friends f
            LEFT JOIN profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        )
    ) INTO result;

    RETURN result;
END;
$$;
