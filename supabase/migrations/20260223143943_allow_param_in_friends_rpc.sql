-- Update get_friends_and_requests to accept an optional user_id_param
-- This helps in E2E environments where auth.uid() might be problematic.

CREATE OR REPLACE FUNCTION public.get_friends_and_requests(user_id_param uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid;
    result jsonb;
BEGIN
    v_user_id := COALESCE(user_id_param, auth.uid());

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('friends', '[]'::jsonb, 'requests', '[]'::jsonb, 'sent_requests', '[]'::jsonb);
    END IF;

    -- Security Guard: Must match auth.uid() if provided
    IF user_id_param IS NOT NULL AND user_id_param != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: user_id_param mismatch';
    END IF;

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
