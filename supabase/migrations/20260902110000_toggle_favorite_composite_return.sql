-- Migration: 20260902110000_toggle_favorite_composite_return.sql
-- Description: Update toggle_favorite and toggle_wishlist to return jsonb composite payload { is_favorite/on_wishlist, winery_id } for single-roundtrip RPCs (BE-10, BE-15).

-- ============================================================================
-- 1. Drop existing functions to allow return type signature change
-- ============================================================================

DROP FUNCTION IF EXISTS public.toggle_favorite(jsonb);
DROP FUNCTION IF EXISTS public.toggle_wishlist(jsonb);

-- ============================================================================
-- 2. Create toggle_favorite with composite jsonb return
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_favorite(p_winery_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_winery_id integer;
  v_exists boolean;
  v_is_favorite boolean;
BEGIN
  -- Strict Parameter Validation (BE-15)
  IF p_winery_data IS NULL OR jsonb_typeof(p_winery_data) != 'object' THEN
    RAISE EXCEPTION 'Invalid winery data: payload must be a JSON object';
  END IF;

  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure winery exists in DB
  v_winery_id := ensure_winery(p_winery_data);
  IF v_winery_id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure winery record';
  END IF;

  -- Check if already a favorite
  SELECT EXISTS (
    SELECT 1 FROM public.favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM public.favorites 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    v_is_favorite := false;
  ELSE
    -- Add
    INSERT INTO favorites (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    v_is_favorite := true;
  END IF;

  RETURN jsonb_build_object('is_favorite', v_is_favorite, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION public.toggle_favorite(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_favorite(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_favorite(jsonb) TO authenticated, service_role;

-- ============================================================================
-- 3. Create toggle_wishlist with composite jsonb return
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_winery_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_winery_id integer;
  v_exists boolean;
  v_on_wishlist boolean;
BEGIN
  -- Strict Parameter Validation (BE-15)
  IF p_winery_data IS NULL OR jsonb_typeof(p_winery_data) != 'object' THEN
    RAISE EXCEPTION 'Invalid winery data: payload must be a JSON object';
  END IF;

  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Ensure winery exists in DB
  v_winery_id := ensure_winery(p_winery_data);
  IF v_winery_id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure winery record';
  END IF;

  -- Check if already in wishlist
  SELECT EXISTS (
    SELECT 1 FROM public.wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove
    DELETE FROM public.wishlist 
    WHERE user_id = v_user_id AND winery_id = v_winery_id;
    v_on_wishlist := false;
  ELSE
    -- Add
    INSERT INTO wishlist (user_id, winery_id)
    VALUES (v_user_id, v_winery_id);
    v_on_wishlist := true;
  END IF;

  RETURN jsonb_build_object('on_wishlist', v_on_wishlist, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION public.toggle_wishlist(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_wishlist(jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_wishlist(jsonb) TO authenticated, service_role;
