-- ============================================================================
-- Migration: 20261104100000_harden_friends_and_profiles.sql
-- Description: Hardens public.friends RLS and public.profiles column privileges
-- ADR References: ADR-0007, ADR-0010
-- Tracking: Issue #93, Phase 1 (Green phase)
-- ============================================================================

-- 1. Hardening public.friends constraints & functional indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'friends_user1_ne_user2'
  ) THEN
    ALTER TABLE public.friends
      ADD CONSTRAINT friends_user1_ne_user2 CHECK (user1_id <> user2_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_unique_pair
  ON public.friends (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));

-- 2. Hardening public.friends RLS Policies
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friends;
CREATE POLICY "Users can create friend requests"
ON public.friends FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user1_id AND status = 'pending');

DROP POLICY IF EXISTS "Users can respond to friend requests" ON public.friends;
CREATE POLICY "Users can respond to friend requests"
ON public.friends FOR UPDATE TO authenticated
USING (auth.uid() = user2_id AND status = 'pending')
WITH CHECK (status = ANY (ARRAY['accepted'::text, 'declined'::text]));

-- 3. Hardening public.profiles Case-Insensitive Email Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_email
  ON public.profiles (LOWER(email))
  WHERE email IS NOT NULL;

-- 4. Hardening public.profiles Column Privileges (ADR-0010)
-- Revoke table-level SELECT and UPDATE to prevent direct email exposure and squatting
REVOKE SELECT, UPDATE ON TABLE public.profiles FROM authenticated;

-- Grant column-level SELECT on non-sensitive profile columns
GRANT SELECT (id, name, privacy_level, ai_enabled) ON TABLE public.profiles TO authenticated;

-- Grant column-level UPDATE on mutable profile columns (excluding id and email)
GRANT UPDATE (name, privacy_level, ai_enabled) ON TABLE public.profiles TO authenticated;

-- 5. Harden send_friend_request RPC (Exact Match & Wildcard Rejection)
CREATE OR REPLACE FUNCTION public.send_friend_request(
  p_target_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  current_user_id uuid;
  v_target_user_id uuid;
  existing_request record;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Exact normalized lower-case email lookup (prevents ILIKE wildcard enumeration)
  SELECT id INTO v_target_user_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(TRIM(p_target_email));

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_target_user_id = current_user_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  SELECT * INTO existing_request
  FROM public.friends
  WHERE (user1_id = current_user_id AND user2_id = v_target_user_id)
     OR (user1_id = v_target_user_id AND user2_id = current_user_id)
  LIMIT 1;

  IF existing_request.id IS NOT NULL THEN
    IF existing_request.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends.';
    ELSIF existing_request.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent or pending.';
    ELSE
      UPDATE public.friends
      SET status = 'pending',
          user1_id = current_user_id,
          user2_id = v_target_user_id,
          updated_at = NOW()
      WHERE id = existing_request.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.friends (user1_id, user2_id, status)
  VALUES (current_user_id, v_target_user_id, 'pending');
END;
$$;

ALTER FUNCTION public.send_friend_request(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated, service_role;

-- 6. Update get_friend_profile_with_visits Projection for Column Privilege Compatibility
-- Replaces direct p.email column access with JWT claims projection for self, keeping SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(
  p_friend_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_profile jsonb;
    v_viewer_id uuid := auth.uid();
BEGIN
    IF v_viewer_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Check if the viewer is allowed to see the profile
    IF NOT public.is_visible_to_viewer(p_friend_id, false) THEN
        RETURN jsonb_build_object('error', 'Access denied due to privacy settings');
    END IF;

    -- Build profile object: project email only for self using JWT claims
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'email', CASE WHEN v_viewer_id = p_friend_id THEN (auth.jwt() ->> 'email') ELSE NULL END,
            'privacy_level', p.privacy_level
        ),
        'visits', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', v.id,
                    'visit_date', v.visit_date,
                    'rating', v.rating,
                    'user_review', v.user_review,
                    'photos', v.photos,
                    'winery', jsonb_build_object(
                        'id', w.id,
                        'google_place_id', w.google_place_id,
                        'name', w.name,
                        'address', w.address,
                        'latitude', w.latitude,
                        'longitude', w.longitude,
                        'lat', w.latitude,
                        'lng', w.longitude
                    )
                ) ORDER BY v.visit_date DESC
            ), '[]'::jsonb)
            FROM public.visits v
            JOIN public.wineries w ON v.winery_id = w.id
            WHERE v.user_id = p_friend_id 
              AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
        ),
        'stats', (
            SELECT jsonb_build_object(
                'visit_count', (
                    SELECT count(*)::int 
                    FROM public.visits v 
                    WHERE v.user_id = p_friend_id 
                      AND (v.user_id = v_viewer_id OR public.is_visible_to_viewer(v.user_id, v.is_private))
                ),
                'wishlist_count', (
                    SELECT count(*)::int 
                    FROM public.wishlist wl 
                    WHERE wl.user_id = p_friend_id 
                      AND (wl.user_id = v_viewer_id OR public.is_visible_to_viewer(wl.user_id, wl.is_private))
                ),
                'favorite_count', (
                    SELECT count(*)::int 
                    FROM public.favorites f 
                    WHERE f.user_id = p_friend_id 
                      AND (f.user_id = v_viewer_id OR public.is_visible_to_viewer(f.user_id, f.is_private))
                )
            )
        )
    ) INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_friend_id;

    RETURN v_profile;
END;
$$;

ALTER FUNCTION public.get_friend_profile_with_visits(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_friend_profile_with_visits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_profile_with_visits(uuid) TO authenticated, service_role;
