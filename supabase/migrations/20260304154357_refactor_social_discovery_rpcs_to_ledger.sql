-- Refactor social discovery RPCs to pull from activity_ledger
-- Centralizes privacy logic and improves query performance

-- 1. Refactor get_friends_activity_for_winery
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(winery_id_param integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_favorited_by json;
    v_wishlisted_by json;
BEGIN
    -- Get friends who favorited this winery from the ledger
    SELECT json_agg(row_to_json(f_data))
    INTO v_favorited_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'favorite'
          AND (al.metadata->>'winery_id')::integer = winery_id_param
          AND al.user_id != v_user_id
          -- activity_ledger RLS already filters for general visibility,
          -- but we specifically check for friends/following for this "social" RPC
          AND (
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
            )
          )
    ) f_data;

    -- Get friends who wishlisted this winery from the ledger
    SELECT json_agg(row_to_json(w_data))
    INTO v_wishlisted_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.activity_ledger al
        JOIN public.profiles p ON al.user_id = p.id
        WHERE al.activity_type = 'wishlist'
          AND (al.metadata->>'winery_id')::integer = winery_id_param
          AND al.user_id != v_user_id
          AND (
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
            OR
            EXISTS (
              SELECT 1 FROM public.follows fol
              WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
            )
          )
    ) w_data;

    RETURN json_build_object(
        'favoritedBy', COALESCE(v_favorited_by, '[]'::json),
        'wishlistedBy', COALESCE(v_wishlisted_by, '[]'::json)
    );
END;
$$;

-- 2. Refactor get_friends_ratings_for_winery
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(winery_id_param integer)
RETURNS TABLE(user_id uuid, name text, email text, rating integer, user_review text, photos text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    RETURN QUERY
    SELECT 
        p.id as user_id,
        COALESCE(p.name, 'Friend')::text as name,
        COALESCE(p.email, 'hidden')::text as email,
        (al.metadata->>'rating')::integer as rating,
        (al.metadata->>'user_review')::text as user_review,
        CASE 
          WHEN al.metadata->'photos' IS NOT NULL AND jsonb_typeof(al.metadata->'photos') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(al.metadata->'photos'))
          ELSE ARRAY[]::text[]
        END as photos
    FROM public.activity_ledger al
    JOIN public.profiles p ON al.user_id = p.id
    WHERE al.activity_type = 'visit'
      AND (al.metadata->>'winery_id')::integer = winery_id_param
      AND al.user_id != v_user_id
      -- Social check
      AND (
        EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
        )
        OR
        EXISTS (
          SELECT 1 FROM public.follows fol
          WHERE fol.follower_id = v_user_id AND fol.following_id = p.id
        )
      )
    ORDER BY al.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_activity_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated;
