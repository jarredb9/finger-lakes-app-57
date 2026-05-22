-- Migration to add privacy settings for profiles and visits
-- Sequential timestamp: 20260224160000

-- Create privacy_level enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'privacy_level') THEN
        CREATE TYPE public.privacy_level AS ENUM ('public', 'friends_only', 'private');
    END IF;
END $$;

-- Add privacy_level to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS privacy_level public.privacy_level DEFAULT 'friends_only';

-- Add is_private to visits
ALTER TABLE public.visits 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- Add indexes for privacy-related columns to optimize RLS and queries
CREATE INDEX IF NOT EXISTS profiles_privacy_level_idx ON public.profiles (privacy_level);
CREATE INDEX IF NOT EXISTS visits_is_private_idx ON public.visits (is_private);

-- Update RLS for visits
DROP POLICY IF EXISTS "Users can view visits based on privacy settings" ON public.visits;
DROP POLICY IF EXISTS "Users can view their own and their friends' visits" ON public.visits;

CREATE POLICY "Users can view visits based on privacy settings" ON public.visits
FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR
    (
        -- Visit must not be private
        NOT is_private
        AND
        -- Profile must not be private
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = public.visits.user_id
            AND privacy_level != 'private'
            AND (
                -- If profile is public, anyone can see it
                privacy_level = 'public'
                OR
                -- If profile is friends_only, must be a friend
                (
                    privacy_level = 'friends_only'
                    AND
                    EXISTS (
                        SELECT 1 FROM public.friends
                        WHERE status = 'accepted'
                          AND (
                            (user1_id = (SELECT auth.uid()) AND user2_id = public.visits.user_id)
                            OR
                            (user2_id = (SELECT auth.uid()) AND user1_id = public.visits.user_id)
                          )
                    )
                )
            )
        )
    )
);

-- Update RLS for profiles to allow discovery
DROP POLICY IF EXISTS "Profiles are viewable based on privacy settings" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles are viewable based on privacy settings" ON public.profiles
FOR SELECT USING (
    (SELECT auth.uid()) = id
    OR
    (
        -- Not private
        privacy_level != 'private'
        AND (
            -- If public, anyone
            privacy_level = 'public'
            OR
            -- If friends_only, must be a friend
            (
                privacy_level = 'friends_only'
                AND
                EXISTS (
                    SELECT 1 FROM public.friends
                    WHERE status = 'accepted'
                      AND (
                        (user1_id = (SELECT auth.uid()) AND user2_id = public.profiles.id)
                        OR
                        (user2_id = (SELECT auth.uid()) AND user1_id = public.profiles.id)
                      )
                )
            )
        )
    )
);

-- Ensure all SEC DEFINER functions set search_path
ALTER FUNCTION public.get_friend_activity_feed(integer) SET search_path = public;
ALTER FUNCTION public.get_friends_and_requests() SET search_path = public;

-- Update get_friend_activity_feed to respect privacy settings
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
    -- 1. Aggregate activity from friends, respecting privacy settings
    SELECT jsonb_agg(row_to_json(t))
    INTO v_feed
    FROM (
        SELECT
          'visit'::text as activity_type,
          v.created_at,
          v.user_id as activity_user_id,
          COALESCE(p.name, 'Someone')::text as user_name,
          COALESCE(p.email, 'unknown')::text as user_email,
          w.id as winery_id,
          w.name::text as winery_name,
          v.rating as visit_rating,
          v.user_review as visit_review,
          COALESCE(v.photos, ARRAY[]::text[]) as visit_photos
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        LEFT JOIN public.profiles p ON v.user_id = p.id
        WHERE 
          -- Only show visits from friends
          EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user1_id = v_user_id AND f.user2_id = v.user_id)
                OR
                (f.user2_id = v_user_id AND f.user1_id = v.user_id)
              )
          )
          -- Respect visit-level privacy
          AND NOT v.is_private
          -- Respect profile-level privacy
          AND p.privacy_level != 'private'
        ORDER BY v.created_at DESC
        LIMIT limit_val
    ) t;

    -- 2. Return the flat array (or empty array if null)
    RETURN COALESCE(v_feed, '[]'::jsonb);
END;
$$;

