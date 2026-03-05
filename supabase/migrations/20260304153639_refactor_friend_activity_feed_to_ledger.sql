-- Refactor get_friend_activity_feed to pull from activity_ledger
-- Centralizes social feed logic and improves performance

CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(limit_val int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_feed jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          al.activity_type,
          al.created_at,
          al.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          COALESCE(p.email, 'unknown')::text as user_email,
          (al.metadata->>'winery_id')::integer as winery_id,
          (al.metadata->>'winery_name')::text as winery_name,
          (al.metadata->>'rating')::integer as visit_rating,
          (al.metadata->>'user_review')::text as visit_review,
          CASE 
            WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
            ELSE ARRAY[]::text[]
          END as visit_photos
        FROM public.activity_ledger al
        LEFT JOIN public.profiles p ON al.user_id = p.id
        WHERE 
          al.user_id != v_user_id -- Don't show self in friend activity feed
          
          -- Ensure they are friends or following (feed is for social activity)
          AND (
            EXISTS (
              SELECT 1 FROM public.friends f
              WHERE f.status = 'accepted'
                AND (
                  (f.user1_id = v_user_id AND f.user2_id = al.user_id)
                  OR
                  (f.user2_id = v_user_id AND f.user1_id = al.user_id)
                )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = al.user_id
            )
          )
        ORDER BY al.created_at DESC
        LIMIT limit_val
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;
