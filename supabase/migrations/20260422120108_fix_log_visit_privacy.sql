-- Fix log_visit to properly handle is_private flag
-- This restores the privacy functionality that was accidentally removed in the previous sync migration.

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
  v_is_private boolean;
BEGIN
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
    (SELECT auth.uid()),
    v_winery_id,
    (p_visit_data->>'visit_date')::date,
    p_visit_data->>'user_review',
    (p_visit_data->>'rating')::int,
    v_photos,
    v_is_private
  )
  RETURNING id INTO v_visit_id;

  RETURN jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id);
END;
$$;

-- Also fix add_to_wishlist just in case it's used in the future
CREATE OR REPLACE FUNCTION public.add_to_wishlist(p_winery_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_winery_id integer;
  v_is_private boolean;
BEGIN
  -- Extract is_private from p_winery_data or visit_data context if applicable
  -- For wishlist, it might be in p_winery_data for now
  v_is_private := COALESCE((p_winery_data->>'is_private')::boolean, false);

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
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Insert into Wishlist
  INSERT INTO public.wishlist (user_id, winery_id, is_private)
  VALUES (auth.uid(), v_winery_id, v_is_private)
  ON CONFLICT (user_id, winery_id) 
  DO UPDATE SET is_private = EXCLUDED.is_private;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;
