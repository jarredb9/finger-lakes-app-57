-- Migration: 20260527140000_fix_privacy_bypass_in_activity_functions.sql
-- Goal: Fix privacy bypasses in SECURITY DEFINER functions that were identified during audit.
-- These functions were incorrectly exposing 'private' activities to friends/followers.

-- 1. get_friend_activity_feed (Add privacy check)
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(p_limit integer DEFAULT 20)
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
          al.user_id != v_user_id 
          -- Privacy Check: Must be visible to viewer
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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
        LIMIT p_limit
    ) t;

    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

-- 2. get_friends_activity_for_winery (Add privacy check)
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(p_winery_id integer)
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
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          -- Privacy Check
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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
          AND (al.metadata->>'winery_id')::integer = p_winery_id
          AND al.user_id != v_user_id
          -- Privacy Check
          AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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

-- 3. get_friends_ratings_for_winery (Add privacy check)
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(p_winery_id integer)
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
      AND (al.metadata->>'winery_id')::integer = p_winery_id
      AND al.user_id != v_user_id
      -- Privacy Check
      AND public.is_visible_to_viewer(al.user_id, al.privacy_level = 'private')
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

-- 4. get_map_markers (Enforce auth.uid() matching)
CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(id integer, google_place_id text, name text, latitude numeric, longitude numeric, is_favorite boolean, on_wishlist boolean, user_visited boolean, is_favorite_private boolean, on_wishlist_private boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Security Enforcement: Only allow viewing own markers
    IF p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only view your own map markers.';
    END IF;

    RETURN QUERY
    SELECT 
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude,
        w.longitude,
        EXISTS (SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id) as is_favorite,
        EXISTS (SELECT 1 FROM public.wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id) as on_wishlist,
        EXISTS (SELECT 1 FROM public.visits v WHERE v.winery_id = w.id AND v.user_id = p_user_id) as user_visited,
        COALESCE((SELECT f.is_private FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id), false) as is_favorite_private,
        COALESCE((SELECT wi.is_private FROM public.wishlist wi WHERE wi.winery_id = w.id AND wi.user_id = p_user_id), false) as on_wishlist_private
    FROM public.wineries w;
END;
$$;

-- 5. GRANT EXECUTE to authenticated
GRANT EXECUTE ON FUNCTION public.get_friend_activity_feed(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_activity_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_ratings_for_winery(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_map_markers(uuid) TO authenticated;
