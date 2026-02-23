-- Resolve Postgres function overloading for friends list
-- 1. Drop BOTH known signatures to ensure a clean state
DROP FUNCTION IF EXISTS public.get_friends_and_requests();
DROP FUNCTION IF EXISTS public.get_friends_and_requests(uuid);

-- 2. Recreate the function with NO arguments
-- PostgREST will now match rpc('get_friends_and_requests') unambiguously.
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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('friends', '[]'::jsonb, 'requests', '[]'::jsonb, 'sent_requests', '[]'::jsonb);
    END IF;

    SELECT jsonb_build_object(
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
                FROM public.friends 
                WHERE (user1_id = v_user_id OR user2_id = v_user_id) AND status = 'accepted'
            ) f
            LEFT JOIN public.profiles p ON f.other_id = p.id
        ),
        'requests', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', COALESCE(p.id, f.user1_id),
                    'name', COALESCE(p.name, 'Someone'),
                    'email', COALESCE(p.email, 'unknown')
                )
            ), '[]'::jsonb)
            FROM public.friends f
            LEFT JOIN public.profiles p ON f.user1_id = p.id
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
            FROM public.friends f
            LEFT JOIN public.profiles p ON f.user2_id = p.id
            WHERE f.user1_id = v_user_id AND f.status = 'pending'
        )
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_and_requests() TO authenticated;