-- New RPC to fetch friend profile and their public visits
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(friend_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_viewer_id uuid := (SELECT auth.uid());
    v_profile jsonb;
    v_is_friend boolean;
    v_privacy public.privacy_level;
BEGIN
    -- 1. Check if viewer is a friend
    SELECT EXISTS (
        SELECT 1 FROM public.friends
        WHERE status = 'accepted'
          AND (
            (user1_id = v_viewer_id AND user2_id = friend_id_param)
            OR
            (user2_id = v_viewer_id AND user1_id = friend_id_param)
          )
    ) INTO v_is_friend;

    -- 2. Get profile and privacy
    SELECT privacy_level INTO v_privacy FROM public.profiles WHERE id = friend_id_param;

    -- 3. Enforce privacy rules for profile access
    IF NOT (v_viewer_id = friend_id_param OR v_privacy = 'public' OR (v_privacy = 'friends_only' AND v_is_friend)) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- 4. Build the profile object with filtered visits
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', p.email,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            SELECT COALESCE(jsonb_agg(row_to_json(v_data)), '[]'::jsonb)
            FROM (
                SELECT 
                    v.id,
                    v.visit_date,
                    v.user_review,
                    v.rating,
                    COALESCE(v.photos, ARRAY[]::text[]) as photos,
                    jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude
                    ) as wineries
                FROM public.visits v
                JOIN public.wineries w ON v.winery_id = w.id
                WHERE v.user_id = friend_id_param
                  AND NOT v.is_private -- Always hide private visits from others
                ORDER BY v.visit_date DESC
            ) v_data
        ),
        'stats', jsonb_build_object(
            'visit_count', (SELECT count(*) FROM public.visits WHERE user_id = friend_id_param AND NOT is_private),
            'wishlist_count', (SELECT count(*) FROM public.wishlist WHERE user_id = friend_id_param),
            'favorite_count', (SELECT count(*) FROM public.favorites WHERE user_id = friend_id_param)
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = friend_id_param;

    RETURN v_profile;
END;
$$;

-- Update log_visit to support is_private
CREATE OR REPLACE FUNCTION public.log_visit(
  p_winery_data jsonb,
  p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (p_winery_data->>'lat')::numeric,
    (p_winery_data->>'lng')::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    google_rating = EXCLUDED.google_rating
  RETURNING id INTO v_winery_id;

  -- Insert Visit
  INSERT INTO public.visits (
    user_id,
    winery_id,
    visit_date,
    user_review,
    rating,
    photos,
    is_private
  )
  VALUES (
    v_user_id,
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    COALESCE((p_visit_data->>'is_private')::boolean, FALSE)
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- Update update_visit to support is_private
CREATE OR REPLACE FUNCTION public.update_visit(
    p_visit_id integer,
    p_visit_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_updated_record record;
BEGIN
    UPDATE public.visits
    SET 
        visit_date = COALESCE((p_visit_data->>'visit_date')::date, visit_date),
        user_review = COALESCE(p_visit_data->>'user_review', user_review),
        rating = COALESCE((p_visit_data->>'rating')::integer, rating),
        photos = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') x), photos),
        is_private = COALESCE((p_visit_data->>'is_private')::boolean, is_private),
        updated_at = NOW()
    WHERE id = p_visit_id AND user_id = v_user_id
    RETURNING * INTO v_updated_record;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found or unauthorized';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'id', v.id,
            'user_id', v.user_id,
            'visit_date', v.visit_date,
            'rating', v.rating,
            'user_review', v.user_review,
            'photos', v.photos,
            'is_private', v.is_private,
            'winery_id', v.winery_id,
            'winery_name', w.name,
            'winery_address', w.address,
            'google_place_id', w.google_place_id
        )
        FROM public.visits v
        JOIN public.wineries w ON v.winery_id = w.id
        WHERE v.id = v_updated_record.id
    );
END;
$$;

-- RPC to update profile privacy
CREATE OR REPLACE FUNCTION public.update_profile_privacy(p_privacy_level public.privacy_level)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    UPDATE public.profiles
    SET privacy_level = p_privacy_level
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'privacy_level', p_privacy_level);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_privacy(public.privacy_level) TO authenticated;

-- Update get_friends_activity_for_winery to respect privacy
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
    -- Get friends who favorited this winery, respecting privacy
    SELECT json_agg(row_to_json(f_data))
    INTO v_favorited_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.favorites fav
        JOIN public.profiles p ON fav.user_id = p.id
        WHERE fav.winery_id = winery_id_param
          AND p.privacy_level != 'private' -- Respect profile privacy
          AND (
            p.privacy_level = 'public'
            OR
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
          )
    ) f_data;

    -- Get friends who wishlisted this winery, respecting privacy
    SELECT json_agg(row_to_json(w_data))
    INTO v_wishlisted_by
    FROM (
        SELECT p.id, p.name, p.email
        FROM public.wishlist wish
        JOIN public.profiles p ON wish.user_id = p.id
        WHERE wish.winery_id = winery_id_param
          AND p.privacy_level != 'private' -- Respect profile privacy
          AND (
            p.privacy_level = 'public'
            OR
            EXISTS (
                SELECT 1 FROM public.friends fr
                WHERE fr.status = 'accepted'
                  AND (
                    (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                    OR
                    (fr.user2_id = v_user_id AND fr.user1_id = p.id)
                  )
            )
          )
    ) w_data;

    RETURN json_build_object(
        'favoritedBy', COALESCE(v_favorited_by, '[]'::json),
        'wishlistedBy', COALESCE(v_wishlisted_by, '[]'::json)
    );
END;
$$;

-- Update get_friends_ratings_for_winery to respect privacy
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
        v.rating,
        v.user_review,
        COALESCE(v.photos, ARRAY[]::text[]) as photos
    FROM public.visits v
    JOIN public.profiles p ON v.user_id = p.id
    WHERE v.winery_id = winery_id_param
      AND v.user_id != v_user_id -- Exclude current user
      AND NOT v.is_private -- Respect visit privacy
      AND p.privacy_level != 'private' -- Respect profile privacy
      AND (
        p.privacy_level = 'public'
        OR
        EXISTS (
            SELECT 1 FROM public.friends fr
            WHERE fr.status = 'accepted'
              AND (
                (fr.user1_id = v_user_id AND fr.user2_id = p.id)
                OR
                (fr.user2_id = v_user_id AND fr.user1_id = p.id)
              )
        )
      )
    ORDER BY v.visit_date DESC;
END;
$$;
