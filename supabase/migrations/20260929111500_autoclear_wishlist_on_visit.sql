-- Migration: 20260929111500_autoclear_wishlist_on_visit.sql
-- Description: Auto-clear winery from wishlist upon visit logging and retrospective cleanup (Issue #54 / ADR-0001)

-- ============================================================================
-- 1. One-time retrospective data cleanup: clear wishlist for visited wineries
-- ============================================================================
DELETE FROM public.wishlist w
WHERE EXISTS (
  SELECT 1 FROM public.visits v
  WHERE v.user_id = w.user_id AND v.winery_id = w.winery_id
);

-- ============================================================================
-- 2. Update public.log_visit to atomically delete wishlist entry
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."log_visit"(
  "p_winery_data" "jsonb",
  "p_visit_data" "jsonb",
  "p_idempotency_key" "uuid" DEFAULT NULL::"uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_winery_id integer;
  v_visit_id integer;
  v_photos text[];
  v_is_private boolean;
  v_user_id uuid := auth.uid();
BEGIN
  -- Idempotency check: if already processed, return existing visit record directly
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, winery_id INTO v_visit_id, v_winery_id
    FROM public.visits
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
    END IF;
  END IF;

  -- Extract photos array safely
  SELECT COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(p_visit_data->'photos') t(x)),
    ARRAY[]::text[]
  ) INTO v_photos;

  -- Extract is_private flag
  v_is_private := COALESCE((p_visit_data->>'is_private')::boolean, false);

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
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
    is_private,
    idempotency_key
  )
  VALUES (
    v_user_id,
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_visit_id;

  IF v_visit_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_visit_id FROM public.visits WHERE idempotency_key = p_idempotency_key;
  END IF;

  -- Auto-clear wishlist entry for visited winery (ADR-0001 / Issue #54)
  DELETE FROM public.wishlist
  WHERE user_id = v_user_id AND winery_id = v_winery_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb", "p_idempotency_key" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb", "p_idempotency_key" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."log_visit"("p_winery_data" "jsonb", "p_visit_data" "jsonb", "p_idempotency_key" "uuid") TO "authenticated";
